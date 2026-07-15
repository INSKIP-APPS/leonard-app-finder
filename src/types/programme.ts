// ──────────────────────────────────────────────────────────────────────
// Types V3 — Programmes Leonard (Intrapreneur, Seed, Catalyst, Programme IA)
// et projets rattachés à un programme.
// ──────────────────────────────────────────────────────────────────────

export type ProgrammeId =
  | "intrapreneur"
  | "seed"
  | "catalyst"
  | "ia"
  | "prospective"
  | "scaleup";
export type ProjetStatut = "idee" | "prototype" | "industrialise";

export interface Programme {
  id: ProgrammeId;
  nom: string;
  sous_titre: string | null;
  couleur: string | null;
  ordre: number;
  publie: boolean;
}

export interface Porteur {
  nom: string;
  role: string;
  entite: string;
}

/** Enrichissement V3 stocké dans la colonne `data` jsonb. */
export interface ProjetData {
  secteurs?: string[];
  thematiques?: string[];
  localisation?: string[];
  consortium?: "ouvert" | "ferme" | "non_applicable";
  partenaires?: string;
  besoin_financement?: "<100k€" | "100k-1M€" | "1-5M€" | ">5M€";
  trl_vise?: number;
  type_acteur?: string;
}

export interface ProjetV3 {
  id: string;
  programme_id: ProgrammeId | null;
  nom: string;
  statut: ProjetStatut | null;
  actif: boolean;
  sponsor: string | null;
  filiale: string | null;
  description: string | null;
  trl: number | null;
  mots_cles: string[];
  porteurs: Porteur[];
  data: ProjetData | null;
  owner_id: string | null;
  derniere_veille_le: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUT_LABEL: Record<ProjetStatut, string> = {
  idee: "Idée",
  prototype: "Prototype",
  industrialise: "Industrialisé",
};

export const STATUT_TONE: Record<ProjetStatut, string> = {
  idee: "bg-[#FDF1DE] text-[#C77700]",
  prototype: "bg-[#FDE7EE] text-[#E6175C]",
  industrialise: "bg-[#ECE8FB] text-[#2A1A6E]",
};
