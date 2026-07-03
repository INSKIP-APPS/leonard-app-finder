// ──────────────────────────────────────────────────────────────────────
// Edge Function : scrape-sedia (Phase 6 — automatisation du scraping)
//
// Exécute le pipeline SEDIA côté serveur : fetch topics Horizon ouverts/à venir
// → structuration AAP → mapping dispositif (FK) → upsert dans la table `aaps`,
// avec gestion des deltas (nouveaux / mis à jour / clôturés) et journalisation
// dans `scrape_logs`. Destinée à être appelée par un cron (pg_cron + pg_net).
//
// Écrit en base via la service_role (injectée automatiquement dans les Edge
// Functions Supabase — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
// ──────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";

const SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const TOPIC_PAGE = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
// Programmes EU scrapés (présents dans la base dispositifs + sur le portail SEDIA)
const FRAMEWORKS = [
  "43108390", // Horizon Europe (Clusters, EIC, Missions, MSCA, ERC, Partenariats/JU)
  "43252405", // LIFE (2021-2027)
  "43251567", // Connecting Europe Facility (CEF)
  "43152860", // Digital Europe Programme
  "43089234", // Innovation Fund (SEQE-UE) — appels remontés dès ouverture
];
const STATUS = { forthcoming: "31094501", open: "31094502", closed: "31094503" };
const STATUS_LABEL: Record<string, string> = {
  [STATUS.forthcoming]: "forthcoming", [STATUS.open]: "open", [STATUS.closed]: "closed",
};
const MAX = 1200;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PAGE_SIZE = 50;

// ── SEDIA search (recette validée : query + languages en fichiers JSON) ──
// Durci pour le runtime Edge (Deno) : User-Agent explicite, pas de gzip,
// lecture en texte puis parse, et retry sur coupure de connexion.
async function searchSedia(query: unknown, page: number, attempt = 0): Promise<any> {
  const url = `${SEARCH_URL}?apiKey=SEDIA&text=***&pageSize=${PAGE_SIZE}&pageNumber=${page}`;
  const form = new FormData();
  form.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }), "query.json");
  form.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }), "languages.json");
  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
      headers: { "User-Agent": "leonard-aap-finder/1.0", Accept: "application/json", "Accept-Encoding": "identity" },
    });
    if (!res.ok) throw new Error(`SEDIA ${res.status}`);
    return JSON.parse(await res.text());
  } catch (e) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return searchSedia(query, page, attempt + 1);
    }
    throw e;
  }
}

