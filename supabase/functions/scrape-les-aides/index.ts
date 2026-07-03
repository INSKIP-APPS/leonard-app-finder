// ──────────────────────────────────────────────────────────────────────
// Edge Function : scrape-les-aides (Phase 6 — veille France, aides entreprises)
//
// Interroge l'API les-aides.fr (CCI) par matrice code APE × domaine (les aides
// mobilisables par les métiers VINCI, dont Bpifrance), dédup par `numero`,
// mappe au schéma AAP et upsert dans `aaps` avec source="les-aides.fr".
// Catalogue d'aides permanentes → pas de deadline. Deltas cantonnés à la source.
//
// Auth : header X-IDC (secret LES_AIDES_IDC).
// ──────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.les-aides.fr";
const SOURCE = "les-aides.fr";

// Métiers VINCI (codes NAF) × domaines. Matrice volontairement réduite : les aides
// nationales remontent quel que soit l'APE (dédup), et l'API les-aides.fr est lente
// → on borne à 8 requêtes pour rester dans les limites de l'Edge runtime.
const APE = ["4120B", "7112B"]; // bâtiment/GC, ingénierie
const DOMAINES = [807, 813, 883, 862]; // Innovation, Transition éco, France 2030, Numérique

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const THEME_KW: Record<string, string[]> = {
  "Construction & BTP": ["construction", "bâtiment", "génie civil", "btp", "travaux"],
  "Rénovation bâtiment": ["rénovation", "réhabilitation", "isolation"],
  "Transition énergétique": ["transition énergétique", "énergie", "chaleur"],
  "Énergies renouvelables": ["renouvelable", "solaire", "photovolta", "éolien", "biomasse", "géotherm"],
  "Efficacité énergétique": ["efficacité énergétique", "économie d'énergie", "performance énergétique"],
  "Décarbonation industrie": ["décarbonation", "industrie", "bas-carbone", "bas carbone"],
  "Mobilité décarbonée": ["mobilité", "transport", "véhicule", "recharge", "bornes"],
  "Hydrogène": ["hydrogène"],
  "Numérique (IA / IoT / BIM)": ["numérique", "intelligence artificielle", "iot", "bim", "digital", "logiciel"],
  "Robotique & automatisation": ["robot", "automatis"],
  "Économie circulaire": ["économie circulaire", "recycl", "réemploi", "déchets", "réutilisation"],
  "Matériaux & biosourcés": ["biosourcé", "matériau", "bois"],
  "Gestion de l'eau": ["eau potable", "assainissement", "eaux pluviales", "gestion de l'eau"],
  "Adaptation climatique": ["adaptation", "climat", "résilience", "inondation", "sécheresse"],
  "Infrastructures durables": ["infrastructure", "voirie", "réseaux", "ferroviaire"],
  "Aménagement & urbanisme": ["urbanisme", "aménagement", "ville", "immobilier"],
  "Recherche & développement": ["recherche", "innovation", "r&d", "jei", "cir", "démonstrateur"],
};
function extractThematiques(text: string): string[] {
  const h = (text || "").toLowerCase();
  return Object.keys(THEME_KW).filter((label) => THEME_KW[label].some((kw) => h.includes(kw)));
}
function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}
function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }

// Nettoyage du HTML DOUBLE-encodé renvoyé par l'endpoint /aide (objet, conditions, montants).
function cleanDetail(h: string): string {
  const once = (h || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");
  return once.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}
// Extraction best-effort d'un montant € depuis le texte "montants".
function parseMontant(txt: string): number | null {
  const s = (txt || "").toLowerCase();
  const m = s.match(/(\d[\d\s.,]{2,})\s*(m€|meur|millions?|k€|keur|milliers?|€|eur)/);
  if (!m) return null;
  const num = m[1].replace(/[^\d]/g, "");
  if (!num) return null;
  let v = parseInt(num, 10);
  const u = m[2];
  if (u.startsWith("m") || u.includes("million")) v *= 1_000_000;
  else if (u.startsWith("k") || u.includes("millier")) v *= 1_000;
  return v >= 1000 && v <= 500_000_000 ? v : null;
}

type DispRow = { id: string; programme: string | null; nom: string; organisme: string | null };
function mapDispositif(nom: string, sigle: string, disp: DispRow[]): string | null {
  const tokens = [...new Set([...norm(sigle).split(/[^a-z0-9]+/), ...norm(nom).split(/[^a-z0-9]+/)])].filter((w) => w.length >= 4);
  let best: { id: string; score: number } | null = null;
  for (const d of disp) {
    const hay = norm(`${d.organisme ?? ""} ${d.programme ?? ""} ${d.nom}`);
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: d.id, score };
  }
  return best && best.score >= 4 ? best.id : null;
}

