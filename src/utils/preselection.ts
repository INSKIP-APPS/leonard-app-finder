// ──────────────────────────────────────────────────────────────────────
// Présélection V2.1 — étage 1 et 2 du matching « moteur de réponse ».
//
//   ① Filtres durs   : deadline, acteurs éligibles, géographie (3 crans).
//                      Principe : un critère renseigné des deux côtés est
//                      appliqué ; absent → neutre, jamais bloquant.
//   ② Score lexical  : mots ENTIERS (fini « eau » ⊂ « réseaux »), rareté IDF,
//                      lexique FR→EN (les appels européens sont en anglais),
//                      signature du projet (ses 12 termes les plus spécifiques),
//                      champs pondérés (titre > mots-clés > description).
//
// La présélection RATISSE (rappel) : elle produit ~30 candidats plausibles.
// Le verdict de pertinence appartient au juge IA (services/claude-judge.ts).
// Étalonné sur un échantillon de 152 AAP étiquetés main (3 projets types) —
// voir mémoire projet « Benchmark scoring sans IA ».
// ──────────────────────────────────────────────────────────────────────

import type { AAP } from "@/types/aap";
import { aapEchelle } from "@/utils/echelle";
import { joursRestants, parseMontantEuros, type ProjetInput } from "@/utils/scoring-engine";
import { THEMATIQUE_LABELS, type Thematiques } from "@/types/dispositif";
import { fmtMillions } from "@/utils/format";

// ── Types ─────────────────────────────────────────────────────────────

export interface Candidat {
  aap: AAP;
  /** Score de présélection 0-100 (ordre d'envoi au juge, pas un verdict). */
  score: number;
  /** Signaux à transmettre au juge (TRL, consortium recherche, budget…). */
  flags: string[];
  /** Éléments factuels du rapprochement (thématiques, termes communs). */
  raisons: string[];
}

export interface Preselection {
  candidats: Candidat[];
  totalActifs: number;
  exclusions: { acteurs: number; geo: number; sansLien: number };
}

// ── Secteur du formulaire → thématiques (même table que le moteur v2) ──
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
  for (const s of secteurs)
    for (const k of SECTEUR_TO_THEMATIQUE_KEYS[s] ?? []) labels.add(THEMATIQUE_LABELS[k]);
  return [...labels];
}

// ── Tokenisation mots entiers ─────────────────────────────────────────

const STOPWORDS = new Set(
  (
    "pour dans avec les des une aux sur par plus leur nos vos ces cette sont etre leurs " +
    "projet projets entreprise entreprises innovation innovant developpement systeme solution " +
    "solutions cadre acteur acteurs euros million millions vinci type nouvelle nouveau objectif " +
    "long production mise place votre notre ainsi afin dont entre tres bien tout tous toute " +
    "toutes comme usages usage unite haute " +
    "with that this from will your the and for expected outcome outcomes proposals results"
  ).split(/\s+/),
);

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Singularisation légère : « flottes » et « flotte » comptent pareil. */
function sing(w: string): string {
  return w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w;
}

function toks(s: string): string[] {
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(sing);
}