// ── Helpers de mapping (portage de src/services/aap-mapping.ts) ──────────
const CLUSTER_MAP: Record<string, { pilier: string; cluster: string }> = {
  CL1: { pilier: "Pilier II", cluster: "CL1" }, CL2: { pilier: "Pilier II", cluster: "CL2" },
  CL3: { pilier: "Pilier II", cluster: "CL3" }, CL4: { pilier: "Pilier II", cluster: "CL4" },
  CL5: { pilier: "Pilier II", cluster: "CL5" }, CL6: { pilier: "Pilier II", cluster: "CL6" },
  EIC: { pilier: "Pilier III", cluster: "EIC" }, EIE: { pilier: "Pilier III", cluster: "EIE" },
  MSCA: { pilier: "Pilier I", cluster: "MSCA" }, ERC: { pilier: "Pilier I", cluster: "ERC" },
  WIDERA: { pilier: "Élargir la participation", cluster: "WIDERA" },
  MISS: { pilier: "Missions", cluster: "MISS" }, JU: { pilier: "Partenariats", cluster: "JU" },
};
// Préfixe d'identifiant → libellé de programme lisible
const PROGRAMME_LABEL: Record<string, string> = {
  HORIZON: "Horizon Europe",
  LIFE: "LIFE",
  CEF: "CEF (Connecting Europe Facility)",
  DIGITAL: "Digital Europe",
  INNOVFUND: "Innovation Fund",
};
// Jetons de rattachement dispositif pour les programmes non-Horizon
const PROGRAMME_TOKENS: Record<string, string[]> = {
  LIFE: ["life"],
  CEF: ["connecting europe", "cef"],
  DIGITAL: ["digital europe"],
  INNOVFUND: ["innovation fund"],
};
function parseTopicId(id: string) {
  const seg = id.toUpperCase().split("-");
  const prefix = seg[0] || "";
  const programme = PROGRAMME_LABEL[prefix] ?? (prefix || "Inconnu");
  if (prefix === "HORIZON") {
    for (const s of seg.slice(1, 3)) if (CLUSTER_MAP[s]) return { programme, prefix, ...CLUSTER_MAP[s] };
  }
  return { programme, prefix, pilier: null as string | null, cluster: null as string | null };
}
function clusterTokens(cluster: string | null, id: string): string[] {
  if (!cluster) return [];
  if (/^CL\d$/.test(cluster)) return [`cluster ${cluster[2]}`, `clusters ${cluster[2]}`, cluster.toLowerCase()];
  const up = id.toUpperCase();
  if (cluster === "EIC") return up.includes("ACCELERATOR") ? ["eic accelerator"] : up.includes("PATHFINDER") ? ["eic pathfinder"] : up.includes("TRANSITION") ? ["eic transition"] : ["eic"];
  if (cluster === "MISS") return ["mission"];
  if (cluster === "JU") return ["partenariat", "ju"];
  return [cluster.toLowerCase()];
}
type DispRow = { id: string; programme: string; nom: string; organisme?: string | null };
function mapDispositif(id: string, parsed: { programme: string; prefix: string; pilier: string | null; cluster: string | null }, disp: DispRow[]): string | null {
  // Horizon → jetons de cluster ; autres programmes → jetons de programme.
  const tokens = parsed.cluster ? clusterTokens(parsed.cluster, id) : (PROGRAMME_TOKENS[parsed.prefix] ?? []);
  let best: { id: string; score: number } | null = null;
  for (const d of disp) {
    const hay = `${d.programme} ${d.nom} ${d.organisme ?? ""}`.toLowerCase();
    let score = 0;
    if (parsed.programme !== "Inconnu" && hay.includes(parsed.programme.toLowerCase())) score += 1;
    for (const t of tokens) if (hay.includes(t)) score += 5;
    if (parsed.pilier && hay.includes(parsed.pilier.toLowerCase())) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: d.id, score };
  }
  return best && best.score >= 5 ? best.id : null;
}

const THEME_KW: Record<string, string[]> = {
  "Construction & BTP": ["construction", "building site", "civil engineering", "built environment"],
  "Rénovation bâtiment": ["renovation", "retrofit", "refurbish"],
  "Transition énergétique": ["energy transition", "clean energy", "energy system"],
  "Énergies renouvelables": ["renewable", "solar", "photovoltaic", "wind energy", "offshore wind", "geothermal"],
  "Efficacité énergétique": ["energy efficiency", "energy saving", "energy performance"],
  "Décarbonation industrie": ["industrial decarbon", "industry decarbon", "hard-to-abate", "process emissions"],
  "Mobilité décarbonée": ["mobility", "transport", "electric vehicle", "zero-emission", "charging", "battery"],
  "Hydrogène": ["hydrogen", "fuel cell", "electrolys"],
  "Numérique (IA / IoT / BIM)": ["artificial intelligence", "digital", "internet of things", " iot", "bim", "machine learning", "digital twin", "data-driven"],
  "Robotique & automatisation": ["robot", "automation", "autonomous system"],
  "Économie circulaire": ["circular economy", "recycl", "reuse", "waste", "circularity"],
  "Matériaux & biosourcés": ["bio-based", "biosourced", "biomaterial", "timber", "wood construction"],
  "Gestion de l'eau": ["water management", "wastewater", "water resource", "water quality"],
  "Adaptation climatique": ["climate adaptation", "climate resilience", "flood", "drought", "climate change adaptation"],
  "Infrastructures durables": ["infrastructure", "railway", "bridge", "road network", "port infrastructure"],
  "Aménagement & urbanisme": ["urban planning", "cities", "urban area", "neighbourhood", "spatial planning"],
  "Recherche & développement": ["research and innovation", "demonstration", "pilot project", "proof of concept", "r&d"],
};
function extractThematiques(text: string): string[] {
  const h = text.toLowerCase();
  return Object.keys(THEME_KW).filter((label) => THEME_KW[label].some((kw) => h.includes(kw)));
}
function extractTrl(text: string): { trl_min: number | null; trl_max: number | null } {
  const nums: number[] = [];
  const re = /(?:trl|technology readiness level)s?\s*(\d)(?:\s*(?:[-–—]|to|and)\s*(\d))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) { nums.push(Number(m[1])); if (m[2]) nums.push(Number(m[2])); }
  return nums.length ? { trl_min: Math.min(...nums), trl_max: Math.max(...nums) } : { trl_min: null, trl_max: null };
}
function normTypeAction(raw: string | null): string {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("research and innovation")) return "RIA";
  if (t.includes("innovation action")) return "IA";
  if (t.includes("coordination and support")) return "CSA";
  if (t.includes("cofund")) return "COFUND";
  if (t.includes("eic")) return "EIC";
  return "Autre";
}
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}
function parseBudget(raw: string | undefined) {
  if (!raw) return { budget_total: null, budget_par_projet: null };
  try {
    const bo = JSON.parse(raw);
    const actions = Object.values(bo.budgetTopicActionMap ?? {}).flat() as Array<{ maxContribution?: number; budgetYearMap?: Record<string, string> }>;
    let total = 0, maxPer = 0;
    for (const a of actions) { for (const v of Object.values(a.budgetYearMap ?? {})) total += Number(v) || 0; if (a.maxContribution) maxPer = Math.max(maxPer, Number(a.maxContribution) || 0); }
    return { budget_total: total > 0 ? Math.round(total) : null, budget_par_projet: maxPer > 0 ? Math.round(maxPer) : null };
  } catch { return { budget_total: null, budget_par_projet: null }; }
}
const first = (md: Record<string, string[]>, k: string) => (Array.isArray(md?.[k]) ? md[k][0] : undefined);

