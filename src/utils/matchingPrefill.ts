// ──────────────────────────────────────────────────────────────────────
// Passe-plat entre le tableau de bord et la page matching : quand on clique
// une demande de l'historique, on dépose ici la saisie enregistrée, puis la
// page matching la récupère au montage pour repré-remplir le formulaire et
// relancer la recherche. Volontairement en mémoire (pas d'URL surchargée).
// ──────────────────────────────────────────────────────────────────────

export interface MatchingPrefill {
  nom: string;
  description: string;
  typeActeur: string;
  entitePorteuse: string;
  pole: string;
  typesProjet: string[];
  secteurs: string[];
  trl: string;
  region: string;
  budget: string;
  financement: string;
  partenaires: string[];
  autresInfos: string;
}

let pending: MatchingPrefill | null = null;

/** Construit un prefill à partir d'une ligne `projets` (colonne `data` jsonb). */
export function prefillFromProjet(p: {
  nom?: string;
  description?: string | null;
  data?: Record<string, unknown> | null;
}): MatchingPrefill {
  const d = (p.data ?? {}) as Record<string, unknown>;
  const extra = (d.extra ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    nom: str(d.nom) || p.nom || "",
    description: str(d.description) || str(p.description) || "",
    typeActeur: str(d.profil),
    entitePorteuse: str(d.filiale),
    pole: str(extra.pole),
    typesProjet: arr(extra.typesProjet).length ? arr(extra.typesProjet) : arr(d.motsCles),
    secteurs: arr(d.secteurs),
    trl: d.trl != null ? String(d.trl) : "",
    region: str(d.region),
    budget: str(d.budget),
    financement: str(d.financement),
    partenaires: arr(extra.partenaires),
    autresInfos: str(extra.autresInfos),
  };
}

export function setMatchingPrefill(p: MatchingPrefill): void {
  pending = p;
}

/** Récupère le prefill en attente (et le consomme). */
export function takeMatchingPrefill(): MatchingPrefill | null {
  const p = pending;
  pending = null;
  return p;
}
