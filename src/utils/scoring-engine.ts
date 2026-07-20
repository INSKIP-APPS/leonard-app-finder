// ──────────────────────────────────────────────────────────────────────
// Moteur de scoring — Couche 1 : structurel, automatique, sans API (Phase 4.1–4.5)
//
// Opère sur le schéma AAP réel (src/types/aap.ts) et un ProjetInput saisi dans
// la page Matching. Produit, pour chaque AAP non exclu :
//   • un score d'ADÉQUATION      (0-100) — pertinence méritée : thématiques + mots-clés
//   • un score d'ACCESSIBILITÉ   (0-100) — facilité de montage du dossier
//   • un score FINANCIER         (0-100) — attractivité / couverture du besoin
//   • un SCORE COMPOSITE = 0.80·adéquation + 0.12·accessibilité + 0.08·financier
// + des raisons et points d'attention en langage naturel (base de la Couche 2 Claude).
// ──────────────────────────────────────────────────────────────────────

import type { AAP } from "@/types/aap";
import { THEMATIQUE_LABELS, type Thematiques } from "@/types/dispositif";
import { stripAccents as norm } from "./text";

export interface ProjetInput {
  nom: string;
  description: string;
  profil?: "BU" | "Startup" | "GT";
  /** Type d'acteur brut du formulaire (filtre acteurs éligibles, V2.1). */
  typeActeur?: string;
  secteurs: string[]; // libellés de la liste SECTEURS du formulaire
  trl?: number;
  region?: string;
  budgetTotal?: string; // texte libre, ex "2,5 M€"
  financementRecherche?: string; // texte libre
  typeFinancement?: string;
  motsClesLibres?: string;
}

export interface SousScores {
  adequation: number;
  accessibilite: number;
  financier: number;
}

export interface ScoredAap {
  aap: AAP;
  score: number;
  sous_scores: SousScores;
  raisons: string[];
  points_attention: string[];
  // ── Enrichissement Couche 2 (Claude) — optionnel ──
  /** true si l'AAP a été affiné par Claude */
  enrichi?: boolean;
  /** score composite structurel avant fusion (Couche 1) */
  score_structurel?: number;
  /** score sémantique Claude 0-100 (Couche 2) */
  score_semantique?: number;
  /** éléments manquants suggérés par Claude */
  elements_manquants?: string[];
}

// ── Secteur du formulaire → labels de thématiques (taxonomie CDC) ────
const SECTEUR_TO_THEMATIQUE_KEYS: Record<string, (keyof Thematiques)[]> = {
  Construction: [
    "construction_btp",
    "renovation_batiment",
    "infrastructures_durables",
    "amenagement_urbanisme",
  ],
  Numérique: ["numerique_ia_iot_bim", "robotique_automatisation"],
  Énergie: [
    "transition_energetique",
    "energies_renouvelables",
    "efficacite_energetique",
    "hydrogene",
  ],
  Mobilité: ["mobilite_decarbonee"],
  Eau: ["gestion_eau"],
  Environnement: ["adaptation_climatique", "economie_circulaire"],
  Matériaux: ["materiaux_biosources"],
  Industrie: ["decarbonation_industrie", "robotique_automatisation"],
};

