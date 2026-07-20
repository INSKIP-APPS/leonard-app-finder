// ──────────────────────────────────────────────────────────────────────
// Client du juge de pertinence (V2.1) — appelle l'Edge Function `claude-judge`
// qui rend un verdict binaire strict par candidat (voir supabase/functions/).
//
//   • cache 24 h (localStorage) par couple projet ↔ liste de candidats ;
//   • repli propre si l'API est indisponible : l'UI affiche la présélection
//     avec un bandeau « juge indisponible » (mode "fallback").
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { ProjetInput } from "@/utils/scoring-engine";
import type { Candidat } from "@/utils/preselection";

export interface Verdict {
  id: string;
  pertinent: boolean;
  raison: string;
  points_attention: string[];
  motif_ecart?: string;
}

export type JugeMode = "juge" | "fallback";

export interface JugementResult {
  /** Verdicts par id d'AAP (absent = candidat non jugé, batch en échec). */
  verdicts: Record<string, Verdict>;
  mode: JugeMode;
  error?: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = "claude-judge:";

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function cacheKey(projet: ProjetInput, ids: string[]): string {
  const fp = JSON.stringify({
    n: projet.nom,
    d: projet.description,
    s: [...projet.secteurs].sort(),
    a: projet.typeActeur,
    t: projet.trl,
    r: projet.region,
    f: projet.financementRecherche,
    m: projet.motsClesLibres,
    ids: [...ids].sort(),
  });
  return CACHE_PREFIX + hashStr(fp);
}

function readCache(key: string): JugementResult | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, result } = JSON.parse(raw) as { at: number; result: JugementResult };
    if (Date.now() - at > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

function writeCache(key: string, result: JugementResult): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), result }));
  } catch {
    /* quota localStorage — tant pis pour le cache */
  }
}

/**
 * Soumet les candidats présélectionnés au juge. Renvoie les verdicts par id.
 * En cas d'échec (Supabase absent, clé non configurée, réseau), mode="fallback"
 * avec verdicts vide : l'appelant affiche la présélection brute.
 */
export async function jugerCandidats(
  projet: ProjetInput,
  candidats: Candidat[],
): Promise<JugementResult> {
  if (candidats.length === 0) return { verdicts: {}, mode: "juge" };

  const ids = candidats.map((c) => c.aap.id);
  const key = cacheKey(projet, ids);
  const cached = readCache(key);
  if (cached) return cached;

  if (!supabase) return { verdicts: {}, mode: "fallback", error: "Supabase non configuré." };

  try {
    const { data, error } = await supabase.functions.invoke("claude-judge", {
      body: {
        projet: {
          nom: projet.nom,
          description: projet.description,
          secteurs: projet.secteurs,
          typeActeur: projet.typeActeur,
          trl: projet.trl,
          region: projet.region,
          financementRecherche: projet.financementRecherche,
          motsClesLibres: projet.motsClesLibres,
        },
        candidats: candidats.map((c) => ({
          id: c.aap.id,
          titre: c.aap.titre,
          source: c.aap.source,
          type_action: c.aap.type_action,
          trl:
            c.aap.trl_min != null || c.aap.trl_max != null
              ? `${c.aap.trl_min ?? "?"}-${c.aap.trl_max ?? "?"}`
              : null,
          thematiques: c.aap.thematiques,
          // Permet à la règle dure d'éligibilité acteur (prompt partagé) de
          // s'appliquer aussi sur la page /matching.
          acteurs_eligibles: c.aap.acteurs_eligibles ?? null,
          montant: c.aap.montants ?? null,
          flags: c.flags,
          description: c.aap.description,
        })),
      },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.message || data.error);

    const verdicts: Record<string, Verdict> = {};
    for (const r of (data?.results ?? []) as Verdict[]) {
      if (r && typeof r.id === "string") {
        verdicts[r.id] = {
          id: r.id,
          pertinent: Boolean(r.pertinent),
          raison: r.raison || "",
          points_attention: Array.isArray(r.points_attention) ? r.points_attention : [],
          motif_ecart: r.motif_ecart,
        };
      }
    }
    const result: JugementResult = { verdicts, mode: "juge" };
    writeCache(key, result);
    return result;
  } catch (e) {
    return {
      verdicts: {},
      mode: "fallback",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
