// ──────────────────────────────────────────────────────────────────────
// Services projets V3 : lecture d'un projet et CRUD (création, édition,
// désactivation). Réexporté par services/programmes.ts (barrel).
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { ProgrammeId, ProjetV3 } from "@/types/programme";

/** Projets d'un programme (V3 = programme_id IS NOT NULL). Filtre optionnel par cohorte. */
export async function getProjetsByProgramme(
  programmeId: ProgrammeId,
  cohorte?: number | null,
): Promise<ProjetV3[]> {
  if (!supabase) return [];
  let q = supabase
    .from("projets")
    .select("*")
    .eq("programme_id", programmeId)
    .eq("actif", true)
    .order("nom");
  if (cohorte != null) q = q.eq("cohorte", cohorte);
  const { data, error } = await q;
  if (error) throw new Error(`getProjetsByProgramme: ${error.message}`);
  return (data ?? []) as ProjetV3[];
}

/** Fiche projet complète (une seule ligne). */
export async function getProjetV3(id: string): Promise<ProjetV3 | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("projets").select("*").eq("id", id).single();
  // PGRST116 = introuvable → null ; autres erreurs propagées (voir getProgramme).
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`getProjetV3: ${error.message}`);
  }
  return data as ProjetV3;
}

/** Mettre à jour un projet existant. Le programme_id n'est volontairement pas modifiable. */
export async function updateProjet(
  id: string,
  patch: {
    nom?: string;
    statut?: "idee" | "prototype" | "industrialise";
    sponsor?: string | null;
    description?: string | null;
    trl?: number | null;
    mots_cles?: string[];
    porteurs?: Array<{ nom: string; role: string; entite: string }>;
    data?: Record<string, unknown>;
    cohorte?: number | null;
  },
): Promise<void> {
  if (!supabase) return;
  const row: Record<string, unknown> = { ...patch };
  if (patch.nom !== undefined) row.nom = patch.nom.trim();
  row.updated_at = new Date().toISOString();
  // .select() renvoie les lignes réellement modifiées : si RLS filtre tout
  // (droits insuffisants), PostgREST répond 204 sans erreur — on lève nous-mêmes.
  const { data, error } = await supabase.from("projets").update(row).eq("id", id).select("id");
  if (error) throw new Error(`updateProjet: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      "Modification non enregistrée — droits insuffisants sur ce projet (rôle Éditeur : seuls vos projets sont modifiables).",
    );
  }
}

/** Désactive un projet (actif=false). Il disparaît des vues et de la boucle de veille. */
export async function desactiverProjet(id: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("projets")
    .update({ actif: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`desactiverProjet: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      "Désactivation non enregistrée — droits insuffisants sur ce projet (rôle Éditeur : seuls vos projets sont modifiables).",
    );
  }
}

/** Créer un nouveau projet V3 rattaché à un programme. */
export async function createProjet(input: {
  programme_id: ProgrammeId;
  nom: string;
  statut: "idee" | "prototype" | "industrialise";
  sponsor?: string | null;
  description?: string | null;
  trl?: number | null;
  mots_cles?: string[];
  porteurs?: Array<{ nom: string; role: string; entite: string }>;
  data?: Record<string, unknown>;
  cohorte?: number | null;
}): Promise<{ id: string } | null> {
  if (!supabase) return null;
  // owner_id = créateur : requis par la policy RLS UPDATE (is_admin() OU
  // editeur+owner). Sans lui, l'éditeur ne pourrait jamais rééditer son projet.
  const { data: auth } = await supabase.auth.getUser();
  const row = {
    programme_id: input.programme_id,
    nom: input.nom.trim(),
    statut: input.statut,
    actif: true,
    owner_id: auth.user?.id ?? null,
    sponsor: input.sponsor ?? null,
    description: input.description ?? null,
    trl: input.trl ?? null,
    mots_cles: input.mots_cles ?? [],
    porteurs: input.porteurs ?? [],
    data: input.data ?? {},
    cohorte: input.cohorte ?? null,
  };
  const { data, error } = await supabase.from("projets").insert(row).select("id").single();
  if (error) throw new Error(`createProjet: ${error.message}`);
  return data as { id: string };
}
