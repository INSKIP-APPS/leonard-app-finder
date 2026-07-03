// ──────────────────────────────────────────────────────────────────────
// Classement géographique unique (Phase 6.2).
//
// Le champ `echelle` d'un AAP est hétérogène selon la source (SEDIA le laisse
// vide, Aides-territoires renvoie « Pays », « Région », « Département »,
// « EPCI », « Ad-hoc »… , les autres « National »/« Régional »). Cette fonction
// ramène tout ça à 4 niveaux d'affichage cohérents, partagés par l'Explorer,
// le matching et le Push — pour qu'un même AAP soit classé pareil partout.
// ──────────────────────────────────────────────────────────────────────

import type { AAP } from "@/types/aap";

/** Niveaux géographiques, du plus large au plus fin. */
export type Echelle = "EU" | "National" | "Régional" | "Local";

/** Ordre canonique (utile pour trier ou itérer les filtres). */
export const ECHELLES: readonly Echelle[] = ["EU", "National", "Régional", "Local"];

/**
 * Classe un AAP sur l'échelle géographique d'affichage à partir de son champ
 * `echelle` brut.
 *  • vide            → EU        (SEDIA / Europe : échelle non renseignée)
 *  • « europe »      → EU
 *  • National / Pays / Ad-hoc → National   (Pays = toute la France ;
 *                       Ad-hoc = périmètre non standard, assimilé national)
 *  • Département / EPCI / commune → Local   (maille infra-régionale)
 *  • tout le reste   → Régional  (Région, Bassin hydrographique, etc.)
 */
export function aapEchelle(a: Pick<AAP, "echelle">): Echelle {
  const e = (a.echelle ?? "").toLowerCase();
  if (!e) return "EU";
  if (e.includes("europe")) return "EU";
  if (e.includes("national") || e.includes("pays") || e.includes("ad-hoc") || e.includes("ad hoc")) return "National";
  if (e.includes("département") || e.includes("departement") || e.includes("epci") || e.includes("commune")) return "Local";
  return "Régional";
}