// ── Lexique FR → EN (domaine) ────────────────────────────────────────
// ~45 équivalences statiques : réveille les appels européens rédigés en
// anglais (+27 % de précision de classement mesurés sur l'échantillon).
const LEXIQUE_EN: Record<string, string[]> = {
  hydrogene: ["hydrogen"],
  recharge: ["charging", "recharging"],
  ravitaillement: ["refuelling", "refueling"],
  avitaillement: ["refuelling", "refueling"],
  electrolyseur: ["electrolyser", "electrolyzer"],
  lourd: ["truck", "heavy"],
  camion: ["truck"],
  flotte: ["fleet"],
  vehicule: ["vehicle"],
  batiment: ["building"],
  renovation: ["renovation", "retrofit"],
  energetique: ["energy"],
  energie: ["energy"],
  jumeau: ["twin"],
  numerique: ["digital"],
  materiau: ["material"],
  biosource: ["biobased"],
  bois: ["timber", "wood"],
  beton: ["concrete"],
  carbone: ["carbon"],
  decarbonation: ["decarbonisation", "decarbonization"],
  eau: ["water"],
  eaux: ["water"],
  usee: ["wastewater"],
  reutilisation: ["reuse"],
  recyclee: ["reclaimed", "recycled"],
  recyclage: ["recycling"],
  traitement: ["treatment"],
  capteur: ["sensor", "monitoring"],
  solaire: ["solar"],
  eolien: ["wind"],
  reseau: ["network", "grid"],
  chaleur: ["heat", "heating"],
  froid: ["cooling"],
  mobilite: ["mobility"],
  transport: ["transport"],
  routier: ["road"],
  autoroutier: ["highway", "motorway"],
  ferroviaire: ["rail", "railway"],
  portuaire: ["port", "harbour"],
  stockage: ["storage"],
  efficacite: ["efficiency"],
  pilotage: ["management"],
  consommation: ["consumption"],
  intelligence: ["intelligence"],
  artificielle: ["artificial"],
  robotique: ["robotic", "robotics"],
  infrastructure: ["infrastructure"],
  tertiaire: ["tertiary", "office"],
  diagnostic: ["assessment"],
  ressource: ["resource"],
  resilience: ["resilience"],
  chantier: ["construction"],
  dechet: ["waste"],
  sol: ["soil"],
  biodiversite: ["biodiversity"],
};

// ── Index corpus (tokens par champ + IDF) — mémoïsé par référence ────

interface DocIndex {
  titre: Set<string>;
  kw: Set<string>;
  desc: Set<string>;
  descList: string[];
  themes: Set<string>;
}

let _cacheRef: AAP[] | null = null;
let _docs: DocIndex[] = [];
let _df = new Map<string, number>();
let _tdf = new Map<string, number>();

function indexCorpus(aaps: AAP[]): void {
  if (_cacheRef === aaps) return;
  _docs = aaps.map((a) => {
    const descList = toks(a.description || "");
    return {
      titre: new Set(toks(a.titre || "")),
      kw: new Set(toks((a.mots_cles ?? []).join(" "))),
      desc: new Set(descList),
      descList,
      themes: new Set(a.thematiques ?? []),
    };
  });
  _df = new Map();
  _tdf = new Map();
  for (const d of _docs) {
    const seen = new Set<string>([...d.titre, ...d.kw, ...d.desc]);
    for (const w of seen) _df.set(w, (_df.get(w) ?? 0) + 1);
    for (const t of d.themes) _tdf.set(t, (_tdf.get(t) ?? 0) + 1);
  }
  _cacheRef = aaps;
}

const idf = (w: string, n: number) => Math.log(n / (1 + (_df.get(w) ?? 0)));
const tidf = (t: string, n: number) => Math.log(n / (1 + (_tdf.get(t) ?? 0)));

// ── Signature du projet ───────────────────────────────────────────────

interface Signature {
  /** Tous les termes du projet (uniques, singularisés). */
  uniq: string[];
  /** Les 12 termes les plus spécifiques (pondérés IDF) : le « sujet ». */
  sig: string[];
  /** Bigrammes du texte projet (expressions exactes). */
  big: Set<string>;
}

function signatureProjet(projet: ProjetInput, n: number): Signature {
  const texte = `${projet.nom} ${projet.description} ${projet.motsClesLibres ?? ""}`;
  const tks = toks(texte);
  const uniq = [...new Set(tks)];
  const sig = [...uniq].sort((a, b) => idf(b, n) - idf(a, n)).slice(0, 12);
  const big = new Set<string>();
  for (let i = 0; i < tks.length - 1; i++) big.add(`${tks[i]} ${tks[i + 1]}`);
  return { uniq, sig, big };
}

