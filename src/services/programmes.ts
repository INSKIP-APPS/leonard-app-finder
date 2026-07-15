// ──────────────────────────────────────────────────────────────────────
// Services V3 : lecture des programmes et projets rattachés
// ──────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { Programme, ProgrammeId, ProjetV3 } from "@/types/programme";

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
  if (error) return null;
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
    .not("programme_id", "is", null);
  if (error) throw new Error(`getProjetsCountByProgramme: ${error.message}`);
  const counts: Record<string, number> = { ...empty };
  (data ?? []).forEach((r: { programme_id: string | null }) => {
    if (r.programme_id) counts[r.programme_id] = (counts[r.programme_id] ?? 0) + 1;
  });
  return counts as Record<ProgrammeId, number>;
}

/** Projets d'un programme (V3 = programme_id IS NOT NULL). */
export async function getProjetsByProgramme(programmeId: ProgrammeId): Promise<ProjetV3[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projets")
    .select("*")
    .eq("programme_id", programmeId)
    .order("nom");
  if (error) throw new Error(`getProjetsByProgramme: ${error.message}`);
  return (data ?? []) as ProjetV3[];
}

/** Fiche projet complète (une seule ligne). */
export async function getProjetV3(id: string): Promise<ProjetV3 | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("projets").select("*").eq("id", id).single();
  if (error) return null;
  return data as ProjetV3;
}

// ── Boucle de veille : lecture des projet_aap ────────────────────────
export interface ProjetAap {
  id: string;
  projet_id: string;
  aap_id: string;
  score: number;
  tier: "prioritaire" | "a_etudier" | null;
  raison: string | null;
  motif_ecart: string | null;
  statut_user:
    | "propose"
    | "a_instruire"
    | "ecarte"
    | "candidate"
    | "obtenu"
    | "refuse";
  detecte_le: string;
  evalue_le: string;
  actif: boolean;
  vu: boolean;
  aap?: {
    id: string;
    titre: string;
    source: string;
    programme: string | null;
    statut: string;
    date_cloture: string | null;
  };
}

/** Marque une recommandation comme vue par l'utilisateur (sort de "Nouveautés"). */
export async function marquerAapVu(projetAapId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("mark_projet_aap_vu", { p_id: projetAapId });
  if (error) throw new Error(`marquerAapVu: ${error.message}`);
}

/** Recommandations de veille d'un projet — jointes aux AAP pour l'affichage. */
export async function getProjetAaps(projetId: string): Promise<ProjetAap[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projet_aap")
    .select(
      "id, projet_id, aap_id, score, tier, raison, motif_ecart, statut_user, detecte_le, evalue_le, actif, vu, aap:aaps(id, titre, source, programme, statut, date_cloture)",
    )
    .eq("projet_id", projetId)
    .order("score", { ascending: false });
  if (error) throw new Error(`getProjetAaps: ${error.message}`);
  return (data ?? []) as unknown as ProjetAap[];
}

/** Lance la veille pour un projet (ou tous si projetId omis). */
export async function runVeille(projetId?: string): Promise<{ ok: boolean; message?: string; stats?: Record<string, number> }> {
  if (!supabase) return { ok: false, message: "Supabase non configuré." };
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, message: "Session expirée — reconnectez-vous." };
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    const res = await fetch(`${url}/functions/v1/run-veille`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
      body: JSON.stringify(projetId ? { projet_id: projetId } : {}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) {
      return { ok: false, message: body?.error || `HTTP ${res.status}` };
    }
    return { ok: true, stats: body };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
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
  },
): Promise<void> {
  if (!supabase) return;
  const row: Record<string, unknown> = { ...patch };
  if (patch.nom !== undefined) row.nom = patch.nom.trim();
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from("projets").update(row).eq("id", id);
  if (error) throw new Error(`updateProjet: ${error.message}`);
}

/** Désactive un projet (actif=false). Il disparaît des vues et de la boucle de veille. */
export async function desactiverProjet(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("projets")
    .update({ actif: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`desactiverProjet: ${error.message}`);
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
}): Promise<{ id: string } | null> {
  if (!supabase) return null;
  const row = {
    programme_id: input.programme_id,
    nom: input.nom.trim(),
    statut: input.statut,
    actif: true,
    sponsor: input.sponsor ?? null,
    description: input.description ?? null,
    trl: input.trl ?? null,
    mots_cles: input.mots_cles ?? [],
    porteurs: input.porteurs ?? [],
    data: input.data ?? {},
  };
  const { data, error } = await supabase.from("projets").insert(row).select("id").single();
  if (error) throw new Error(`createProjet: ${error.message}`);
  return data as { id: string };
}
