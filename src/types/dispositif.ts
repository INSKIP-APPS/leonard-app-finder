// ──────────────────────────────────────────────────────────────────────
// Schéma TypeScript « Dispositif » — miroir des 48 colonnes de
// Sourcing_Dispositifs_2_0.xlsx (247 entrées)
// ──────────────────────────────────────────────────────────────────────

/** Niveau géographique du dispositif */
export type Echelle = "EU" | "National" | "Régional";

/** Temporalité du dispositif (col 5) */
export type StatutTemporalite = "Récurrent" | "Permanent";

/** État courant du dispositif (col 6) */
export type StatutOuverture = "Ouvert" | "Fermé" | "À surveiller";

/** Pertinence vis-à-vis des activités VINCI (col 7) */
export type PertinenceVinci = "Forte" | "Moyenne" | "Faible";

/** Niveau de priorité pour les fiches deep-dive (col 21) */
export type PrioriteDeepDive = "Prio 1" | "Prio 2" | "Prio 3" | "Hors périmètre";

// ── Thématiques (16 booléens, cols 22-38) ────────────────────────────
export interface Thematiques {
  construction_btp: boolean;
  renovation_batiment: boolean;
  transition_energetique: boolean;
  energies_renouvelables: boolean;
  efficacite_energetique: boolean;
  decarbonation_industrie: boolean;
  mobilite_decarbonee: boolean;
  hydrogene: boolean;
  numerique_ia_iot_bim: boolean;
  robotique_automatisation: boolean;
  economie_circulaire: boolean;
  materiaux_biosources: boolean;
  gestion_eau: boolean;
  adaptation_climatique: boolean;
  infrastructures_durables: boolean;
  amenagement_urbanisme: boolean;
  recherche_developpement: boolean;
}

// ── Acteurs ciblés (9 booléens, cols 39-47) ──────────────────────────
export interface ActeursCibles {
  startup: boolean;
  pme: boolean;
  eti: boolean;
  grand_groupe: boolean;
  collectivite: boolean;
  laboratoire_universite: boolean;
  consortium: boolean;
  agriculteur: boolean;
  bailleur_social: boolean;
}

// ── Labels pour l'affichage ──────────────────────────────────────────
export const THEMATIQUE_LABELS: Record<keyof Thematiques, string> = {
  construction_btp: "Construction & BTP",
  renovation_batiment: "Rénovation bâtiment",
  transition_energetique: "Transition énergétique",
  energies_renouvelables: "Énergies renouvelables",
  efficacite_energetique: "Efficacité énergétique",
  decarbonation_industrie: "Décarbonation industrie",
  mobilite_decarbonee: "Mobilité décarbonée",
  hydrogene: "Hydrogène",
  numerique_ia_iot_bim: "Numérique (IA / IoT / BIM)",
  robotique_automatisation: "Robotique & automatisation",
  economie_circulaire: "Économie circulaire",
  materiaux_biosources: "Matériaux & biosourcés",
  gestion_eau: "Gestion de l'eau",
  adaptation_climatique: "Adaptation climatique",
  infrastructures_durables: "Infrastructures durables",
  amenagement_urbanisme: "Aménagement & urbanisme",
  recherche_developpement: "Recherche & développement",
};

export const ACTEUR_LABELS: Record<keyof ActeursCibles, string> = {
  startup: "Start-up",
  pme: "PME",
  eti: "ETI",
  grand_groupe: "Grand groupe",
  collectivite: "Collectivité",
  laboratoire_universite: "Laboratoire / Université",
  consortium: "Consortium",
  agriculteur: "Agriculteur",
  bailleur_social: "Bailleur social",
};

// ── Schéma principal ─────────────────────────────────────────────────
export interface Dispositif {
  /** Identifiant unique (ex: "disp-001") */
  id: string;

  /** Numéro d'ordre dans l'Excel */
  numero: number;

  // ── Périmètre et nature (cols 1-8) ──
  /** Organisme porteur (Commission européenne, Bpifrance, ADEME, Région…) */
  organisme: string;