interface Dispo {
  numero: number; nom: string; resume?: string; sigle?: string; implantation?: string;
  domaines?: number[]; moyens?: Array<{ libelle?: string }>; uri?: string;
}
function toAAP(d: Dispo, disp: DispRow[], scrapedAt: string) {
  const description = stripHtml(d.resume ?? "");
  const echelle = (d.implantation ?? "").toUpperCase() === "N" ? "National" : "Régional";
  const thematiques = extractThematiques(`${d.nom}. ${description}`);
  return {
    id: `LA-${d.numero}`,
    titre: d.nom,
    programme: d.sigle || "les-aides.fr",
    pilier: null, cluster: null, call_identifier: null,
    description,
    type_action: (d.moyens ?? [])[0]?.libelle || "Aide",
    type_action_detail: (d.moyens ?? []).map((m) => m.libelle).filter(Boolean).join(" | ") || null,
    statut: "open", // catalogue permanent
    date_ouverture: null, date_cloture: null,
    budget_total: null, budget_par_projet: null, trl_min: null, trl_max: null,
    mots_cles: thematiques,
    thematiques,
    acteurs_eligibles: ["Entreprise"],
    lien_officiel: d.uri || "https://les-aides.fr",
    dispositif_id: mapDispositif(d.nom, d.sigle ?? "", disp),
    echelle,
    source: SOURCE,
    date_scraping: scrapedAt,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const started = Date.now();
  const idc = Deno.env.get("LES_AIDES_IDC");
  if (!idc) return json({ error: "not_configured", message: "Secret LES_AIDES_IDC absent." }, 503);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const scrapedAt = new Date().toISOString();
  const H = { "X-IDC": idc, Accept: "application/json" };

  try {
    const { data: dispRows } = await supabase.from("dispositifs").select("id, programme, nom, organisme").in("echelle", ["National", "Régional"]);
    const disp = (dispRows ?? []) as DispRow[];

    // Matrice APE × domaine, dédup par numéro. On mémorise l'idr + le numéro
    // de chaque dispositif pour pouvoir interroger l'endpoint DÉTAIL ensuite.
    const byId = new Map<string, ReturnType<typeof toAAP>>();
    const meta = new Map<string, { idr: string; num: number }>();
    for (const ape of APE) {
      for (const dom of DOMAINES) {
        const r = await fetch(`${API}/aides/?ape=${ape}&domaine=${dom}`, { headers: H });
        if (!r.ok) continue; // profil sans résultat / quota / erreur ponctuelle → on continue
        const j = await r.json();
        for (const d of (j.dispositifs ?? []) as Dispo[]) {
          const aap = toAAP(d, disp, scrapedAt);
          if (!byId.has(aap.id)) { byId.set(aap.id, aap); meta.set(aap.id, { idr: j.idr, num: d.numero }); }
        }
      }
    }
    const aaps = [...byId.values()];

    const { data: existing } = await supabase.from("aaps").select("id").eq("source", SOURCE);
    const existingIds = new Set((existing ?? []).map((x: { id: string }) => x.id));
    const nouveaux = aaps.filter((a) => !existingIds.has(a.id)).length;
    const mis_a_jour = aaps.length - nouveaux;

    // ── Enrichissement DÉTAIL incrémental (objet + conditions + montants) ──
    // L'API les-aides applique un quota journalier de requêtes : on enrichit donc
    // un petit lot par exécution (les non-enrichis d'abord), et on s'arrête net si
    // le quota est atteint (réponse non-ok) — sans jamais faire échouer le scrape.
    const { data: enrRows } = await supabase.from("aaps").select("id").eq("source", SOURCE).not("data->>montants", "is", null);
    const enrichedIds = new Set((enrRows ?? []).map((x: { id: string }) => x.id));
    const MAX_DETAIL = 20;
    let enriched = 0;
    for (const a of aaps) {
      if (enriched >= MAX_DETAIL) break;
      if (enrichedIds.has(a.id)) continue; // déjà enrichi lors d'un run précédent
      const m = meta.get(a.id);
      if (!m?.idr) continue;
      try {
        const dr = await fetch(`${API}/aide/?requete=${m.idr}&dispositif=${m.num}`, { headers: H });
        if (!dr.ok) break; // quota atteint → on arrête l'enrichissement pour ce run
        const det = await dr.json();
        const objet = cleanDetail(det.objet ?? "");
        const conditions = cleanDetail(det.conditions ?? "");
        const montants = cleanDetail(det.montants ?? "");
        const desc = [objet, conditions ? `Conditions : ${conditions}` : ""].filter(Boolean).join(" ").slice(0, 5000);
        if (desc.length >= 60) a.description = desc;
        if (montants) {
          (a as Record<string, unknown>).montants = montants.slice(0, 1500);
          const b = parseMontant(montants);
          if (b) a.budget_par_projet = b;
        }
        a.thematiques = extractThematiques(`${a.titre}. ${a.description}`);
        a.mots_cles = [...new Set([...a.thematiques, ...a.mots_cles])].slice(0, 20);
        enriched++;
      } catch { break; }
    }

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
    return json({ ok: true, fetched: aaps.length, nouveaux, mis_a_jour, enriched, duration_ms });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("scrape_logs").insert({ source: SOURCE, ok: false, error: msg, duration_ms: Date.now() - started });
    return json({ ok: false, error: msg }, 500);
  }
});
