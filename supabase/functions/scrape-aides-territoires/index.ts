// ──────────────────────────────────────────────────────────────────────
// Edge Function : scrape-aides-territoires (Phase 6 — veille France)
//
// Récupère les AAP « secteur privé » d'Aides-territoires (API État), les mappe
// au schéma AAP et les upsert dans la table `aaps` avec source="Aides-territoires".
// Deltas cantonnés à cette source (n'affecte pas les AAP SEDIA).
// V2.1 : stocke aussi le NOM de la région (champ `region`) quand le périmètre
// de l'aide est régional — utilisé par le filtre géographique du matching.
//
// Auth : clé API échangée contre un JWT (secret AIDES_TERRITOIRES_TOKEN).
// ──────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";

const AT = "https://aides-territoires.beta.gouv.fr";
const SOURCE = "Aides-territoires";
const MAX = 1000;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const THEME_KW: Record<string, string[]> = {
  "Construction & BTP": ["construction", "bâtiment", "génie civil", "btp", "travaux"],
  "Rénovation bâtiment": ["rénovation", "réhabilitation", "isolation"],
  "Transition énergétique": ["transition énergétique", "énergie", "chaleur"],
  "Énergies renouvelables": ["renouvelable", "solaire", "photovolta", "éolien", "biomasse", "géotherm"],
  "Efficacité énergétique": ["efficacité énergétique", "économie d'énergie", "performance énergétique"],
  "Décarbonation industrie": ["décarbonation", "industrie", "bas-carbone", "bas carbone"],
  "Mobilité décarbonée": ["mobilité", "transport", "vélo", "véhicule", "recharge", "bornes"],
  "Hydrogène": ["hydrogène"],
  "Numérique (IA / IoT / BIM)": ["numérique", "intelligence artificielle", "iot", "bim", "data", "digital"],
  "Robotique & automatisation": ["robot", "automatis"],
  "Économie circulaire": ["économie circulaire", "recycl", "réemploi", "déchets", "réutilisation"],
  "Matériaux & biosourcés": ["biosourcé", "matériau", "bois"],
  "Gestion de l'eau": ["eau potable", "assainissement", "eaux pluviales", "milieux aquatiques", "gestion de l'eau"],
  "Adaptation climatique": ["adaptation", "climat", "résilience", "inondation", "sécheresse"],
  "Infrastructures durables": ["infrastructure", "voirie", "réseaux", "ouvrage", "port", "ferroviaire"],
  "Aménagement & urbanisme": ["urbanisme", "aménagement", "espace public", "ville", "quartier", "logement"],
  "Recherche & développement": ["recherche", "innovation", "démonstrateur", "expérimentation"],
};
function extractThematiques(text: string): string[] {
  const h = (text || "").toLowerCase();
  return Object.keys(THEME_KW).filter((label) => THEME_KW[label].some((kw) => h.includes(kw)));
}
function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}
function joursRestants(d: string | null): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

type DispRow = { id: string; programme: string | null; nom: string; organisme: string | null };
function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }
function mapDispositif(financer: string, disp: DispRow[]): string | null {
  const f = norm(financer);
  if (!f) return null;
  const tokens = [f, ...f.split(/[^a-z0-9]+/).filter((w) => w.length >= 4)];
  let best: { id: string; score: number } | null = null;
  for (const d of disp) {
    const hay = norm(`${d.organisme ?? ""} ${d.programme ?? ""} ${d.nom}`);
    let score = 0;
    for (const t of tokens) if (t.length >= 4 && hay.includes(t)) score += t === f ? 5 : 2;
    if (score > 0 && (!best || score > best.score)) best = { id: d.id, score };
  }
  return best && best.score >= 4 ? best.id : null;
}

interface ATAid {
  id: number; name: string; description?: string; financers?: string[]; aid_types?: string[];
  categories?: string[]; targeted_audiences?: string[]; perimeter_scale?: string;
  perimeter?: string | null;
  submission_deadline?: string | null; start_date?: string | null; european_aid?: string | null;
  url?: string; origin_url?: string | null; application_url?: string | null;
}

