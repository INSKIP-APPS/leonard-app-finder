// ──────────────────────────────────────────────────────────────────────
// Juge IA partagé — SOURCE UNIQUE des règles de jugement des AAP.
//
// Utilisé par run-veille, analyse-adhoc et claude-judge : mêmes règles
// partout (barème 0-100, règle dure d'éligibilité acteur, format JSON),
// même plomberie (batches de 10, pool de 4, retry transitoire, capture
// des tokens). Toute évolution du barème se fait ICI et nulle part ailleurs.
// ──────────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any

/**
 * Prompt système canonique. `calibration` (optionnel) = bloc de verdicts
 * humains validés, ajouté par run-veille pour caler le juge sur le feedback.
 */
export function buildJudgeSystem(calibration?: string): string {
  const base = [
    "Tu es un expert des financements publics de l'innovation en France et Europe (ADEME, Bpifrance, Regions, agences de l'eau ; Horizon Europe, CEF, LIFE, EIC).",
    "On te donne UN projet et une liste d'AAP candidats. Pour CHAQUE AAP, rends un VERDICT et un SCORE.",
    "",
    "BAREME DU SCORE (0-100) :",
    "- 90-100 : Correspondance parfaite. L'AAP finance exactement l'objet du projet, cibles alignees, TRL compatible.",
    "- 75-89 : Bonne correspondance. L'objet est aligne, avec des contraintes secondaires (consortium, plafond, TRL decale de 1). Les contraintes ne disqualifient pas : signale-les dans points_attention.",
    "- 60-74 : Correspondance partielle. Un volet du projet colle mais pas tout, OU l'objet colle mais des contraintes lourdes.",
    "- 40-59 : Correspondance faible mais l'AAP peut techniquement financer une etape du projet.",
    "- 0-39 : Non pertinent. L'AAP finance un autre objet, meme domaine.",
    "",
    "REGLE DURE D'ELIGIBILITE D'ACTEUR :",
    "- Chaque AAP a une liste 'acteurs_eligibles' (types de beneficiaires eligibles). Si elle est absente ou nulle, pas de contrainte.",
    "- Le projet a un 'type_acteur' (Grand groupe, PME, Start-up, Filiale d'un grand groupe, ETI...).",
    "- Si acteurs_eligibles = ['Tout type d'entite juridique'] -> compatible avec tout (pas de contrainte).",
    "- Si la liste contient UNIQUEMENT des types incompatibles (ex. seulement Commune / Intercommunalite / Departement / Region / Etablissement public / Association / Collectivite pour un Grand groupe ou une Filiale de grand groupe) -> score PLAFONNE a 35 (non pertinent).",
    "- Si la liste contient UNIQUEMENT des PME / TPE / Micro-entreprise / Start-up et que le projet est porte par un Grand groupe / Filiale de grand groupe / ETI -> score PLAFONNE a 35.",
    "- Une liste vague ('entreprise', 'entreprise francaise') est consideree compatible.",
    "- 'Filiale d'un grand groupe' est equivalent a 'Grand groupe' pour l'analyse.",
    "",
    "Autres regles :",
    "- STRICT : dans le doute sur le fit, score bas. Partager un domaine general ('energie', 'batiment') ne suffit pas.",
    "- Un AAP qui finance un AUTRE objet du meme domaine (ex. solaire thermique pour un projet hydrogene) -> score < 40.",
    "- Les AAP generiques 'accompagnement / etudes' ne depassent 60 QUE s'ils peuvent reellement financer une etape de CE projet.",
    "- pertinent = score >= 60.",
    "- Ne JAMAIS inventer d'information absente.",
    "",
    "Reponds UNIQUEMENT en JSON valide :",
    '{"results":[{"id":"...","score":85,"pertinent":true,"raison":"1-2 phrases en francais citant l element decisif","points_attention":["0 a 2 vigilances"],"motif_ecart":"si pertinent=false : motif court, mentionne ineligibilite acteur si applicable"}]}',
    "Un objet par AAP, meme ordre, id exact.",
  ].join("\n");
  return base + (calibration || "");
}