  /** Niveau géographique */
  echelle: Echelle;

  /** Programme cadre (Horizon Europe, France 2030, ADEME…) */
  programme: string;

  /** Nom complet du dispositif */
  nom: string;

  /** Temporalité : Récurrent ou Permanent */
  statut_temporalite: StatutTemporalite | null;

  /** État courant : Ouvert, Fermé, À surveiller */
  statut_ouverture: StatutOuverture | null;

  /** Pertinence VINCI : Forte, Moyenne, Faible */
  pertinence_vinci: PertinenceVinci | null;

  /** URL vers la page officielle du dispositif */
  lien_officiel: string | null;

  // ── Structure et type de financement (cols 9-12) ──
  /** Format : Subvention, Prêt, Avance récupérable, Equity, etc. */
  type_financement: string | null;

  /** Périmètre des dépenses finançables */
  perimetre_financement: string | null;

  /** Fourchette indicative : <100k€, 100k€–1M€, 1–5M€, >5M€ */
  montant: string | null;

  /** Taux maximum de financement (texte, peut contenir "100 (RIA) / 70 (IA)") */
  taux_max: string | null;

  // ── Critères et modalités (cols 13-18) ──
  /** TRL minimum requis (null si non applicable) */
  trl_min: number | null;

  /** TRL maximum ciblé (null si non applicable) */
  trl_max: number | null;

  /** Thématiques couvertes (texte libre, séparées par " | ") */
  thematiques_texte: string | null;

  /** Acteurs ciblés (texte libre, séparées par " | ") */
  acteurs_texte: string | null;

  /** Modalités et critères d'éligibilité */
  modalites_criteres: string | null;

  /** Difficulté de mise en place */
  difficulte: string | null;

  // ── Retour analyse (cols 19-21) ──
  /** Tags internes */
  tags: string | null;

  /** Commentaires d'analyse */
  commentaires: string | null;

  /** Niveau de priorité pour les fiches approfondies */
  priorite_deep_dive: PrioriteDeepDive | null;

  // ── Booléens thématiques (cols 22-38) ──
  /** 17 booléens thématiques pour le filtrage rapide */
  thematiques: Thematiques;

  /** Liste des thématiques cochées (pour l'affichage) */
  thematiques_liste: string[];

  // ── Booléens acteurs (cols 39-47) ──
  /** 9 booléens acteurs pour le filtrage rapide */
  acteurs_cibles: ActeursCibles;

  /** Liste des acteurs ciblés (pour l'affichage) */
  acteurs_liste: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Extrait les thématiques actives d'un dispositif */
export function getActiveThematiques(d: Dispositif): string[] {
  return d.thematiques_liste;
}

/** Extrait les acteurs ciblés d'un dispositif */
export function getActiveActeurs(d: Dispositif): string[] {
  return d.acteurs_liste;
}

/** Vérifie si un dispositif est ouvert */
export function isOuvert(d: Dispositif): boolean {
  return d.statut_ouverture === "Ouvert";
}

/** Vérifie si un dispositif cible un type d'acteur donné */
export function cibleActeur(d: Dispositif, acteur: keyof ActeursCibles): boolean {
  return d.acteurs_cibles[acteur];
}

/** Profils Leonard correspondants */
export type ProfilLeonard = "BU" | "Startup" | "Prospective";

/** Évalue la pertinence pour un profil Leonard donné */
export function pertinencePourProfil(d: Dispositif, profil: ProfilLeonard): boolean {
  switch (profil) {
    case "BU":
      return d.acteurs_cibles.grand_groupe || d.acteurs_cibles.eti || d.acteurs_cibles.pme;
    case "Startup":
      return d.acteurs_cibles.startup;
    case "Prospective":
      return (
        d.acteurs_cibles.laboratoire_universite ||
        d.acteurs_cibles.consortium ||
        (d.trl_min !== null && d.trl_min <= 4)
      );
  }
}