function secteursToThematiques(secteurs: string[]): string[] {
  const labels = new Set<string>();
  for (const s of secteurs) {
    for (const k of SECTEUR_TO_THEMATIQUE_KEYS[s] ?? []) labels.add(THEMATIQUE_LABELS[k]);
  }
  return [...labels];
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Parse un montant en euros depuis un texte libre ("2,5 M€", "800 k€", "1 000 000"). */
export function parseMontantEuros(txt?: string): number | null {
  if (!txt) return null;
  const t = norm(txt).replace(/\s/g, "").replace(",", ".");
  const m = t.match(/([\d.]+)\s*(m|k)?/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (isNaN(val)) return null;
  if (m[2] === "m" || /m€|meur|million/.test(t)) return val * 1_000_000;
  if (m[2] === "k" || /k€|keur/.test(t)) return val * 1_000;
  return val;
}

export function joursRestants(dateCloture: string | null): number | null {
  if (!dateCloture) return null;
  const cl = new Date(dateCloture).getTime();
  if (isNaN(cl)) return null;
  return Math.ceil((cl - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Statut EFFECTIF d'un AAP. Certaines sources (SEDIA notamment) laissent des
 * topics en `open` alors que leur date de clôture est déjà passée : on les
 * considère clôturés. Corrige le comptage des « AAP ouverts » et l'affichage.
 */
export function statutEffectif(a: Pick<AAP, "statut" | "date_cloture">): AAP["statut"] {
  if (a.statut === "open") {
    const jr = joursRestants(a.date_cloture);
    if (jr !== null && jr < 0) return "closed";
  }
  return a.statut;
}

// ── 4.1 — Critères d'exclusion ───────────────────────────────────────

/**
 * Renvoie la raison d'exclusion, ou null si l'AAP passe le filtre.
 * `kws` (mots-clés du projet) et `hay` (texte normalisé de l'AAP) peuvent être
 * fournis par l'appelant pour éviter de les recalculer par AAP (chemin chaud :
 * matchProjet les hoiste) ; sinon ils sont dérivés ici, à l'identique.
 */
export function exclusion(
  aap: AAP,
  projet: ProjetInput,
  projThemes: string[],
  kws?: string[],
  hay?: string,
): string | null {
  // Deadline passée
  const jr = joursRestants(aap.date_cloture);
  if (aap.statut === "closed" || (jr !== null && jr < 0)) return "Appel clôturé";

  // TRL éloigné de plus de 2 points de la fourchette cible
  if (projet.trl != null && aap.trl_min != null && aap.trl_max != null) {
    const gap =
      projet.trl < aap.trl_min
        ? aap.trl_min - projet.trl
        : projet.trl > aap.trl_max
          ? projet.trl - aap.trl_max
          : 0;
    if (gap > 2)
      return `TRL projet (${projet.trl}) trop éloigné de la cible (TRL ${aap.trl_min}–${aap.trl_max})`;
  }

  // Aucun lien sectoriel : si le projet a précisé des secteurs et qu'il n'y a
  // aucun recoupement thématique NI aucun mot-clé commun → exclu.
  if (projThemes.length > 0) {
    const themeOverlap = aap.thematiques.some((t) => projThemes.includes(t));
    const h = hay ?? aapHaystack(aap);
    const kwOverlap = (kws ?? keywordsFromProjet(projet)).some((k) => h.includes(k));
    if (!themeOverlap && !kwOverlap) return "Aucun lien sectoriel ou thématique avec le projet";
  }
  return null;
}

/** Texte normalisé d'un AAP pour la recherche de mots-clés (coûteux : à calculer 1× par AAP). */
function aapHaystack(aap: AAP): string {
  return norm(`${aap.titre} ${aap.description} ${aap.mots_cles.join(" ")}`);
}

// ── Mots-clés du projet (pour la pertinence sémantique légère) ───────
// Mots fréquents mais non discriminants (FR + EN) : exclus pour que les
// mots-clés retenus portent réellement le sujet, pas du bruit de langage.
const STOPWORDS = new Set(
  (
    "pour dans avec les des une aux sur par plus leur nos vos ces cette sont etre leurs " +
    "projet projets entreprise entreprises innovation innovant developpement systeme solution " +
    "solutions cadre acteur acteurs euros million millions vinci type nouvelle nouveau objectif " +
    "long production mise place votre notre ainsi afin dont entre " +
    "with that this from will your the and for les"
  ).split(/\s+/),
);

function keywordsFromProjet(projet: ProjetInput): string[] {
  const raw = `${projet.nom} ${projet.description} ${projet.motsClesLibres ?? ""}`;
  return [
    ...new Set(
      norm(raw)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  ];
}

// ── 4.2 — Adéquation projet / AAP (0-100) ────────────────────────────
//
// Score MÉRITÉ, dominé par la pertinence réelle (recoupement thématique +
// mots-clés), sans plancher artificiel. Ancienne version : profil=70 et
// géo=90 constants + 1 seule thématique = 70 → tout montait à ~75 (des
// milliers de « prioritaires »). Ici :
//   • recoupement thématique par NOMBRE de thématiques communes (barème ↓) ;
//   • mots-clés = signal de spécificité (il en faut plusieurs pour saturer) ;
//   • adéquation = 60 % thématique + 40 % mots-clés (aucun autre terme).
// Le TRL et le géo ne gonflent plus le score (le TRL reste un filtre dur via
// exclusion() ; il est juste rappelé en clair s'il est dans la cible).
const THEME_SCORE = [15, 40, 65, 85, 100]; // index = nb de thématiques communes (max 4)

function scoreAdequation(
  aap: AAP,
  projet: ProjetInput,
  projThemes: string[],
  kws: string[],
  hay: string,
): { score: number; raisons: string[] } {
  const raisons: string[] = [];

  const inter = aap.thematiques.filter((t) => projThemes.includes(t));
  const hits = kws.filter((k) => hay.includes(k));
  const kwScore = clamp(Math.min(hits.length, 6) * 17); // 6 mots-clés → 100

  let score: number;
  if (projThemes.length > 0) {
    const themeScore = THEME_SCORE[Math.min(inter.length, 4)];
    score = clamp(0.6 * themeScore + 0.4 * kwScore);
    if (inter.length > 0) raisons.push(`Alignement thématique : ${inter.join(", ")}`);
  } else {
    // Pas de secteur déclaré → pertinence portée uniquement par les mots-clés.
    score = kwScore;
  }

  if (hits.length >= 2) raisons.push(`Mots-clés en commun : ${hits.slice(0, 4).join(", ")}`);

  // TRL : purement informatif (n'entre plus dans le score ; exclusion() écarte
  // déjà les écarts > 2 points).
  if (
    projet.trl != null &&
    aap.trl_min != null &&
    aap.trl_max != null &&
    projet.trl >= aap.trl_min &&
    projet.trl <= aap.trl_max
  ) {
    raisons.push(
      `TRL du projet (${projet.trl}) dans la cible de l'AAP (${aap.trl_min}–${aap.trl_max})`,
    );
  }

  return { score, raisons };
}

// ── 4.3 — Accessibilité du dossier (0-100, ↑ = plus accessible) ──────
function scoreAccessibilite(aap: AAP): { score: number; points: string[] } {
  const points: string[] = [];
  let score = 100;

  // Exigence de consortium (RIA/IA en général multi-partenaires)
  if (aap.type_action === "RIA" || aap.type_action === "IA") {
    score -= 20;
    points.push("Consortium multi-pays généralement requis (RIA/IA)");
  } else if (aap.type_action === "COFUND") {
    score -= 10;
  }

  // Maturité attendue élevée
  if (aap.trl_min != null && aap.trl_min >= 7) {
    score -= 10;
    points.push("Niveau de maturité élevé attendu (TRL ≥ 7)");
  }

  // Exigence de co-financement (IA financée ~70 %)
  if (aap.type_action === "IA") {
    score -= 15;
    points.push("Co-financement à prévoir (taux ~70 % pour les IA)");
  }

  // Proximité de la deadline
  const jr = joursRestants(aap.date_cloture);
  if (jr !== null && jr >= 0) {
    if (jr < 30) {
      score -= 20;
      points.push(`Deadline proche (${jr} j) — dossier à monter vite`);
    } else if (jr < 60) {
      score -= 10;
    }
  }

  // Charge administrative (gros budget = dossier lourd)
  if (aap.budget_par_projet != null && aap.budget_par_projet >= 10_000_000) {
    score -= 10;
    points.push("Dossier conséquent (financement > 10 M€ par projet)");
  }

  return { score: clamp(score), points };
}

/**
 * Difficulté de CANDIDATURE à un AAP (échelle 3 niveaux).
 * Somme de signaux binaires + pondération ; ne dépend pas du dispositif parent
 * (règle validée : calcul uniquement depuis les faits AAP). Seuils :
 *   0-1 → Faible, 2-3 → Moyenne, ≥ 4 → Forte
 * Signaux : programme européen (+2), consortium (+2), co-financement (+1),
 * formalisme France 2030 (+2), TRL étroit (+1), gros budget (+1),
 * deadline serrée (+2).
 */
export function difficulteCandidature(aap: AAP): {
  niveau: "Faible" | "Moyenne" | "Forte";
  points: string[];
} {
  let pts = 0;
  const raisons: string[] = [];

  const desc = norm(aap.description || "");
  const prog = norm(aap.programme || "");
  const isEU = aap.source === "EU Funding & Tenders (SEDIA)";
  const isEICAccelerator = aap.type_action === "EIC" && /accelerator/i.test(aap.type_action_detail || "");
  const isFrance2030 =
    /france 2030|\bpia\b|premiere usine|i-nov|i-demo|projet innovant/.test(prog) ||
    aap.source === "Banque des Territoires (France 2030)";

  // 1. Programme européen : compte dans le score de difficulté mais n'ajoute
  //    plus de point de vigilance affiché (informatif, pas actionnable ;
  //    la source SEDIA et le badge « Forte » disent déjà la même chose).
  if (isEU) {
    pts += 2;
  }

  // 2. Consortium multi-partenaires exigé.
  //  - explicite : type_action ∈ RIA/IA/COFUND
  //  - programme européen (SEDIA) : consortium par défaut sauf EIC Accelerator (mono-startup)
  //  - mots-clés : description mentionne un consortium (FR ou EN)
  const consortiumTypeAction = ["RIA", "IA", "COFUND"].includes(aap.type_action);
  const consortiumSEDIA = isEU && !isEICAccelerator;
  const consortiumMotClef =
    /consortium|consorti\b|multi-partenaires|coordinat(ed|eur) by|eligible entities|beneficiaries must|partners? from|at least [23] (partners|entities|different)|associated countries|different member states/.test(
      desc,
    );
  if (consortiumTypeAction || consortiumSEDIA || consortiumMotClef) {
    pts += 2;
    raisons.push("Consortium multi-partenaires à monter");
  }

  // 3. Co-financement à trouver (Innovation Action ~70 %, COFUND)
  if (aap.type_action === "IA") {
    pts += 1;
    raisons.push("Co-financement à prévoir : 30 % du budget à sécuriser");
  } else if (aap.type_action === "COFUND") {
    pts += 1;
    raisons.push("Co-financement à prévoir avec les agences nationales");
  }

  // 4. France 2030 : compte dans le score de difficulté mais n'ajoute plus
  //    de point de vigilance affiché (vague et pas actionnable — tous les
  //    F2030 ont un jury, ça ne pilote pas une décision).
  if (isFrance2030 && !isEU) {
    pts += 2;
  }

  // 5. Fenêtre TRL étroite — sélection technique forte
  if (
    aap.trl_min != null &&
    aap.trl_max != null &&
    aap.trl_max - aap.trl_min <= 2 &&
    aap.trl_min >= 5
  ) {
    pts += 1;
    raisons.push(`Fenêtre TRL étroite (${aap.trl_min}–${aap.trl_max})`);
  }

  // 6. Dossier lourd — gros budget par projet
  if (aap.budget_par_projet != null && aap.budget_par_projet >= 5_000_000) {
    pts += 1;
    raisons.push("Dossier conséquent (financement > 5 M€ par projet)");
  }

  // 7. Deadline serrée
  const jr = joursRestants(aap.date_cloture);
  if (jr !== null && jr >= 0 && jr < 30) {
    pts += 2;
    raisons.push(`Deadline proche (${jr} j) — dossier à monter vite`);
  }

  const niveau = pts >= 4 ? "Forte" : pts >= 2 ? "Moyenne" : "Faible";
  return { niveau, points: raisons };
}

// ── 4.4 — Adéquation financière (0-100) ──────────────────────────────
function scoreFinancier(aap: AAP, projet: ProjetInput): number {
  const besoin = parseMontantEuros(projet.financementRecherche);
  const parProjet = aap.budget_par_projet ?? null;

  // Cas 2 : besoin renseigné → couverture du besoin
  if (besoin != null && parProjet != null && besoin > 0) {
    const ratio = parProjet / besoin;
    if (ratio >= 1) return 100; // couvre tout le besoin
    return clamp(ratio * 100);
  }

  // Cas 1 : besoin non renseigné → attractivité relative du financement
  if (parProjet != null) {
    if (parProjet >= 10_000_000) return 90;
    if (parProjet >= 3_000_000) return 75;
    if (parProjet >= 1_000_000) return 60;
    return 45;
  }
  if (aap.budget_total != null) return 55; // enveloppe connue, montant/projet inconnu
  return 40;
}

// ── 4.5 — Score composite + assemblage ───────────────────────────────
export function scoreProjet(
  aap: AAP,
  projet: ProjetInput,
  projThemes: string[],
  kws?: string[],
): ScoredAap | null {
  const projKws = kws ?? keywordsFromProjet(projet);
  const hay = aapHaystack(aap);
  if (exclusion(aap, projet, projThemes, projKws, hay)) return null;

  const { score: adequation, raisons } = scoreAdequation(aap, projet, projThemes, projKws, hay);
  const { score: accessibilite, points } = scoreAccessibilite(aap);
  const financier = scoreFinancier(aap, projet);

  // L'adéquation (pertinence réelle) domine ; accessibilité et financier ne
  // sont que des modulateurs légers (évite qu'ils ne gonflent un AAP hors-sujet).
  const score = clamp(adequation * 0.8 + accessibilite * 0.12 + financier * 0.08);

  return {
    aap,
    score,
    sous_scores: { adequation, accessibilite, financier },
    raisons: raisons.slice(0, 3),
    points_attention: points.slice(0, 2),
  };
}

/**
 * Score et classe tous les AAP pour un projet donné (Couche 1).
 * Les AAP exclus (4.1) sont retirés ; le reste est trié par score décroissant.
 */
export function matchProjet(aaps: AAP[], projet: ProjetInput): ScoredAap[] {
  const projThemes = secteursToThematiques(projet.secteurs);
  const kws = keywordsFromProjet(projet); // hoisté : ne dépend que du projet
  return aaps
    .map((a) => scoreProjet(a, projet, projThemes, kws))
    .filter((x): x is ScoredAap => x !== null)
    .sort((a, b) => b.score - a.score);
}

// ──────────────────────────────────────────────────────────────────────
// Scoring par ENTITÉ (page Push, Phase 5) — réutilise le moteur Couche 1
// en convertissant chaque entité / filiale / projet en ProjetInput.
// ──────────────────────────────────────────────────────────────────────

export interface EntiteProjet {
  id: string;
  nom: string;
  mots_cles: string[];
  trl: number;
}
export interface Filiale {
  id: string;
  nom: string;
  secteurs: string[];
  mots_cles: string[];
  projets: EntiteProjet[];
}
export interface Entite {
  id: string;
  nom: string;
  secteurs_prioritaires: string[];
  trl_habituel: string;
  mots_cles_metier: string[];
  profil: string;
  description_profil: string;
  filiales?: Filiale[];
}

/** TRL médian depuis un libellé "TRL 4–7" / "TRL 6". */
function trlMedian(s: string): number {
  const m = s.match(/(\d+)\D+(\d+)/);
  if (m) return Math.round((Number(m[1]) + Number(m[2])) / 2);
  const one = s.match(/(\d+)/);
  return one ? Number(one[1]) : 5;
}

function entiteToProjet(e: Entite): ProjetInput {
  return {
    nom: e.nom,
    description: e.description_profil,
    secteurs: e.secteurs_prioritaires,
    trl: trlMedian(e.trl_habituel),
    motsClesLibres: e.mots_cles_metier.join(" "),
  };
}

function filialeToProjet(e: Entite, f: Filiale): ProjetInput {
  return {
    nom: f.nom,
    description: e.description_profil,
    secteurs: f.secteurs.length ? f.secteurs : e.secteurs_prioritaires,
    trl: trlMedian(e.trl_habituel),
    motsClesLibres: `${f.mots_cles.join(" ")} ${e.mots_cles_metier.join(" ")}`,
  };
}

export interface ScoredForEntite {
  aap: AAP;
  score: number;
}

/** AAP pertinents (score ≥ min) pour une entité, triés décroissant. */
export function aapsForEntite(aaps: AAP[], entite: Entite, min = 60): ScoredForEntite[] {
  const projet = entiteToProjet(entite);
  const projThemes = secteursToThematiques(projet.secteurs);
  const kws = keywordsFromProjet(projet);
  return aaps
    .map((aap) => scoreProjet(aap, projet, projThemes, kws))
    .filter((x): x is ScoredAap => x !== null && x.score >= min)
    .map((x) => ({ aap: x.aap, score: x.score }))
    .sort((a, b) => b.score - a.score);
}

export interface AapForFiliale {
  aap: AAP;
  score: number;
  matchedProjets: EntiteProjet[];
}

/** AAP pertinents pour une filiale, avec bonus si un projet de la filiale matche. */
export function aapsForFiliale(
  aaps: AAP[],
  entite: Entite,
  filiale: Filiale,
  min = 60,
): AapForFiliale[] {
  const projet = filialeToProjet(entite, filiale);
  const projThemes = secteursToThematiques(projet.secteurs);
  const kws = keywordsFromProjet(projet);
  return aaps
    .map((aap) => {
      const s = scoreProjet(aap, projet, projThemes, kws);
      if (!s) return null;
      const matchedProjets = filiale.projets.filter((p) => {
        const ps = scoreProjet(
          aap,
          {
            nom: p.nom,
            description: "",
            secteurs: [],
            trl: p.trl,
            motsClesLibres: p.mots_cles.join(" "),
          },
          [],
        );
        return ps != null && ps.score >= 55;
      });
      const score = matchedProjets.length > 0 ? Math.min(100, s.score + 10) : s.score;
      return { aap: s.aap, score, matchedProjets };
    })
    .filter((x): x is AapForFiliale => x !== null && x.score >= min)
    .sort((a, b) => b.score - a.score);
}

/** AAP pertinents pour la BU mais rattachés à aucune filiale précise. */
export function aapsGeneriquesBU(aaps: AAP[], entite: Entite, min = 60): ScoredForEntite[] {
  const filialeIds = new Set(
    (entite.filiales ?? []).flatMap((f) =>
      aapsForFiliale(aaps, entite, f, min).map((x) => x.aap.id),
    ),
  );
  return aapsForEntite(aaps, entite, min).filter((x) => !filialeIds.has(x.aap.id));
}
