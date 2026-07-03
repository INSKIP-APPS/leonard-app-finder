// ──────────────────────────────────────────────────────────────────────
// Couche 2 — matching sémantique via Claude (Phase 4.7–4.10)
//
// À la demande uniquement : prend le shortlist pré-scoré par la Couche 1 et
// appelle l'Edge Function `claude-matching` (Claude Sonnet 5 côté serveur).
// Fusionne 60 % structurel (Couche 1) / 40 % sémantique (Claude), avec :
//   • cache 24 h (localStorage) par couple projet/shortlist,
//   • repli automatique sur la Couche 1 si l'API est indisponible.
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { ScoredAap, ProjetInput } from "@/utils/scoring-engine";

/** Nombre max d'AAP envoyés à Claude par appel (coût API). */
const MAX_SHORTLIST = 18;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = "claude-matching:";

export type MatchMode = "claude" | "fallback";

export interface AffinerResult {
  scored: ScoredAap[];
  mode: MatchMode;
  error?: string;
}

interface ClaudeResultItem {
  id: string;
  score_semantique: number;
  raisons: string[];
  points_attention: string[];
  elements_manquants: string[];
}

// ── Cache localStorage ───────────────────────────────────────────────
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
    t: projet.trl,
    r: projet.region,
    f: projet.financementRecherche,
    m: projet.motsClesLibres,
    ids: [...ids].sort(),
  });
  return CACHE_PREFIX + hashStr(fp);
}

function readCache(key: string): AffinerResult | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, result } = JSON.parse(raw) as { at: number; result: AffinerResult };
    if (Date.now() - at > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

function writeCache(key: string, result: AffinerResult): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), result }));
  } catch {
    /* quota — on ignore */
  }
}

// ── Fusion des scores ────────────────────────────────────────────────
function fuse(structurel: number, semantique: number): number {
  return Math.round(structurel * 0.6 + semantique * 0.4);
}

/**
 * Affine le shortlist Couche 1 avec Claude (Couche 2). Renvoie une liste
 * ScoredAap re-scorée (fusion 60/40), triée, avec raisons/points/éléments
 * manquants en langage naturel. En cas d'indisponibilité, renvoie la liste
 * Couche 1 inchangée avec mode="fallback".
 */
export async function affinerAvecClaude(
  projet: ProjetInput,
  scored: ScoredAap[],
): Promise<AffinerResult> {
  const shortlist = scored.slice(0, MAX_SHORTLIST);
  const ids = shortlist.map((s) => s.aap.id);

  if (shortlist.length === 0) return { scored, mode: "fallback", error: "Aucun AAP à affiner." };

  const key = cacheKey(projet, ids);
  const cached = readCache(key);
  if (cached) return cached;

  if (!supabase) {
    return { scored, mode: "fallback", error: "Supabase non configuré." };
  }

  try {
    const { data, error } = await supabase.functions.invoke("claude-matching", {
      body: {
        projet,
        aaps: shortlist.map((s) => ({
          id: s.aap.id,
          titre: s.aap.titre,
          description: s.aap.description,
          thematiques: s.aap.thematiques,
          type_action: s.aap.type_action,
          cluster: s.aap.cluster,
          trl_min: s.aap.trl_min,
          trl_max: s.aap.trl_max,
        })),
      },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.message || data.error);

    const items: ClaudeResultItem[] = data?.results ?? [];
    const byId = new Map(items.map((r) => [r.id, r]));

    // Enrichit le shortlist ; le reste de la liste conserve son score structurel.
    const enrichedShortlist: ScoredAap[] = shortlist.map((s) => {
      const c = byId.get(s.aap.id);
      if (!c) return s;
      return {
        ...s,
        score: fuse(s.score, c.score_semantique),
        raisons: c.raisons?.length ? c.raisons : s.raisons,
        points_attention: c.points_attention?.length ? c.points_attention : s.points_attention,
        elements_manquants: c.elements_manquants ?? [],
        enrichi: true,
        score_structurel: s.score,
        score_semantique: c.score_semantique,
      };
    });

    const rest = scored.slice(MAX_SHORTLIST);
    const merged = [...enrichedShortlist, ...rest].sort((a, b) => b.score - a.score);

    const result: AffinerResult = { scored: merged, mode: "claude" };
    writeCache(key, result);
    return result;
  } catch (e) {
    return { scored, mode: "fallback", error: e instanceof Error ? e.message : String(e) };
  }
}
