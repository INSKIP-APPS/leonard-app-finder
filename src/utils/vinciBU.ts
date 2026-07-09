// ──────────────────────────────────────────────────────────────────────
// Périmètre VINCI d'un dispositif.
//
// On déduit la/les Business Unit(s) VINCI concernée(s) à partir des
// thématiques cochées du dispositif (booléens du schéma). Si aucune BU
// « métier » ne matche (ex. dispositif purement R&D), on renvoie « Leonard »
// (portage transverse / prospective).
//
// NB : mapping heuristique, à affiner avec le métier. Les LOGOS ne sont pas
// encore intégrés — on affiche les noms (cf. décision produit « noms pour
// l'instant »). Quand les assets seront fournis, on branchera un logo par id.
// ──────────────────────────────────────────────────────────────────────

import type { Dispositif, Thematiques } from "@/types/dispositif";

export interface PerimetreVinci {
  /** Identifiant court */
  id: string;
  /** Nom affiché (fallback si le logo manque) */
  nom: string;
  /** Chemin du logo (servi depuis public/logos/) */
  logo: string;
}

// BU métier → thématiques (booléens) qui la déclenchent.
const BU_THEMES: { id: string; nom: string; logo: string; themes: (keyof Thematiques)[] }[] = [
  {
    id: "vinci-construction",
    nom: "VINCI Construction",
    logo: "/logos/vinci-construction.png",
    themes: [
      "construction_btp",
      "renovation_batiment",
      "materiaux_biosources",
      "infrastructures_durables",
      "amenagement_urbanisme",
      "economie_circulaire",
    ],
  },
  {
    id: "vinci-energies",
    nom: "VINCI Energies",
    logo: "/logos/vinci-energies.png",
    themes: [
      "transition_energetique",
      "energies_renouvelables",
      "efficacite_energetique",
      "decarbonation_industrie",
      "hydrogene",
      "numerique_ia_iot_bim",
      "robotique_automatisation",
    ],
  },
  {
    id: "vinci-autoroutes",
    nom: "VINCI Autoroutes",
    logo: "/logos/vinci-autoroutes.png",
    themes: ["mobilite_decarbonee"],
  },
  {
    id: "vinci-concessions",
    nom: "VINCI Concessions",
    logo: "/logos/vinci-concessions.png",
    themes: ["gestion_eau", "adaptation_climatique"],
  },
];

const LEONARD: PerimetreVinci = { id: "leonard", nom: "Leonard", logo: "/logos/leonard-brand.png" };

/**
 * Renvoie la liste des BU VINCI concernées par le dispositif (selon ses
 * thématiques). Vide de BU métier → [Leonard].
 */
export function perimetreVinci(d: Dispositif): PerimetreVinci[] {
  const th = d.thematiques;
  if (!th) return [LEONARD];
  const bus = BU_THEMES.filter((bu) => bu.themes.some((k) => th[k])).map((bu) => ({
    id: bu.id,
    nom: bu.nom,
    logo: bu.logo,
  }));
  return bus.length ? bus : [LEONARD];
}
