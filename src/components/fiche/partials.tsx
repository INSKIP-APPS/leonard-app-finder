// ──────────────────────────────────────────────────────────────────────
// Briques partagées des fiches détaillées (dispositif ET appel à projets) :
// échelle 3 points avec les symboles VINCI/Leonard, titres de section,
// lignes d'information et listes à puces. Une seule source de vérité pour
// garder les deux fiches visuellement identiques.
// ──────────────────────────────────────────────────────────────────────

/** Faible→1, Moyenne→2, Forte→3 (0 si inconnu). */
export function niveau3(v: string | null): number {
  switch ((v || "").toLowerCase()) {
    case "faible":
      return 1;
    case "moyenne":
      return 2;
    case "forte":
      return 3;
    default:
      return 0;
  }
}

// Icône de l'échelle selon le critère (icônes réelles fournies, ~55 px : nettes
// à la taille d'affichage, Retina compris).
const RATING_MARK: Record<"difficulte" | "pertinence", string> = {
  difficulte: "/logos/vinci-mark.png", // symbole VINCI rouge (façon « Effort VINCI »)
  pertinence: "/logos/leonard-mark.png", // icône Leonard (façon « Effort Leonard »)
};

/** Une marque de l'échelle. `faded` = créneau non atteint. */
export function RatingMark({ src, faded = false }: { src: string; faded?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={`w-[18px] h-[18px] shrink-0 object-contain ${faded ? "opacity-20" : ""}`}
    />
  );
}

/**
 * Échelle à 3 points via icônes : « difficulte » → symbole VINCI rouge,
 * « pertinence » → icône Leonard. 1/2/3 selon Faible/Moyenne/Forte, les
 * créneaux non atteints estompés.
 */
export function Rating3({
  label,
  valeur,
  palette,
}: {
  label: string;
  valeur: string | null;
  palette: "difficulte" | "pertinence";
}) {
  const lvl = niveau3(valeur);
  if (!lvl) return null;
  const src = RATING_MARK[palette];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center justify-center rounded-full bg-navy text-white text-[11px] font-semibold px-2.5 py-1 shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {[1, 2, 3].map((i) => (
          <RatingMark key={i} src={src} faded={i > lvl} />
        ))}
      </div>
      <span className="text-sm font-medium text-text">{valeur}</span>
    </div>
  );
}

/**
 * Ligne diagnostic — label + icônes 3 points + valeur, tout serré à
 * gauche (flex + gap fixe, pas de stretching). Convient aussi bien
 * pour une ligne unique que pour un empilement de plusieurs lignes.
 */
export function RatingRow({
  label,
  valeur,
  palette,
}: {
  label: string;
  valeur: string | null;
  palette: "difficulte" | "pertinence";
}) {
  const lvl = niveau3(valeur);
  if (!lvl) return null;
  const src = RATING_MARK[palette];
  return (
    <div className="flex items-center gap-5 py-2.5 flex-wrap">
      <span className="text-sm font-semibold text-navy shrink-0">{label}</span>
      <div className="flex items-center gap-1 shrink-0">
        {[1, 2, 3].map((i) => (
          <RatingMark key={i} src={src} faded={i > lvl} />
        ))}
      </div>
      <span className="text-sm font-medium text-text shrink-0">{valeur}</span>
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Titre bleu clair vif + icône colorée sans cadre + séparateur fin gris
  // façon slide « Vous aimeriez / Références » Leonard.
  return (
    <div className="flex items-center gap-2 text-[#0FAFEE] font-bold text-[15px] border-b border-border pb-2 mb-3">
      {icon && (
        <span className="inline-flex items-center justify-center text-[#0FAFEE] shrink-0 [&_svg]:w-[18px] [&_svg]:h-[18px]">
          {icon}
        </span>
      )}
      {children}
    </div>
  );
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="label-caps text-[10px]">{label}</div>
      <div className="text-sm text-text break-words">{value}</div>
    </div>
  );
}

// Puces charte Leonard (extraites du template PPT officiel) : croix cyan+rose
// pour les listes d'attentes/objectifs, donut cyan+rose pour les références.

export function Puces({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it} className="flex items-start gap-2.5 text-sm text-text min-w-0">
          <img
            src="/logos/leonard-puce-croix.png"
            alt=""
            aria-hidden
            className="w-[14px] h-[14px] shrink-0 mt-0.5 object-contain"
          />
          <span className="flex-1 min-w-0 break-words">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Variante « donut Leonard » — pour les listes de références concrètes. */
export function PucesLosange({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-text min-w-0">
          <img
            src="/logos/leonard-puce-donut.png"
            alt=""
            aria-hidden
            className="w-[14px] h-[14px] shrink-0 mt-0.5 object-contain"
          />
          <span className="flex-1 min-w-0 break-words">{it}</span>
        </li>
      ))}
    </ul>
  );
}
