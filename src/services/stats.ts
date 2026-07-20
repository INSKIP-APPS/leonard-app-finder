// ──────────────────────────────────────────────────────────────────────
// Agrégats analytiques par projet (vue Analyse). Réexporté par
// services/programmes.ts (barrel).
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { ProgrammeId } from "@/types/programme";

export interface ProjetStats {
  projet_id: string;
  retenus: number;
  prioritaires: number;
  nouveautes: number;
  deadlines_30j: number;
  candidatures: number;
}

/**
 * Agrégats projet_aap par projet pour la vue analyse (perf #1). Délégué à la
 * base via le RPC `stats_par_projet` (GROUP BY côté Postgres) au lieu de
 * paginer toutes les lignes puis agréger côté client. Logique identique,
 * validée ligne à ligne (11/11 projets Intrapreneur) contre l'ancienne version.
 */
export async function getStatsParProjet(
  programmeId: ProgrammeId,
  cohorte?: number | null,
): Promise<Record<string, ProjetStats>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("stats_par_projet", {
    p_programme: programmeId,
    p_cohorte: cohorte ?? null,
  });
  if (error) throw new Error(`getStatsParProjet: ${error.message}`);
  const stats: Record<string, ProjetStats> = {};
  for (const r of (data ?? []) as ProjetStats[]) {
    stats[r.projet_id] = {
      projet_id: r.projet_id,
      retenus: r.retenus,
      prioritaires: r.prioritaires,
      nouveautes: r.nouveautes,
      deadlines_30j: r.deadlines_30j,
      candidatures: r.candidatures,
    };
  }
  return stats;
}