function rawToAAP(r: { metadata?: Record<string, string[]>; url?: string }, disp: DispRow[], scrapedAt: string) {
  const md = r.metadata ?? {};
  const id = first(md, "identifier");
  if (!id) return null;
  const titre = first(md, "title") ?? id;
  const description = stripHtml(first(md, "descriptionByte") ?? "");
  const parsed = parseTopicId(id);
  const typeDetail = first(md, "typesOfAction") ?? null;
  const { budget_total, budget_par_projet } = parseBudget(first(md, "budgetOverview"));
  const tags = (md.tags ?? []).filter(Boolean);
  const { trl_min, trl_max } = extractTrl(`${titre}. ${description}`);
  const thematiques = extractThematiques(`${titre}. ${description}. ${tags.join(" ")}`);
  const keywords = (md.keywords ?? []).filter((k) => k && k !== id);
  return {
    id, titre, programme: parsed.programme, pilier: parsed.pilier, cluster: parsed.cluster,
    call_identifier: first(md, "callIdentifier") ?? null, description,
    type_action: normTypeAction(typeDetail), type_action_detail: typeDetail,
    statut: STATUS_LABEL[first(md, "status") ?? ""] ?? "forthcoming",
    date_ouverture: first(md, "startDate") ?? null, date_cloture: first(md, "deadlineDate") ?? null,
    deadline_model: first(md, "deadlineModel") ?? null, // single-stage / two-stage
    budget_total, budget_par_projet, trl_min, trl_max,
    mots_cles: [...new Set([...thematiques, ...tags, ...keywords])].slice(0, 20),
    thematiques,
    // SEDIA n'expose pas d'éligibilité structurée : Horizon/LIFE/CEF/Digital sont
    // ouverts à toute entité juridique (best-effort, améliore la complétude d'affichage).
    acteurs_eligibles: ["Tout type d'entité juridique"],
    lien_officiel: r.url ?? `${TOPIC_PAGE}${id}`,
    dispositif_id: mapDispositif(id, parsed, disp),
    source: "EU Funding & Tenders (SEDIA)", date_scraping: scrapedAt,
  };
}

