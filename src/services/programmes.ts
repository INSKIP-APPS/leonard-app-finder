// ──────────────────────────────────────────────────────────────────────
// Services V3 — programmes Leonard.
//
// Ce fichier ne contient plus que les lectures « programme » (liste, fiche,
// compteurs, cohortes). Les autres domaines ont été extraits pour la lisibilité
// et sont RÉEXPORTÉS ci-dessous — les imports existants `@/services/programmes`
// continuent donc de fonctionner :
//   • projets.ts  — CRUD/lecture des projets
//   • stats.ts    — agrégats analytiques par projet
//   • veille.ts   — recommandations projet_aap, feedback, run-veille, momentum
//   • analyse.ts  — analyse express ad-hoc
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { Programme, ProgrammeId } from "@/types/programme";

export * from "./projets";
export * from "./stats";
export * from "./veille";
export * from "./analyse";

export async function getProgrammes(): Promise<Programme[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("programmes")
    .select("*")
    .eq("publie", true)
    .order("ordre");
  if (error) throw new Error(`getProgrammes: ${error.message}`);
  return (data ?? []) as Programme[];
}

export async function getProgramme(id: ProgrammeId): Promise<Programme | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("programmes").select("*").eq("id", id).single();
  // PGRST116 = 0 ligne (introuvable) → null légitime. Toute autre erreur (réseau,
  // RLS, 500) doit remonter, sinon une panne s'affiche comme « Programme introuvable ».
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`getProgramme: ${error.message}`);
  }
  return data as Programme;
}

/** Compte les projets V3 rattachés à chaque programme. */
export async function getProjetsCountByProgramme(): Promise<Record<ProgrammeId, number>> {
  const empty: Record<ProgrammeId, number> = {
    intrapreneur: 0,
    seed: 0,
    catalyst: 0,
    ia: 0,
    prospective: 0,
    scaleup: 0,
  };
  if (!supabase) return empty;
  const { data, error } = await supabase
    .from("projets")
    .select("programme_id")
    .eq("actif", true)
    .not("programme_id", "is", null);
  if (error) throw new Error(`getProjetsCountByProgramme: ${error.message}`);
  const counts: Record<string, number> = { ...empty };
  (data ?? []).forEach((r: { programme_id: string | null }) => {
    if (r.programme_id) counts[r.programme_id] = (counts[r.programme_id] ?? 0) + 1;
  });
  return counts as Record<ProgrammeId, number>;
}

/** Cohortes distinctes présentes en base pour un programme (utile pour désactiver les tabs vides). */
export async function getCohortesDispo(programmeId: ProgrammeId): Promise<number[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projets")
    .select("cohorte")
    .eq("programme_id", programmeId)
    .not("cohorte", "is", null);
  if (error) throw new Error(`getCohortesDispo: ${error.message}`);
  const set = new Set<number>();
  for (const r of data ?? []) if (r.cohorte != null) set.add(r.cohorte as number);
  return [...set].sort((a, b) => a - b);
}