/** Nom de région si (et seulement si) le périmètre de l'aide est régional.
 *  Département/EPCI/commune → null : la région n'est pas connue avec certitude,
 *  et le filtre géo du front est tolérant à l'absence (l'AAP reste proposé). */
function regionDePerimetre(a: ATAid): string | null {
  const scale = norm(a.perimeter_scale ?? "");
  if (!scale.includes("region")) return null;
  return a.perimeter?.trim() || null;
}

function toAAP(a: ATAid, disp: DispRow[], scrapedAt: string) {
  const financer = (a.financers ?? [])[0] ?? "Aides-territoires";
  const description = stripHtml(a.description ?? "");
  const jr = joursRestants(a.submission_deadline ?? null);
  const statut = jr !== null && jr < 0 ? "closed" : "open";
  const thematiques = extractThematiques(`${a.name}. ${description}. ${(a.categories ?? []).join(". ")}`);
  return {
    id: `AT-${a.id}`,
    titre: a.name,
    programme: financer,
    pilier: null,
    cluster: null,
    call_identifier: null,
    description,
    type_action: (a.aid_types ?? [])[0] ?? "Aide",
    type_action_detail: (a.aid_types ?? []).join(" | ") || null,
    statut,
    date_ouverture: a.start_date ?? null,
    date_cloture: a.submission_deadline ?? null,
    budget_total: null,
    budget_par_projet: null,
    trl_min: null,
    trl_max: null,
    mots_cles: [...new Set([...thematiques, ...(a.categories ?? [])])].slice(0, 20),
    thematiques,
    acteurs_eligibles: a.targeted_audiences ?? [],
    lien_officiel: a.application_url || a.origin_url || `${AT}${a.url ?? ""}`,
    dispositif_id: mapDispositif(financer, disp),
    echelle: a.perimeter_scale ?? null,
    region: regionDePerimetre(a),
    source: SOURCE,
    date_scraping: scrapedAt,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const started = Date.now();
  const key = Deno.env.get("AIDES_TERRITOIRES_TOKEN");
  if (!key) return json({ error: "not_configured", message: "Secret AIDES_TERRITOIRES_TOKEN absent." }, 503);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const scrapedAt = new Date().toISOString();

  try {
    const cx = await fetch(`${AT}/api/connexion/`, { method: "POST", headers: { "X-AUTH-TOKEN": key } });
    if (!cx.ok) throw new Error(`connexion ${cx.status}`);
    const { token } = await cx.json();
    const H = { Authorization: `Bearer ${token}` };

    const { data: dispRows } = await supabase.from("dispositifs").select("id, programme, nom, organisme").in("echelle", ["National", "Régional"]);
    const disp = (dispRows ?? []) as DispRow[];

    const byId = new Map<string, ReturnType<typeof toAAP>>();
    let next: string | null = `${AT}/api/aids/?call_for_projects_only=true&targeted_audiences=private_sector`;
    while (next && byId.size < MAX) {
      const resp = await fetch(next, { headers: H });
      if (!resp.ok) throw new Error(`aids ${resp.status}`);
      const j = await resp.json();
      for (const a of (j.results ?? []) as ATAid[]) {
        const aap = toAAP(a, disp, scrapedAt);
        if (!byId.has(aap.id)) byId.set(aap.id, aap);
        if (byId.size >= MAX) break;
      }
      next = j.next ?? null;
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

    const { data: closedRows } = await supabase.from("aaps").update({ statut: "closed", updated_at: scrapedAt })
      .eq("source", SOURCE).lt("date_cloture", scrapedAt).lt("updated_at", scrapedAt).neq("statut", "closed").select("id");
    const fermes = (closedRows ?? []).length;

    const duration_ms = Date.now() - started;
    await supabase.from("scrape_logs").insert({ source: SOURCE, fetched: aaps.length, nouveaux, mis_a_jour, fermes, duration_ms, ok: true });
    return json({ ok: true, fetched: aaps.length, nouveaux, mis_a_jour, fermes, duration_ms });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("scrape_logs").insert({ source: SOURCE, ok: false, error: msg, duration_ms: Date.now() - started });
    return json({ ok: false, error: msg }, 500);
  }
});
