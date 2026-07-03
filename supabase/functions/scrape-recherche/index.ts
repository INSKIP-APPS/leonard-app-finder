// ──────────────────────────────────────────────────────────────────────
// Edge Function : scrape-recherche (enrichissement one-shot — AAP recherche FR)
//
// Récupère le CSV officiel du portail appelsprojetsrecherche.fr (/export-csv),
// qui agrège les appels à projets de l'ANR, l'ADEME, l'INCa, l'Inserm, l'Anses,
// des conseils régionaux et fondations de recherche. Mappe au schéma AAP et
// upsert dans `aaps` avec source="appelsprojetsrecherche.fr" (programme = financeur).
//
// Colonnes CSV (délimiteur ";", quotes RFC4180, descriptions multi-lignes) :
//   Partenaire ; Titre ; Description ; Date de publication ; Date d'ouverture ;
//   Date de clôture ; Lien de l'appel à projets ; Date de mise à jour sur le portail
//
// ⚠️ ENRICHISSEMENT ONE-SHOT : cette fonction n'est PAS branchée au cron.
//   Elle fait uniquement de l'UPSERT (jamais de fermeture d'AAP), pour ne pas
//   interférer avec les autres sources. Aucune clé API requise (CSV public).
// ──────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";

const CSV_URL = "https://www.appelsprojetsrecherche.fr/export-csv";
const SOURCE = "appelsprojetsrecherche.fr";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ── Taxonomie thématique (alignée sur les autres connecteurs) ──────────
const THEME_KW: Record<string, string[]> = {
  "Construction & BTP": ["construction", "bâtiment", "génie civil", "btp", "travaux"],
  "Rénovation bâtiment": ["rénovation", "réhabilitation", "isolation"],
  "Transition énergétique": ["transition énergétique", "énergie", "chaleur"],
  "Énergies renouvelables": ["renouvelable", "solaire", "photovolta", "éolien", "biomasse", "géotherm"],
  "Efficacité énergétique": ["efficacité énergétique", "économie d'énergie", "performance énergétique"],
  "Décarbonation industrie": ["décarbonation", "industrie", "bas-carbone", "bas carbone"],
  "Mobilité décarbonée": ["mobilité", "transport", "véhicule", "recharge", "bornes", "logistique"],
  "Hydrogène": ["hydrogène"],
  "Numérique (IA / IoT / BIM)": ["numérique", "intelligence artificielle", "iot", "bim", "digital", "logiciel", "données", "data"],
  "Robotique & automatisation": ["robot", "automatis"],
  "Économie circulaire": ["économie circulaire", "recycl", "réemploi", "déchets", "réutilisation"],
  "Matériaux & biosourcés": ["biosourcé", "matériau", "bois"],
  "Gestion de l'eau": ["eau potable", "assainissement", "eaux pluviales", "gestion de l'eau", "ressources en eau"],
  "Adaptation climatique": ["adaptation", "climat", "résilience", "inondation", "sécheresse"],
  "Infrastructures durables": ["infrastructure", "voirie", "réseaux", "ferroviaire"],
  "Aménagement & urbanisme": ["urbanisme", "aménagement", "ville", "immobilier"],
  "Recherche & développement": ["recherche", "innovation", "r&d", "jei", "cir", "démonstrateur", "pepr"],
};
function extractThematiques(text: string): string[] {
  const h = (text || "").toLowerCase();
  return Object.keys(THEME_KW).filter((label) => THEME_KW[label].some((kw) => h.includes(kw)));
}
function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }

type DispRow = { id: string; programme: string | null; nom: string; organisme: string | null };
function mapDispositif(titre: string, financeur: string, disp: DispRow[]): string | null {
  const tokens = [...new Set([...norm(financeur).split(/[^a-z0-9]+/), ...norm(titre).split(/[^a-z0-9]+/)])].filter((w) => w.length >= 4);
  let best: { id: string; score: number } | null = null;
  for (const d of disp) {
    const hay = norm(`${d.organisme ?? ""} ${d.programme ?? ""} ${d.nom}`);
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: d.id, score };
  }
  return best && best.score >= 4 ? best.id : null;
}