/** Crédit de champ : titre 2.0 > mots-clés 1.5 > description 1.0 (0 = absent). */
function matchTerm(d: DocIndex, w: string): number {
  const variants = [w, ...(LEXIQUE_EN[w] ?? []).map((e) => sing(norm(e)))];
  let best = 0;
  for (const v of variants) {
    if (d.titre.has(v)) best = Math.max(best, 2.0);
    else if (d.kw.has(v)) best = Math.max(best, 1.5);
    else if (d.desc.has(v)) best = Math.max(best, 1.0);
  }
  return best;
}

// ── Filtre acteurs ────────────────────────────────────────────────────
// Vocabulaire réel de la base (2 560/2 561 AAP renseignés). Règles validées :
// l'AAP liste ses acteurs → compatibilité exigée ; « Tout type » ou liste
// vide → passe ; type d'acteur non déclaré côté projet → pas de filtre.
// « Recherche » seul → passe avec marqueur consortium (pas d'exclusion dure).

const SANS_RESTRICTION = "tout type d'entite juridique";
const ACTEURS_ENTREPRISE = new Set(["entreprise", "professionnel"]);
const ACTEURS_OUVERTS = new Set([
  ...ACTEURS_ENTREPRISE,
  "association",
  "associations",
  "recherche",
]);

function acteursAcceptes(typeActeur: string): Set<string> | null {
  const t = typeActeur.toLowerCase();
  if (!t) return null; // pas de filtre
  if (t.includes("externe") || t.includes("ecosysteme") || t.includes("écosystème"))
    return ACTEURS_OUVERTS;
  // BU / direction / projet interne / startups → profil entreprise
  return ACTEURS_ENTREPRISE;
}

type ActeurVerdict = { ok: boolean; flagRecherche?: boolean };

function filtreActeurs(aap: AAP, acceptes: Set<string> | null): ActeurVerdict {
  if (!acceptes) return { ok: true };
  const liste = (aap.acteurs_eligibles ?? []).map((v) => norm(v));
  if (liste.length === 0) return { ok: true }; // non mentionné → neutre
  if (liste.includes(SANS_RESTRICTION)) return { ok: true };
  if (liste.some((v) => acceptes.has(v))) return { ok: true };
  // Portage laboratoire : accessible en consortium → on propose avec marqueur.
  if (liste.includes("recherche")) return { ok: true, flagRecherche: true };
  return { ok: false };
}

// ── Filtre géographie (3 crans, strict sur la région) ────────────────
//   « Europe »            → échelle EU uniquement
//   « France (national) » → tout le français (national + régional + local)
//   « <Région> »          → UNIQUEMENT les aides de cette région (pas les
//                            nationales) ; AAP régional sans région connue →
//                            passe (tolérance, convergera quand le connecteur
//                            Aides-territoires aura rempli `region`).

/** Comparaison de noms de région robuste (« Nouvelle - Aquitaine » = « Nouvelle-Aquitaine »). */
function memeRegion(a: string, b: string): boolean {
  const clean = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");
  return clean(a) === clean(b);
}

function filtreGeo(aap: AAP, region: string | undefined): boolean {
  if (!region || region === "International") return true;
  const ech = aapEchelle(aap);
  if (region === "Europe") return ech === "EU";
  if (region === "France (national)") return ech !== "EU";
  // Région précise : UNIQUEMENT les aides de cette région (pas les nationales).
  if (ech === "EU" || ech === "National") return false;
  return aap.region == null || memeRegion(aap.region, region);
}

// ── Présélection complète ─────────────────────────────────────────────

