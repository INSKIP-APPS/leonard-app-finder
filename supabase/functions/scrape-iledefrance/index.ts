// ──────────────────────────────────────────────────────────────────────
// Edge Function : scrape-iledefrance (veille France — AAP Région Île-de-France)
//
// Interroge l'open-data régional (Opendatasoft) — dataset "aides-appels-a-projets"
// (~339 enregistrements) — filtre sur les thématiques VINCI et les appels non
// clôturés, mappe au schéma AAP, upsert avec source="Région Île-de-France (opendata)".
//
// API publique, sans clé, limites généreuses. Deltas cantonnés à la source.
// ──────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";

const DS = "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/aides-appels-a-projets/records";
const SOURCE = "Région Île-de-France (opendata)";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const THEME_KW: Record<string, string[]> = {
  "Construction & BTP": ["bâtiment", "génie civil", "btp", "chantier", "travaux publics", "logement social"],
  "Rénovation bâtiment": ["rénovation", "réhabilitation", "isolation"],
  "Transition énergétique": ["transition énergétique", "énergie", "chaleur"],
  "Énergies renouvelables": ["renouvelable", "solaire", "photovolta", "éolien", "biomasse", "géotherm"],
  "Efficacité énergétique": ["efficacité énergétique", "économie d'énergie", "performance énergétique"],
  "Décarbonation industrie": ["décarbonation", "industrie", "bas-carbone", "bas carbone"],
  "Mobilité décarbonée": ["mobilité", "transport", "véhicule", "recharge", "logistique", "vélo", "cyclable"],
  "Hydrogène": ["hydrogène"],
  "Numérique (IA / IoT / BIM)": ["numérique", "intelligence artificielle", "iot", "bim", "digital", "logiciel", "données"],
  "Robotique & automatisation": ["robot", "automatis"],
  "Économie circulaire": ["économie circulaire", "recycl", "réemploi", "déchets", "réutilisation", "plastique"],
  "Matériaux & biosourcés": ["biosourcé", "matériau", "bois"],
  "Gestion de l'eau": ["eau potable", "assainissement", "eaux pluviales", "gestion de l'eau"],
  "Adaptation climatique": ["adaptation", "climat", "résilience", "inondation", "sécheresse", "îlot de chaleur"],
  "Infrastructures durables": ["infrastructure", "voirie", "réseaux", "ferroviaire"],
  "Aménagement & urbanisme": ["urbanisme", "aménagement", "ville", "immobilier", "foncier"],
  "Recherche & développement": ["recherche", "innovation", "r&d", "démonstrateur", "industriel", "réindustrialisation", "start-up", "jeune pousse"],
};
function extractThematiques(text: string): string[] {
  const h = (text || "").toLowerCase();
  return Object.keys(THEME_KW).filter((label) => THEME_KW[label].some((kw) => h.includes(kw)));
}
function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }
function clean(s: string) { return (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim(); }

type DispRow = { id: string; programme: string | null; nom: string; organisme: string | null };
function mapDispositif(titre: string, disp: DispRow[]): string | null {
  const tokens = [...new Set(norm(`ile de france region ${titre}`).split(/[^a-z0-9]+/))].filter((w) => w.length >= 4);
  let best: { id: string; score: number } | null = null;
  for (const d of disp) {
    const hay = norm(`${d.organisme ?? ""} ${d.programme ?? ""} ${d.nom}`);
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: d.id, score };
  }
  return best && best.score >= 6 ? best.id : null;
}

