// ──────────────────────────────────────────────────────────────────────
// Normalisation de texte — source unique pour la recherche, le scoring et la
// déduplication insensibles aux accents sur un corpus 100 % français.
// (Auparavant la même logique était recopiée dans explorer, scoring-engine,
// preselection et data-store.)
// ──────────────────────────────────────────────────────────────────────

/** Minuscule + suppression des diacritiques (NFD). « Énergie » → « energie ». */
export function stripAccents(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Empreinte alphanumérique compacte — clé de fusion des doublons de titre. */
export function empreinteTitre(s: string): string {
  return stripAccents(s).replace(/[^a-z0-9]/g, "");
}