// ── Parseur CSV RFC4180 (délimiteur ";", gère quotes & sauts de ligne) ──
function parseCsv(text: string, delim = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\r") { /* ignore */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// "02/07/2026 11:00" → "2026-07-02T11:00:00.000Z" (best-effort, null si vide)
function frToIso(s: string): string | null {
  const m = (s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "00", mi = "00"] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00.000Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Slug stable depuis le lien /appel/{slug} → id "APR-{slug}"
function idFromLien(lien: string, index: number): string {
  const m = (lien || "").match(/\/appel\/([^/?#]+)/);
  return m ? `APR-${m[1]}` : `APR-row${index}`;
}

async function fetchCsv(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LeonardVeille/1.0)",
          "Accept": "text/csv,*/*",
          "Accept-Encoding": "identity",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) { lastErr = e; }
  }
  throw new Error(`fetch CSV échoué: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const started = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const scrapedAt = new Date().toISOString();
  const now = Date.now();

  try {
    const csv = await fetchCsv(CSV_URL);
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new Error("CSV vide ou illisible");

    // En-tête → index de colonnes (robuste à l'ordre), en normalisant le BOM.
    const header = rows[0].map((h) => norm(h.replace(/^﻿/, "")));
    const col = (needle: string) => header.findIndex((h) => h.includes(needle));
    const iPart = col("partenaire"), iTit = col("titre"), iDesc = col("description");
    const iOuv = col("ouverture"), iClo = col("cloture"), iPub = col("publication"), iLien = col("lien");

    const { data: dispRows } = await supabase.from("dispositifs").select("id, programme, nom, organisme").in("echelle", ["National", "Régional"]);
    const disp = (dispRows ?? []) as DispRow[];

    const byId = new Map<string, ReturnType<typeof mapRow>>();
    function mapRow(r: string[], idx: number) {
      const financeur = (r[iPart] ?? "").replace(/^﻿/, "").trim() || "Recherche";
      const titre = (r[iTit] ?? "").trim();
      const description = (r[iDesc] ?? "").trim();
      const lien = (r[iLien] ?? "").trim();
      const date_ouverture = frToIso(r[iOuv] ?? "");
      const date_cloture = frToIso(r[iClo] ?? "");
      const date_publication = frToIso(r[iPub] ?? "");
      const cloMs = date_cloture ? Date.parse(date_cloture) : null;
      const ouvMs = date_ouverture ? Date.parse(date_ouverture) : null;
      const statut = cloMs && cloMs < now ? "closed" : ouvMs && ouvMs > now ? "forthcoming" : "open";
      const echelle = /r[ée]gion/i.test(financeur) ? "Régional" : "National";
      const thematiques = extractThematiques(`${titre}. ${description}`);
      return {
        id: idFromLien(lien, idx),
        titre,
        programme: financeur,
        pilier: null, cluster: null, call_identifier: null,
        description,
        type_action: "Appel à projets",
        type_action_detail: null,
        statut,
        date_ouverture, date_cloture,
        budget_total: null, budget_par_projet: null, trl_min: null, trl_max: null,
        mots_cles: thematiques,
        thematiques,
        acteurs_eligibles: ["Recherche", "Entreprise"],
        lien_officiel: lien || "https://www.appelsprojetsrecherche.fr",
        dispositif_id: mapDispositif(titre, financeur, disp),
        echelle,
        source: SOURCE,
        date_publication,
        date_scraping: scrapedAt,
      };
    }

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every((c) => !c.trim())) continue; // ligne vide
      const aap = mapRow(r, i);
      if (aap.titre) byId.set(aap.id, aap); // dédup par id, ignore titres vides
    }
    const aaps = [...byId.values()];

    const { data: existing } = await supabase.from("aaps").select("id").eq("source", SOURCE);
    const existingIds = new Set((existing ?? []).map((x: { id: string }) => x.id));
    const nouveaux = aaps.filter((a) => !existingIds.has(a.id)).length;
    const mis_a_jour = aaps.length - nouveaux;

    const dbRows = aaps.map((a) => ({
      id: a.id, titre: a.titre, programme: a.programme, pilier: a.pilier, cluster: a.cluster,
      statut: a.statut, type_action: a.type_action, date_ouverture: a.date_ouverture, date_cloture: a.date_cloture,
      budget_total: a.budget_total, budget_par_projet: a.budget_par_projet, trl_min: a.trl_min, trl_max: a.trl_max,
      thematiques: a.thematiques, dispositif_id: a.dispositif_id, data: a, date_scraping: a.date_scraping,
      source: SOURCE, updated_at: scrapedAt,
    }));
    for (let i = 0; i < dbRows.length; i += 200) {
      const { error } = await supabase.from("aaps").upsert(dbRows.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(`upsert: ${error.message}`);
    }

    const duration_ms = Date.now() - started;
    await supabase.from("scrape_logs").insert({ source: SOURCE, fetched: aaps.length, nouveaux, mis_a_jour, fermes: 0, duration_ms, ok: true });
    return json({ ok: true, fetched: aaps.length, nouveaux, mis_a_jour, duration_ms });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("scrape_logs").insert({ source: SOURCE, ok: false, error: msg, duration_ms: Date.now() - started });
    return json({ ok: false, error: msg }, 500);
  }
});
