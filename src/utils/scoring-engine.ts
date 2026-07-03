// ──────────────────────────────────────────────────────────────────────
// Moteur de scoring — Couche 1 : structurel, automatique, sans API (Phase 4.1–4.5)
//
// Opère sur le schéma AAP réel (src/types/aap.ts) et un ProjetInput saisi dans
// la page Matching. Produit, pour chaque AAP non exclu :
//   • un score d'ADÉQUATION      (0-100, pondération 70%)
//   • un score d'ACCESSIBILITÉ   (0-100, pondération 20%)
//   • un score FINANCIER         (0-100, pondération 10%)
//   • un SCORE COMPOSITE = 0.70·adéquation + 0.20·accessibilité + 0.10·financier
// + des raisons et points d'attention en langage naturel (base de la Couche 2 Claude).
// ──────────────────────────────────────────────────────────────────────

import type { AAP } from "@/types/aap";
import { THEMATIQUE_LABELS, type Thematiques } from "@/types/dispositif";

export interface ProjetInput {
  nom: string;
  description: string;
  profil?: "BU" | "Startup" | "GT";
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
  Construction: ["construction_btp", "renovation_batiment", "infrastructures_durables", "amenagement_urbanisme"],
  Numérique: ["numerique_ia_iot_bim", "robotique_automatisation"],
  Énergie: ["transition_energetique", "energies_renouvelables", "efficacite_energetique", "hydrogene"],
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

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
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

// ── 4.1 — Critères d'exclusion ───────────────────────────────────────

/** Renvoie la raison d'exclusion, ou null si l'AAP passe le filtre. */
export function exclusion(aap: AAP, projet: ProjetInput, projThemes: string[]): string | null {
  // Deadline passée
  const jr = joursRestants(aap.date_cloture);
  if (aap.statut === "closed" || (jr !== null && jr < 0)) return "Appel clôturé";

  // TRL éloigné de plus de 2 points de la fourchette cible
  if (projet.trl != null && aap.trl_min != null && aap.trl_max != null) {
    const gap =
      projet.trl < aap.trl_min ? aap.trl_min - projet.trl : projet.trl > aap.trl_max ? projet.trl - aap.trl_max : 0;
    if (gap > 2) return `TRL projet (${projet.trl}) trop éloigné de la cible (TRL ${aap.trl_min}–${aap.trl_max})`;
  }

  // Aucun lien sectoriel : si le projet a précisé des secteurs et qu'il n'y a
  // aucun recoupement thématique NI aucun mot-clé commun → exclu.
  if (projThemes.length > 0) {
    const themeOverlap = aap.thematiques.some((t) => projThemes.includes(t));
    const hay = norm(`${aap.titre} ${aap.description} ${aap.mots_cles.join(" ")}`);
    const kwOverlap = keywordsFromProjet(projet).some((k) => hay.includes(k));
    if (!themeOverlap && !kwOverlap) return "Aucun lien sectoriel ou thématique avec le projet";
  }
  return null;
}

// ── Mots-clés du projet (pour la pertinence sémantique légère) ───────
function keywordsFromProjet(projet: ProjetInput): string[] {
  const raw = `${projet.nom} ${projet.description} ${projet.motsClesLibres ?? ""}`;
  return [
    ...new Set(
      norm(raw)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4),
    ),
  ];
}

