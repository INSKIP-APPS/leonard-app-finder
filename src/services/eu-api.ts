// ──────────────────────────────────────────────────────────────────────
// Connecteur API EU Funding & Tenders (SEDIA) — Phase 2.1 + 2.2 + 2.3
//
// Portail : https://ec.europa.eu/info/funding-tenders/opportunities
// Search API (SEDIA) : POST https://api.tech.ec.europa.eu/search-api/prod/rest/search
//
// Recette de requête validée (voir historique de mise au point) :
//   - Méthode POST, apiKey=SEDIA en query param, text=*** (wildcard)
//   - Corps multipart/form-data avec DEUX parts, chacune envoyée comme un
//     fichier JSON (Blob + nom de fichier + content-type application/json) :
//       • "query"     → l'objet de filtres Elasticsearch-like
//       • "languages" → ["en"]
//     ⚠️ Envoyer ces parts comme de simples champs texte renvoie soit une
//        erreur 500, soit un filtrage silencieusement ignoré (4M+ résultats).
//
// ⚠️ CORS : cette API ne renvoie pas d'en-têtes CORS. Le connecteur est donc
//    destiné à tourner côté serveur (script Node, Edge Function, cron — Phase 6),
//    pas directement depuis le navigateur.
// ──────────────────────────────────────────────────────────────────────

import type { AAP, AAPStatut } from "@/types/aap";
import type { Dispositif } from "@/types/dispositif";
import {
  parseTopicId,
  mapAapToDispositif,
  extractThematiques,
  extractTrl,
  normalizeTypeAction,
  stripHtml,
} from "./aap-mapping";

const SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const TOPIC_PAGE_BASE =
  "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";

// Codes SEDIA
export const STATUS_CODES = {
  forthcoming: "31094501",
  open: "31094502",
  closed: "31094503",
} as const;

/** type=1 : subventions / appels à propositions (topics) */
const TYPE_GRANT = "1";

/** Codes de programme cadre (frameworkProgramme) */
export const FRAMEWORK_PROGRAMMES = {
  horizonEurope: "43108390",
} as const;

const STATUS_CODE_TO_LABEL: Record<string, AAPStatut> = {
  [STATUS_CODES.forthcoming]: "forthcoming",
  [STATUS_CODES.open]: "open",
  [STATUS_CODES.closed]: "closed",
};

// ── Types bruts (partiels) de la réponse SEDIA ───────────────────────

interface SediaMetadata {
  [key: string]: string[] | undefined;
}

interface SediaResult {
  reference?: string;
  url?: string;
  metadata?: SediaMetadata;
}

interface SediaResponse {
  totalResults?: number;
  pageSize?: number;
  pageNumber?: number;
  results?: SediaResult[];
}

/** Premier élément d'un champ metadata (les valeurs sont des tableaux). */
function first(md: SediaMetadata | undefined, key: string): string | undefined {
  const v = md?.[key];
  return Array.isArray(v) ? v[0] : undefined;
}

// ── Appel bas-niveau ─────────────────────────────────────────────────

export interface SediaQuery {
  bool: { must: Array<Record<string, unknown>> };
}

/**
 * Exécute une requête brute contre la Search API SEDIA.
 * `text` par défaut le wildcard "***".
 */
export async function searchSedia(
  query: SediaQuery,
  opts: { pageSize?: number; pageNumber?: number; text?: string; apiKey?: string } = {},
): Promise<SediaResponse> {
  const { pageSize = 50, pageNumber = 1, text = "***", apiKey = "SEDIA" } = opts;
  const url = `${SEARCH_URL}?apiKey=${apiKey}&text=${encodeURIComponent(text)}&pageSize=${pageSize}&pageNumber=${pageNumber}`;

  const form = new FormData();
  // Les deux parts DOIVENT être des "fichiers" JSON (cf. entête du module).
  form.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }), "query.json");
  form.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }), "languages.json");

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SEDIA search HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as SediaResponse;
}

// ── Conversion d'un topic brut → AAP structuré ───────────────────────

function parseBudget(md: SediaMetadata | undefined): {
  budget_total: number | null;
  budget_par_projet: number | null;
} {
  const raw = first(md, "budgetOverview");
  if (!raw) return { budget_total: null, budget_par_projet: null };
  try {
    const bo = JSON.parse(raw) as {
      budgetTopicActionMap?: Record<
        string,
        Array<{ maxContribution?: number; budgetYearMap?: Record<string, string> }>
      >;
    };
    const actions = Object.values(bo.budgetTopicActionMap ?? {}).flat();
    let total = 0;
    let maxPerProject = 0;
    for (const a of actions) {
      for (const v of Object.values(a.budgetYearMap ?? {})) total += Number(v) || 0;
      if (a.maxContribution) maxPerProject = Math.max(maxPerProject, Number(a.maxContribution) || 0);
    }
    return {
      budget_total: total > 0 ? total : null,
      budget_par_projet: maxPerProject > 0 ? maxPerProject : null,
    };
  } catch {
    return { budget_total: null, budget_par_projet: null };
  }
}