// ── Handler ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const started = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const scrapedAt = new Date().toISOString();

  try {
    // 1) Dispositifs pour le mapping FK
    const { data: dispRows, error: dErr } = await supabase.from("dispositifs").select("id, programme, nom, organisme");
    if (dErr) throw new Error(`dispositifs: ${dErr.message}`);
    const disp = (dispRows ?? []) as DispRow[];

    // 2) Fetch SEDIA (ouverts + à venir), dédup par id
    const query = { bool: { must: [
      { terms: { type: ["1"] } },
      { terms: { status: [STATUS.forthcoming, STATUS.open] } },
      { terms: { frameworkProgramme: FRAMEWORKS } },
    ] } };
    const byId = new Map<string, ReturnType<typeof rawToAAP>>();
    for (let page = 1; byId.size < MAX; page++) {
      const resp = await searchSedia(query, page);
      const results = resp.results ?? [];
      if (results.length === 0) break;
      for (const r of results) {
        const aap = rawToAAP(r, disp, scrapedAt);
        if (!aap) continue;
        // SEDIA renvoie plusieurs documents par topic (une variante par langue,
        // + des variantes `en` parfois à description VIDE). On conserve celle dont
        // la description est la plus complète, au lieu de la première rencontrée.
        const prev = byId.get(aap.id);
        if (!prev || (aap.description?.length ?? 0) > (prev.description?.length ?? 0)) byId.set(aap.id, aap);
        if (byId.size >= MAX && !prev) break;
      }
      if (page * PAGE_SIZE >= (resp.totalResults ?? byId.size)) break;
    }
    const aaps = [...byId.values()].filter(Boolean) as NonNullable<ReturnType<typeof rawToAAP>>[];

    // 3) Delta + PRÉSERVATION des descriptions déjà enrichies.
    const { data: existing } = await supabase
      .from("aaps").select("id, description:data->>description")
      .eq("source", "EU Funding & Tenders (SEDIA)");
    const existingIds = new Set((existing ?? []).map((x: { id: string }) => x.id));
    const existingDesc = new Map(
      (existing ?? []).map((x: { id: string; description: string | null }) => [x.id, x.description ?? ""]),
    );
    // SEDIA renvoie parfois une description VIDE pour un topic dont on possédait
    // déjà le texte complet (variantes `en` multiples). On préserve l'existant
    // plutôt que de l'écraser, et on recalcule thématiques / TRL sur ce texte.
    for (const a of aaps) {
      const prev = existingDesc.get(a.id) ?? "";
      if ((a.description?.length ?? 0) < prev.length) {
        a.description = prev;
        const t = extractThematiques(`${a.titre}. ${prev}`);
        a.thematiques = t;
        a.mots_cles = [...new Set([...t, ...a.mots_cles])].slice(0, 20);
        const { trl_min, trl_max } = extractTrl(`${a.titre}. ${prev}`);
        a.trl_min = trl_min;
        a.trl_max = trl_max;
      }
    }
    const nouveaux = aaps.filter((a) => !existingIds.has(a.id)).length;
    const mis_a_jour = aaps.length - nouveaux;

    // 4) Upsert
    const rows = aaps.map((a) => ({
      id: a.id, titre: a.titre, programme: a.programme, pilier: a.pilier, cluster: a.cluster,
      statut: a.statut, type_action: a.type_action, date_ouverture: a.date_ouverture, date_cloture: a.date_cloture,
      budget_total: a.budget_total, budget_par_projet: a.budget_par_projet, trl_min: a.trl_min, trl_max: a.trl_max,
      thematiques: a.thematiques, dispositif_id: a.dispositif_id, data: a, date_scraping: a.date_scraping,
      source: "EU Funding & Tenders (SEDIA)", updated_at: scrapedAt,
    }));
    const { error: uErr } = await supabase.from("aaps").upsert(rows, { onConflict: "id" });
    if (uErr) throw new Error(`upsert: ${uErr.message}`);

    // 5) Delta : marquer clôturés uniquement les AAP qui ont DISPARU du portail
    // (deadline passée ET non rafraîchis à ce run). On ne touche jamais un appel
    // que SEDIA vient de renvoyer comme ouvert/à venir (cas des appels 2 étapes).
    const { data: closedRows, error: cErr } = await supabase
      .from("aaps").update({ statut: "closed", updated_at: scrapedAt })
      .eq("source", "EU Funding & Tenders (SEDIA)").lt("date_cloture", scrapedAt).lt("updated_at", scrapedAt).neq("statut", "closed").select("id");
    if (cErr) throw new Error(`close: ${cErr.message}`);
    const fermes = (closedRows ?? []).length;

    const duration_ms = Date.now() - started;
    await supabase.from("scrape_logs").insert({ fetched: aaps.length, nouveaux, mis_a_jour, fermes, duration_ms, ok: true });
    return json({ ok: true, fetched: aaps.length, nouveaux, mis_a_jour, fermes, duration_ms });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("scrape_logs").insert({ ok: false, error: msg, duration_ms: Date.now() - started });
    return json({ ok: false, error: msg }, 500);
  }
});