export function parseJsonLenient(text: string): any {
  try { return JSON.parse(text); } catch { /* tente l'extraction */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* échec ci-dessous */ } }
  throw new Error("reponse non-JSON du modele");
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);

/** Retry (2 réessais, backoff 2s/6s + jitter) sur erreurs transitoires Anthropic. */
export async function callWithRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status = e?.status ?? e?.response?.status;
      const retryable = RETRYABLE_STATUS.has(status) || e?.name === "APIConnectionError";
      if (!retryable || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, (i === 0 ? 2000 : 6000) + Math.random() * 500));
    }
  }
  throw lastErr;
}

/** Exécute des tâches async avec au plus `limit` en parallèle. */
export async function pool<T>(tasks: Array<() => Promise<T>>, limit = 4) {
  const results: Array<{ status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }> =
    new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export interface JudgeUsage { input: number; output: number }
export interface JudgeOutcome {
  results: any[];
  batches: number;
  failed: number;
  usage: JudgeUsage;
}

/**
 * Soumet des candidats (déjà compactés, avec `id` obligatoire) au juge.
 * Découpe en lots de `batchSize`, au plus `poolLimit` appels simultanés,
 * retry transitoire, capture des tokens. Les lots en échec sont comptés
 * (jamais silencieux) — un candidat d'un lot raté n'a PAS été jugé.
 */
export async function runJudge(
  anthropic: any,
  opts: {
    projetBloc: string;
    items: any[];
    calibration?: string;
    model?: string;
    maxTokens?: number;
    batchSize?: number;
    poolLimit?: number;
  },
): Promise<JudgeOutcome> {
  const model = opts.model || Deno.env.get("JUDGE_MODEL") || "claude-haiku-4-5-20251001";
  const batchSize = opts.batchSize ?? 10;
  const system = buildJudgeSystem(opts.calibration);
  const usage: JudgeUsage = { input: 0, output: 0 };

  const chunks: any[][] = [];
  for (let i = 0; i < opts.items.length; i += batchSize) chunks.push(opts.items.slice(i, i + batchSize));

  const tasks = chunks.map((chunk) => () =>
    callWithRetry(() =>
      anthropic.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 3500,
        system,
        messages: [{
          role: "user",
          content: `${opts.projetBloc}\n\nAAP CANDIDATS (${chunk.length}) :\n${JSON.stringify(chunk, null, 1)}`,
        }],
      }),
    ).then((resp: any) => {
      usage.input += resp.usage?.input_tokens ?? 0;
      usage.output += resp.usage?.output_tokens ?? 0;
      const tb = resp.content.find((b: any) => b.type === "text");
      const text = tb && "text" in tb ? tb.text : "{}";
      return (parseJsonLenient(text).results ?? []) as any[];
    }),
  );

  const settled = await pool(tasks, opts.poolLimit ?? 4);
  const results: any[] = [];
  let failed = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") results.push(...s.value);
    else failed++;
  }
  return { results, batches: chunks.length, failed, usage };
}

export interface VerdictNorm {
  score: number;
  pertinent: boolean;
  tier: "prioritaire" | "a_etudier" | null;
  raison: string | null;
  motif_ecart: string | null;
  points_attention: string[];
}

/** Normalisation canonique d'un verdict brut du modèle (clamp, seuils, tier). */
export function normalizeVerdict(v: any): VerdictNorm {
  const rawScore = typeof v?.score === "number" ? v.score : (v?.pertinent ? 60 : 30);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const pertinent = v?.pertinent === true && score >= 60;
  return {
    score,
    pertinent,
    tier: pertinent ? (score >= 80 ? "prioritaire" : "a_etudier") : null,
    raison: v?.raison || null,
    motif_ecart: pertinent ? null : (v?.motif_ecart || null),
    points_attention: Array.isArray(v?.points_attention) ? v.points_attention : [],
  };
}