// ── 4.2 — Adéquation projet / AAP (0-100) ────────────────────────────
function scoreAdequation(
  aap: AAP,
  projet: ProjetInput,
  projThemes: string[],
): { score: number; raisons: string[] } {
  const raisons: string[] = [];

  // Alignement thématique (40%)
  let themeScore = 50; // neutre si le projet n'a pas précisé de secteur
  if (projThemes.length > 0) {
    const inter = aap.thematiques.filter((t) => projThemes.includes(t));
    themeScore = inter.length === 0 ? 15 : clamp(45 + inter.length * 25);
    if (inter.length > 0) raisons.push(`Alignement thématique : ${inter.join(", ")}`);
  }

  // Compatibilité TRL (25%) — UNIQUEMENT si le TRL est renseigné des deux côtés.
  // La quasi-totalité des aides françaises (guichets, subventions) n'ont pas de
  // notion de TRL : on ne fabrique donc pas de score neutre qui figerait 25% du
  // total. Le poids du TRL est redistribué sur les autres critères quand il est
  // absent (voir pondération dynamique plus bas).
  const trlComparable = projet.trl != null && aap.trl_min != null && aap.trl_max != null;
  let trlScore = 0;
  if (trlComparable) {
    const gap =
      projet.trl! < aap.trl_min! ? aap.trl_min! - projet.trl! : projet.trl! > aap.trl_max! ? projet.trl! - aap.trl_max! : 0;
    trlScore = gap === 0 ? 100 : gap === 1 ? 70 : 40;
    if (gap === 0) raisons.push(`TRL du projet (${projet.trl}) dans la cible de l'AAP (${aap.trl_min}–${aap.trl_max})`);
  }

  // Pertinence mots-clés (20%)
  const hay = norm(`${aap.titre} ${aap.description} ${aap.mots_cles.join(" ")}`);
  const kws = keywordsFromProjet(projet);
  const hits = kws.filter((k) => hay.includes(k));
  const kwScore = clamp(Math.min(hits.length, 5) * 20);
  if (hits.length >= 2) raisons.push(`Mots-clés en commun : ${hits.slice(0, 4).join(", ")}`);

  // Profil porteur (10%) — Horizon Europe ouvert à tous les types d'acteurs
  const profilScore = 70;

  // Alignement géographique (5%) — dispositifs EU : éligibles aux entités françaises
  const geoScore = 90;

  // Pondération dynamique : poids de base, TRL neutralisé (et redistribué) si non comparable.
  const W = { theme: 0.4, trl: 0.25, kw: 0.2, profil: 0.1, geo: 0.05 };
  let wTheme = W.theme, wTrl = W.trl, wKw = W.kw, wProfil = W.profil, wGeo = W.geo;
  if (!trlComparable) {
    const reste = W.theme + W.kw + W.profil + W.geo; // 0.75
    wTrl = 0;
    wTheme = W.theme / reste;
    wKw = W.kw / reste;
    wProfil = W.profil / reste;
    wGeo = W.geo / reste;
  }
  const score = clamp(
    themeScore * wTheme + trlScore * wTrl + kwScore * wKw + profilScore * wProfil + geoScore * wGeo,
  );
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
export function scoreProjet(aap: AAP, projet: ProjetInput, projThemes: string[]): ScoredAap | null {
  if (exclusion(aap, projet, projThemes)) return null;

  const { score: adequation, raisons } = scoreAdequation(aap, projet, projThemes);
  const { score: accessibilite, points } = scoreAccessibilite(aap);
  const financier = scoreFinancier(aap, projet);

  const score = clamp(adequation * 0.7 + accessibilite * 0.2 + financier * 0.1);

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
  return aaps
    .map((a) => scoreProjet(a, projet, projThemes))
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
  return aaps
    .map((aap) => scoreProjet(aap, projet, projThemes))
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
export function aapsForFiliale(aaps: AAP[], entite: Entite, filiale: Filiale, min = 60): AapForFiliale[] {
  const projet = filialeToProjet(entite, filiale);
  const projThemes = secteursToThematiques(projet.secteurs);
  return aaps
    .map((aap) => {
      const s = scoreProjet(aap, projet, projThemes);
      if (!s) return null;
      const matchedProjets = filiale.projets.filter((p) => {
        const ps = scoreProjet(aap, { nom: p.nom, description: "", secteurs: [], trl: p.trl, motsClesLibres: p.mots_cles.join(" ") }, []);
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
    (entite.filiales ?? []).flatMap((f) => aapsForFiliale(aaps, entite, f, min).map((x) => x.aap.id)),
  );
  return aapsForEntite(aaps, entite, min).filter((x) => !filialeIds.has(x.aap.id));
}
