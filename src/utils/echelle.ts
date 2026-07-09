// ──────────────────────────────────────────────────────────────────────
// Classement géographique unique (Phase 6.2).
//
// Le champ `echelle` d'un AAP est hétérogène selon la source (SEDIA le laisse
// vide, Aides-territoires renvoie « Pays », « Région », « Département »,
// « EPCI », « Ad-hoc »… , les autres « National »/« Régional »). Cette fonction
// ramène tout ça à 3 niveaux d'affichage cohérents, partagés par l'Explorer,
// le matching et le Push — pour qu'un même AAP soit classé pareil partout.
// ──────────────────────────────────────────────────────────────────────

import type { AAP } from "@/types/aap";

/** Niveaux géographiques, du plus large au plus fin. */
export type Echelle = "EU" | "National" | "Régional";

/** Ordre canonique (utile pour trier ou itérer les filtres). */
export const ECHELLES: readonly Echelle[] = ["EU", "National", "Régional"];

/**
 * Classe un AAP sur l'échelle géographique d'affichage à partir de son champ
 * `echelle` brut.
 *  • vide            → EU        (SEDIA / Europe : échelle non renseignée)
 *  • « europe »      → EU
 *  • National / Pays / Ad-hoc → National   (Pays = toute la France ;
 *                       Ad-hoc = périmètre non standard, assimilé national)
 *  • tout le reste   → Régional  (Région, Département, EPCI, commune, bassin…
 *                       le local est rattaché au régional pour rester à 3 échelles)
 */
export function aapEchelle(a: Pick<AAP, "echelle">): Echelle {
  const e = (a.echelle ?? "").toLowerCase();
  if (!e) return "EU";
  if (e.includes("europe")) return "EU";
  if (e.includes("national") || e.includes("pays") || e.includes("ad-hoc") || e.includes("ad hoc"))
    return "National";
  return "Régional";
}