interface Rec {
  id_aide?: string; nom_de_l_aide_de_la_demarche?: string; titre_alternatif_de_l_aide?: string;
  objectif_txt?: string; chapo_txt?: string; modalite_txt?: string;
  date_ouverture?: string | null; date_cloture?: string | null;
  qui_peut_en_beneficier?: string[]; theme?: string[]; mots_cles?: string[]; url_descriptif?: string;
}
function toAAP(r: Rec, disp: DispRow[], scrapedAt: string, now: number) {
  const titre = (r.nom_de_l_aide_de_la_demarche || r.titre_alternatif_de_l_aide || "").trim();
  const desc = ([clean(r.objectif_txt ?? ""), clean(r.chapo_txt ?? "")].filter(Boolean).join(" ") || clean(r.modalite_txt ?? "")).slice(0, 4000);
  const thematiques = extractThematiques(`${titre}. ${desc}. ${(r.theme ?? []).join(" ")}. ${(r.mots_cles ?? []).join(" ")}`);
  const dclo = r.date_cloture || null;
  const douv = r.date_ouverture || null;
  const closed = dclo ? Date.parse(dclo) < now : false;
  const statut = closed ? "closed" : douv && Date.parse(douv) > now ? "forthcoming" : "open";
  return {
    id: `IDF-${r.id_aide}`,
    titre,
    programme: "Région Île-de-France",
    pilier: null, cluster: null, call_identifier: null,
    description: desc,
    type_action: "Appel à projets",
    type_action_detail: (r.theme ?? []).join(" | ") || null,
    statut,
    date_ouverture: douv, date_cloture: dclo,
    budget_total: null, budget_par_projet: null, trl_min: null, trl_max: null,
    mots_cles: [...new Set([...thematiques, ...(r.mots_cles ?? [])])].slice(0, 20),
    thematiques,
    acteurs_eligibles: (r.qui_peut_en_beneficier ?? []).map((x) => x.split(" - ")[0].trim()).slice(0, 8),
    lien_officiel: r.url_descriptif || "https://www.iledefrance.fr/aides-et-appels-a-projets",
    dispositif_id: mapDispositif(titre, disp),
    echelle: "Régional",
    source: SOURCE,
    date_scraping: scrapedAt,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const started = Date.now();
  const now = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const scrapedAt = new Date().toISOString();

  try {
    const { data: dispRows } = await supabase.from("dispositifs").select("id, programme, nom, organisme").in("echelle", ["National", "Régional"]);
    const disp = (dispRows ?? []) as DispRow[];

    // Pagination Opendatasoft (limit max 100)
    const all: Rec[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const res = await fetch(`${DS}?limit=100&offset=${offset}`, { headers: { "User-Agent": "leonard-aap-finder/1.0", Accept: "application/json" } });
      if (!res.ok) break;
      const j = await res.json();
      const recs = (j.results ?? []) as Rec[];
      all.push(...recs);
      if (recs.length < 100) break;
    }

    // Filtre : thématique VINCI présente ET appel non clôturé
    const byId = new Map<string, ReturnType<typeof toAAP>>();
    for (const r of all) {
      if (!r.id_aide) continue;
      const aap = toAAP(r, disp, scrapedAt, now);
      // Inclusion basée sur le TITRE + la taxonomie IdF (signal fort) — évite les
      // faux positifs dus à des mentions incidentes dans la description longue.
      const titleThemes = extractThematiques(`${r.nom_de_l_aide_de_la_demarche ?? ""} ${r.titre_alternatif_de_l_aide ?? ""}`);
      if (!aap.titre || titleThemes.length === 0 || aap.statut === "closed") continue;
      byId.set(aap.id, aap);
    }
    const aaps = [...byId.values()];

    const { data: existing } = await supabase.from("aaps").select("id").eq("source", SOURCE);
    const existingIds = new Set((existing ?? []).map((x: { id: string }) => x.id));
    const nouveaux = aaps.filter((a) => !existingIds.has(a.id)).length;
    const mis_a_jour = aaps.length - nouveaux;

    const rows = aaps.map((a) => ({
      id: a.id, titre: a.titre, programme: a.programme, pilier: a.pilier, cluster: a.cluster,
      statut: a.statut, type_action: a.type_action, date_ouverture: a.date_ouverture, date_cloture: a.date_cloture,
      budget_total: a.budget_total, budget_par_projet: a.budget_par_projet, trl_min: a.trl_min, trl_max: a.trl_max,
      thematiques: a.thematiques, dispositif_id: a.dispositif_id, data: a, date_scraping: a.date_scraping,
      source: SOURCE, updated_at: scrapedAt,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("aaps").upsert(rows.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(`upsert: ${error.message}`);
    }

    const duration_ms = Date.now() - started;
    await supabase.from("scrape_logs").insert({ source: SOURCE, fetched: aaps.length, nouveaux, mis_a_jour, fermes: 0, duration_ms, ok: true });
    return json({ ok: true, fetched: aaps.length, total_dataset: all.length, nouveaux, mis_a_jour, duration_ms });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("scrape_logs").insert({ source: SOURCE, ok: false, error: msg, duration_ms: Date.now() - started });
    return json({ ok: false, error: msg }, 500);
  }
});
