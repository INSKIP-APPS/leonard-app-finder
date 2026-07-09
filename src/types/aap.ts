// ──────────────────────────────────────────────────────────────────────
// Schéma TypeScript « AAP » — appel à projets scrapé (SEDIA, Aides-territoires,
// les-aides.fr…). Le scraping tourne côté serveur : voir supabase/functions/.
// ──────────────────────────────────────────────────────────────────────

/** Statut d'un topic sur le portail Funding & Tenders */
export type AAPStatut = "open" | "forthcoming" | "closed";

/** Type d'action normalisé (Horizon Europe) */
export type TypeAction = "RIA" | "IA" | "CSA" | "COFUND" | "EIC" | "Autre";

export interface AAP {
  /** Topic ID (ex: "HORIZON-CL5-2026-D3-01-02") */
  id: string;

  /** Intitulé du topic */
  titre: string;

  /** Programme cadre (ex: "Horizon Europe") */
  programme: string;

  /** Pilier (ex: "Pilier II", "Pilier III", "Missions", "Partenariats") — null si indéterminé */
  pilier: string | null;

  /** Cluster / sous-programme (ex: "CL5", "EIC", "MSCA") — null si indéterminé */
  cluster: string | null;

  /** Identifiant de l'appel parent (ex: "HORIZON-CL5-2026-D3-01") */
  call_identifier: string | null;

  /** Description en texte brut (HTML nettoyé) */
  description: string;

  /** Type d'action normalisé */
  type_action: TypeAction;

  /** Libellé complet du type d'action tel que renvoyé par l'API */
  type_action_detail: string | null;

  /** Statut courant */
  statut: AAPStatut;

  /** Date d'ouverture / publication prévue (ISO 8601) */
  date_ouverture: string | null;

  /** Date de clôture / deadline (ISO 8601) */
  date_cloture: string | null;

  /** Budget total indicatif du topic (€) */
  budget_total: number | null;

  /** Budget maximum par projet (€) — null si non renseigné */
  budget_par_projet: number | null;

  /** TRL minimum attendu (extrait de la description, best-effort) */
  trl_min: number | null;

  /** TRL maximum ciblé (extrait de la description, best-effort) */
  trl_max: number | null;

  /** Mots-clés (identifiants d'appel + termes thématiques détectés) */
  mots_cles: string[];

  /** Thématiques mappées sur la taxonomie du CDC (labels de THEMATIQUE_LABELS) */
  thematiques: string[];

  /** Acteurs éligibles détectés (best-effort) */
  acteurs_eligibles: string[];

  /** URL vers la page officielle du topic */
  lien_officiel: string;

  /** FK vers la base dispositifs (id du dispositif rattaché) — null si non rattaché */
  dispositif_id: string | null;

  /** Source du scraping */
  source: string;

  /** Échelle géographique (AAP France : National/Régional… ; EU par défaut) */
  echelle?: string | null;

  /** Montants en texte libre (sources françaises : les-aides.fr, ADEME…) */
  montants?: string | null;

  /** Nom de la région pour les aides régionales/locales (rempli par les
   *  connecteurs — Aides-territoires notamment). Null si non résolu. */
  region?: string | null;

  /**
   * Autres sources où le MÊME AAP est référencé (dédup inter-sources).
   * Rempli à la lecture par getAaps() : une aide relayée par plusieurs portails
   * n'apparaît qu'une fois (source prioritaire), les autres portails sont listés ici.
   */
  sources_multiples?: string[] | null;

  /** Horodatage du scraping (ISO 8601) */
  date_scraping: string;
}
