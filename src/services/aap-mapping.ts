// ──────────────────────────────────────────────────────────────────────
// Logique de mapping / enrichissement des AAP scrapés (Phase 2.4 + 2.5)
//   - parseTopicId      : identifiant SEDIA → programme / pilier / cluster
//   - mapAapToDispositif : rattache un AAP à un dispositif de la base
//   - extractThematiques : description → taxonomie thématique du CDC
//   - extractTrl         : description → bornes TRL (best-effort)
//   - normalizeTypeAction / stripHtml : utilitaires
// Ces fonctions sont pures (aucun accès réseau) et isomorphes (Node + navigateur).
// ──────────────────────────────────────────────────────────────────────

import type { Dispositif } from "@/types/dispositif";
import type { TypeAction } from "@/types/aap";
import { THEMATIQUE_LABELS, type Thematiques } from "@/types/dispositif";

// ── Parsing de l'identifiant de topic ────────────────────────────────

export interface ParsedTopicId {
  programme: string;
  pilier: string | null;
  cluster: string | null;
}

// Préfixe de cluster (2e segment de l'ID) → { pilier, cluster lisible }
const CLUSTER_MAP: Record<string, { pilier: string; cluster: string }> = {
  CL1: { pilier: "Pilier II", cluster: "CL1" },
  CL2: { pilier: "Pilier II", cluster: "CL2" },
  CL3: { pilier: "Pilier II", cluster: "CL3" },
  CL4: { pilier: "Pilier II", cluster: "CL4" },
  CL5: { pilier: "Pilier II", cluster: "CL5" },
  CL6: { pilier: "Pilier II", cluster: "CL6" },
  EIC: { pilier: "Pilier III", cluster: "EIC" },
  EIE: { pilier: "Pilier III", cluster: "EIE" },
  MSCA: { pilier: "Pilier I", cluster: "MSCA" },
  ERC: { pilier: "Pilier I", cluster: "ERC" },
  WIDERA: { pilier: "Élargir la participation", cluster: "WIDERA" },
  MISS: { pilier: "Missions", cluster: "MISS" },
  JU: { pilier: "Partenariats", cluster: "JU" },
};

/**
 * Parse un identifiant de topic (ex: "HORIZON-CL5-2026-D3-01-02") pour en extraire
 * le programme cadre, le pilier et le cluster/sous-programme.
 */
export function parseTopicId(id: string): ParsedTopicId {
  const segments = id.toUpperCase().split("-");
  const prefix = segments[0] ?? "";
  const programme = prefix === "HORIZON" ? "Horizon Europe" : prefix || "Inconnu";

  // On cherche le premier segment qui correspond à un cluster connu.
  for (const seg of segments.slice(1, 3)) {
    const info = CLUSTER_MAP[seg];
    if (info) return { programme, pilier: info.pilier, cluster: info.cluster };
  }
  return { programme, pilier: null, cluster: null };
}

// ── Rattachement AAP → Dispositif ────────────────────────────────────

// Jetons de recherche par cluster, testés contre (programme + nom) du dispositif.
function clusterTokens(parsed: ParsedTopicId, id: string): string[] {
  const c = parsed.cluster;
  if (!c) return [];
  if (/^CL\d$/.test(c)) return [`cluster ${c[2]}`, `clusters ${c[2]}`, c.toLowerCase()];
  if (c === "EIC") {
    const upper = id.toUpperCase();
    // Sous-type EIC deviné depuis l'identifiant.
    if (upper.includes("ACCELERATOR")) return ["eic accelerator"];
    if (upper.includes("PATHFINDER")) return ["eic pathfinder"];
    if (upper.includes("TRANSITION")) return ["eic transition"];
    return ["eic"];
  }
  if (c === "MISS") return ["mission"];
  if (c === "JU") return ["partenariat", "ju"];
  return [c.toLowerCase()];
}

/**
 * Rattache un AAP à un dispositif de la base en s'appuyant sur le cluster/programme
 * parsé depuis l'identifiant. Renvoie l'id du dispositif le mieux apparié, ou null.
 */
export function mapAapToDispositif(
  id: string,
  dispositifs: Dispositif[],
  parsed: ParsedTopicId = parseTopicId(id),
): string | null {
  const tokens = clusterTokens(parsed, id);
  if (tokens.length === 0 && !parsed.programme) return null;

  let best: { id: string; score: number } | null = null;
  for (const d of dispositifs) {
    const hay = `${d.programme} ${d.nom}`.toLowerCase();
    let score = 0;
    // Le programme cadre doit correspondre (Horizon Europe).
    if (parsed.programme !== "Inconnu" && hay.includes(parsed.programme.toLowerCase())) score += 1;
    for (const t of tokens) if (hay.includes(t)) score += 5;
    if (parsed.pilier && hay.includes(parsed.pilier.toLowerCase())) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: d.id, score };
  }
  // On exige un vrai signal de cluster (score ≥ 5) pour éviter les faux positifs.
  return best && best.score >= 5 ? best.id : null;
}