export function preselectionner(aaps: AAP[], projet: ProjetInput, topN = 30): Preselection {
  indexCorpus(aaps);
  const n = aaps.length;
  const projThemes = secteursToThematiques(projet.secteurs);
  const { uniq, sig, big } = signatureProjet(projet, n);
  const sigTotal = sig.reduce((s, w) => s + idf(w, n), 0);
  const themesTotal = projThemes.reduce((s, t) => s + tidf(t, n), 0);
  const besoin = parseMontantEuros(projet.financementRecherche);
  const acceptesActeurs = acteursAcceptes(projet.typeActeur ?? "");

  const exclusions = { acteurs: 0, geo: 0, sansLien: 0 };
  let totalActifs = 0;
  const candidats: Candidat[] = [];

  for (let i = 0; i < aaps.length; i++) {
    const a = aaps[i];
    const d = _docs[i];

    // Deadline (filtre dur historique)
    const jr = joursRestants(a.date_cloture);
    if (a.statut === "closed" || (jr !== null && jr < 0)) continue;
    totalActifs++;

    // Acteurs
    const va = filtreActeurs(a, acceptesActeurs);
    if (!va.ok) {
      exclusions.acteurs++;
      continue;
    }

    // Géographie
    if (!filtreGeo(a, projet.region)) {
      exclusions.geo++;
      continue;
    }

    // Lien minimal avec le projet (thème OU terme)
    const inter = [...d.themes].filter((t) => projThemes.includes(t));
    const matched = uniq.filter((w) => matchTerm(d, w) > 0);
    if (projThemes.length > 0 && inter.length === 0 && matched.length === 0) {
      exclusions.sansLien++;
      continue;
    }

    // ── Score de présélection (formule V4 étalonnée) ──
    const kwGot = sig.reduce((s, w) => s + (idf(w, n) * Math.min(matchTerm(d, w), 1.5)) / 1.5, 0);
    const kwCov = sigTotal > 0 ? kwGot / sigTotal : 0;
    const themeCov = themesTotal > 0 ? inter.reduce((s, t) => s + tidf(t, n), 0) / themesTotal : 0;
    const extra = matched.filter((w) => !sig.includes(w)).length;
    let bigHits = 0;
    for (let j = 0; j < d.descList.length - 1 && bigHits < 3; j++) {
      if (big.has(`${d.descList[j]} ${d.descList[j + 1]}`)) bigHits++;
    }
    const base =
      projThemes.length > 0
        ? 100 * (0.45 * themeCov + 0.55 * Math.min(kwCov * 1.25, 1))
        : 100 * Math.min(kwCov * 1.25, 1);
    const score = Math.min(Math.round(base + Math.min(extra, 4) * 1.5 + bigHits * 5), 100);

    // ── Signaux pour le juge ──
    const flags: string[] = [];
    if (va.flagRecherche)
      flags.push(
        "Portage par un laboratoire ou organisme de recherche requis, accessible en consortium",
      );
    if (projet.trl != null && a.trl_min != null && a.trl_max != null) {
      const gap =
        projet.trl < a.trl_min
          ? a.trl_min - projet.trl
          : projet.trl > a.trl_max
            ? projet.trl - a.trl_max
            : 0;
      if (gap > 0)
        flags.push(
          `L'appel vise un TRL ${a.trl_min} à ${a.trl_max}, le projet est TRL ${projet.trl} : écart à justifier`,
        );
    }
    if (besoin != null && a.budget_par_projet != null && a.budget_par_projet < besoin)
      flags.push(
        `Plafond ${fmtMillions(a.budget_par_projet)} en dessous du besoin exprimé (${fmtMillions(besoin)})`,
      );

    const raisons: string[] = [];
    if (inter.length > 0) raisons.push(`Thématiques communes : ${inter.join(", ")}`);
    const sigMatched = sig.filter((w) => matchTerm(d, w) > 0);
    if (sigMatched.length > 0)
      raisons.push(`Termes du projet retrouvés : ${sigMatched.slice(0, 5).join(", ")}`);

    candidats.push({ aap: a, score, flags, raisons });
  }

  candidats.sort((x, y) => y.score - x.score);
  return { candidats: candidats.slice(0, topN), totalActifs, exclusions };
}