/**
 * Transforme un résultat brut SEDIA en AAP structuré, en appliquant le mapping
 * dispositif et l'extraction de thématiques/TRL. `dispositifs` sert au
 * rattachement (Phase 2.4) ; passer [] pour l'ignorer.
 */
export function rawTopicToAAP(
  result: SediaResult,
  dispositifs: Dispositif[] = [],
  scrapedAt: string,
): AAP | null {
  const md = result.metadata;
  const id = first(md, "identifier");
  if (!id) return null;

  const titre = first(md, "title") ?? id;
  const descriptionHtml = first(md, "descriptionByte") ?? "";
  const description = stripHtml(descriptionHtml);
  const parsed = parseTopicId(id);
  const typeActionDetail = first(md, "typesOfAction") ?? null;
  const statusCode = first(md, "status") ?? "";
  const { budget_total, budget_par_projet } = parseBudget(md);
  const { trl_min, trl_max } = extractTrl(`${titre}. ${description}`);
  const thematiques = extractThematiques(`${titre}. ${description}`);

  const keywords = (md?.keywords ?? []).filter((k) => k && k !== id);

  return {
    id,
    titre,
    programme: parsed.programme,
    pilier: parsed.pilier,
    cluster: parsed.cluster,
    call_identifier: first(md, "callIdentifier") ?? null,
    description,
    type_action: normalizeTypeAction(typeActionDetail),
    type_action_detail: typeActionDetail,
    statut: STATUS_CODE_TO_LABEL[statusCode] ?? "forthcoming",
    date_ouverture: first(md, "startDate") ?? null,
    date_cloture: first(md, "deadlineDate") ?? null,
    budget_total,
    budget_par_projet,
    trl_min,
    trl_max,
    mots_cles: [...new Set([...thematiques, ...keywords])].slice(0, 20),
    thematiques,
    acteurs_eligibles: [],
    lien_officiel: result.url ?? `${TOPIC_PAGE_BASE}${id}`,
    dispositif_id: dispositifs.length ? mapAapToDispositif(id, dispositifs, parsed) : null,
    source: "EU Funding & Tenders (SEDIA)",
    date_scraping: scrapedAt,
  };
}

// ── Fonctions publiques ──────────────────────────────────────────────

export interface FetchOpenCallsOptions {
  /** Code de programme cadre (défaut : Horizon Europe) */
  frameworkProgramme?: string;
  /** Statuts à inclure (défaut : ouverts + à venir) */
  statuts?: AAPStatut[];
  /** Base dispositifs pour le rattachement (Phase 2.4) */
  dispositifs?: Dispositif[];
  /** Nombre max de topics à récupérer (défaut : 200) */
  max?: number;
  /** Horodatage de scraping injecté dans chaque AAP (ISO) */
  scrapedAt: string;
}

/**
 * Récupère les topics ouverts / à venir pour un programme cadre, avec pagination,
 * et les convertit en AAP structurés (Phase 2.2).
 */
export async function fetchOpenCalls(opts: FetchOpenCallsOptions): Promise<AAP[]> {
  const {
    frameworkProgramme = FRAMEWORK_PROGRAMMES.horizonEurope,
    statuts = ["open", "forthcoming"],
    dispositifs = [],
    max = 200,
    scrapedAt,
  } = opts;

  const statusCodes = statuts.map((s) => STATUS_CODES[s]);
  const query: SediaQuery = {
    bool: {
      must: [
        { terms: { type: [TYPE_GRANT] } },
        { terms: { status: statusCodes } },
        { terms: { frameworkProgramme: [frameworkProgramme] } },
      ],
    },
  };

  // Déduplication par identifiant : SEDIA peut renvoyer un même topic plusieurs
  // fois (deadlines multi-étapes, chevauchement de pagination).
  const byId = new Map<string, AAP>();
  const pageSize = 100;
  for (let page = 1; byId.size < max; page++) {
    const resp = await searchSedia(query, { pageSize, pageNumber: page });
    const results = resp.results ?? [];
    if (results.length === 0) break;
    for (const r of results) {
      const aap = rawTopicToAAP(r, dispositifs, scrapedAt);
      if (aap && !byId.has(aap.id)) byId.set(aap.id, aap);
      if (byId.size >= max) break;
    }
    const total = resp.totalResults ?? byId.size;
    if (page * pageSize >= total) break;
  }
  return [...byId.values()];
}

/**
 * Récupère le détail d'un topic précis par son identifiant (Phase 2.2).
 * Renvoie null si le topic est introuvable.
 */
export async function fetchTopicDetails(
  topicId: string,
  dispositifs: Dispositif[] = [],
  scrapedAt: string = new Date().toISOString(),
): Promise<AAP | null> {
  const query: SediaQuery = {
    bool: { must: [{ terms: { type: [TYPE_GRANT] } }, { terms: { identifier: [topicId] } }] },
  };
  const resp = await searchSedia(query, { pageSize: 5, text: topicId });
  const match = (resp.results ?? []).find((r) => first(r.metadata, "identifier") === topicId)
    ?? (resp.results ?? [])[0];
  return match ? rawTopicToAAP(match, dispositifs, scrapedAt) : null;
}