// ── Extraction des thématiques (taxonomie CDC) ───────────────────────

// Mots-clés (EN + FR) par thématique. Les descriptions SEDIA sont en anglais.
const THEMATIQUE_KEYWORDS: Record<keyof Thematiques, string[]> = {
  construction_btp: ["construction", "building site", "btp", "civil engineering", "built environment"],
  renovation_batiment: ["renovation", "retrofit", "refurbish", "rénovation"],
  transition_energetique: ["energy transition", "clean energy", "energy system", "transition énergétique"],
  energies_renouvelables: ["renewable", "solar", "photovoltaic", "wind energy", "offshore wind", "geothermal", "renouvelable"],
  efficacite_energetique: ["energy efficiency", "energy saving", "energy performance", "efficacité énergétique"],
  decarbonation_industrie: ["industrial decarbon", "industry decarbon", "hard-to-abate", "process emissions", "décarbonation"],
  mobilite_decarbonee: ["mobility", "transport", "electric vehicle", "zero-emission", "charging", "battery", "mobilité"],
  hydrogene: ["hydrogen", "fuel cell", "electrolys", "hydrogène"],
  numerique_ia_iot_bim: ["artificial intelligence", "digital", "internet of things", " iot", "bim", "machine learning", "digital twin", "numérique", "data-driven"],
  robotique_automatisation: ["robot", "automation", "autonomous system", "robotique"],
  economie_circulaire: ["circular economy", "recycl", "reuse", "waste", "circularity", "économie circulaire"],
  materiaux_biosources: ["bio-based", "biosourced", "biomaterial", "timber", "wood construction", "biosourcé"],
  gestion_eau: ["water management", "wastewater", "water resource", "gestion de l'eau", "water quality"],
  adaptation_climatique: ["climate adaptation", "climate resilience", "flood", "drought", "adaptation climatique", "climate change adaptation"],
  infrastructures_durables: ["infrastructure", "railway", "bridge", "road network", "port infrastructure"],
  amenagement_urbanisme: ["urban planning", "cities", "urban area", "neighbourhood", "spatial planning", "urbanisme"],
  recherche_developpement: ["research and innovation", "demonstration", "pilot project", "proof of concept", "r&d"],
};

/**
 * Détecte les thématiques du CDC présentes dans un texte (titre + description).
 * Renvoie les labels lisibles issus de THEMATIQUE_LABELS.
 */
export function extractThematiques(text: string): string[] {
  const hay = text.toLowerCase();
  const found: string[] = [];
  for (const key of Object.keys(THEMATIQUE_KEYWORDS) as (keyof Thematiques)[]) {
    if (THEMATIQUE_KEYWORDS[key].some((kw) => hay.includes(kw))) {
      found.push(THEMATIQUE_LABELS[key]);
    }
  }
  return found;
}

// ── Extraction du TRL (best-effort) ──────────────────────────────────

/**
 * Extrait les bornes TRL d'une description. Gère "TRL 5", "TRL 5-7", "TRL5 to 8",
 * "Technology Readiness Level 6". Renvoie { trl_min, trl_max } (null si absent).
 */
export function extractTrl(text: string): { trl_min: number | null; trl_max: number | null } {
  const nums: number[] = [];
  const re = /(?:trl|technology readiness level)s?\s*(\d)(?:\s*(?:[-–—]|to|and)\s*(\d))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    nums.push(Number(m[1]));
    if (m[2]) nums.push(Number(m[2]));
  }
  if (nums.length === 0) return { trl_min: null, trl_max: null };
  return { trl_min: Math.min(...nums), trl_max: Math.max(...nums) };
}

// ── Normalisation du type d'action ───────────────────────────────────

export function normalizeTypeAction(raw: string | null | undefined): TypeAction {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("research and innovation")) return "RIA";
  if (t.includes("innovation action")) return "IA";
  if (t.includes("coordination and support")) return "CSA";
  if (t.includes("cofund")) return "COFUND";
  if (t.includes("eic")) return "EIC";
  return "Autre";
}

// ── Nettoyage HTML ───────────────────────────────────────────────────

/** Supprime les balises HTML et normalise les espaces. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
