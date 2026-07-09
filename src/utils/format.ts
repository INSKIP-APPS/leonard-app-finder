// ──────────────────────────────────────────────────────────────────────
// Formatage partagé (dates, montants, TRL, statuts, échappement HTML).
//
// Source unique pour tous les écrans — avant Phase 2, ces helpers étaient
// dupliqués dans 5 fichiers et divergeaient déjà. Deux familles de budget
// coexistent VOLONTAIREMENT (affichages différents, pas un doublon) :
//   • budgetCompact  → listes/cartes : « 2,5 M€/projet »
//   • budgetDetaille → fiche AAP : « 2 500 000 € / projet », replis inclus
// ──────────────────────────────────────────────────────────────────────

import type { AAP } from "@/types/aap";

/** Date compacte « JJ/MM/AAAA » (listes, cartes). "—" si absente. */
export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10); // "2027-04-14"
  const [y, m, day] = d.split("-");
  return day && m && y ? `${day}/${m}/${y}` : d;
}

/** Date longue « 14 avril 2027 » (fiches). "—" si absente ou invalide. */
export function fmtDateLongue(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Date + heure « 14/04/2027 08:12 » (historique d'exécutions). */
export function fmtDateHeure(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Montant en millions « 2,5 M€ » (arrondi à l'unité au-delà de 10 M€). */
export function fmtMillions(n: number | null): string {
  if (n == null) return "—";
  const m = n / 1_000_000;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(".", ",")} M€`;
}

/** Montant en euros pleins « 2 500 000 € », ou null si absent. */
export function fmtEuros(n: number | null): string | null {
  if (n == null) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Budget compact pour listes/cartes : « 2,5 M€/projet », enveloppe sinon, "—" à défaut. */
export function budgetCompact(a: AAP): string {
  if (a.budget_par_projet) return `${fmtMillions(a.budget_par_projet)}/projet`;
  if (a.budget_total) return fmtMillions(a.budget_total);
  return "—";
}

/** Budget détaillé pour la fiche : euros pleins, repli texte `montants` (sources FR). */
export function budgetDetaille(a: AAP): string {
  const parProjet = fmtEuros(a.budget_par_projet);
  if (parProjet) return `${parProjet} / projet`;
  const total = fmtEuros(a.budget_total);
  if (total) return `${total} (enveloppe)`;
  if (a.montants) return a.montants.slice(0, 120);
  return "Montant non précisé";
}

/**
 * Extrait un montant depuis un texte libre (description d'AAP) quand aucun
 * champ structuré n'est renseigné. Cherche « jusqu'à / plafond / maximum /
 * montant / aide / subvention … N € (ou k€, M€, millions d'euros) ».
 * Renvoie une chaîne courte type « jusqu'à 200 000 € », ou null.
 */
export function extraireMontant(texte: string | null | undefined): string | null {
  if (!texte) return null;
  const re =
    /(jusqu'à|jusqu'a|plafond(?:\s+(?:de|à|a))?|maximum\s+de|montant\s+(?:de|maximal\s+de)|aide\s+de|subvention\s+de)?\s*([\d]{1,3}(?:[\s  .,]\d{3})*(?:[.,]\d+)?)\s*(m€|k€|millions?\s+d['']euros|€|euros)/i;
  const m = texte.match(re);
  if (!m) return null;
  const brut = m[2].replace(/[\s  ]/g, " ").trim();
  const valeur = parseFloat(brut.replace(/[\s ]/g, "").replace(",", "."));
  if (!isFinite(valeur) || valeur <= 0) return null;
  const unite = m[3].toLowerCase();
  let euros = valeur;
  if (unite === "k€") euros = valeur * 1_000;
  else if (unite === "m€" || unite.startsWith("million")) euros = valeur * 1_000_000;
  if (euros < 500 || euros > 5_000_000_000) return null; // garde-fou anti faux positifs
  const affiche = euros >= 1_000_000 ? fmtMillions(euros) : `${euros.toLocaleString("fr-FR")} €`;
  const prefixe = m[1] ? "jusqu'à " : "";
  return `${prefixe}${affiche}`;
}

/**
 * Montant d'un AAP avec sa NATURE explicite (l'enveloppe d'un appel n'est pas
 * ce que touche un projet). Ordre : par projet > enveloppe > texte source >
 * extraction de la description > non précisé.
 */
export function montantAffiche(a: AAP): string {
  if (a.budget_par_projet) return `Jusqu'à ${fmtMillions(a.budget_par_projet)} par projet`;
  if (a.budget_total) return `Enveloppe de l'appel : ${fmtMillions(a.budget_total)}`;
  if (a.montants) {
    // Le champ texte des sources FR contient parfois du remplissage : on en
    // extrait le chiffre ; sinon on ne l'affiche que s'il est propre et court.
    const deMontants = extraireMontant(a.montants);
    if (deMontants) return deMontants;
    if (!a.montants.includes("?") && a.montants.length <= 70) return a.montants;
  }
  const extrait = extraireMontant(a.description);
  if (extrait) return `${extrait} (mentionné dans l'appel)`;
  return "Montant non précisé";
}

/** Libellé TRL « TRL 3–8 » / « TRL 5 », ou null si non renseigné. */
export function trlLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `TRL ${min}–${max}`;
  return `TRL ${min ?? max}`;
}

/** Statut AAP → libellé français. */
export const STATUT_AAP_LABEL: Record<AAP["statut"], string> = {
  open: "Ouvert",
  forthcoming: "À venir",
  closed: "Clôturé",
};

/** Échappement HTML minimal (exports PDF générés par gabarit). */
export function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
