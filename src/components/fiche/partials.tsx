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
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center justify-center rounded-full bg-navy text-white text-[11px] font-semibold px-3 py-1.5 min-w-[160px]">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((i) => (
          <RatingMark key={i} src={src} faded={i > lvl} />
        ))}
      </div>
      <span className="text-sm font-medium text-text">{valeur}</span>
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
  return (
    <div className="flex items-center gap-1.5 text-navy font-semibold text-sm border-b border-border pb-1.5 mb-2.5">
      {icon}
      {children}
    </div>
  );
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-caps text-[10px]">{label}</div>
      <div className="text-sm text-text">{value}</div>
    </div>
  );
}

export function Puces({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it} className="flex items-start gap-2 text-sm text-text">
          <span className="text-navy font-bold leading-5 shrink-0">+</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Puces losange (◆) façon « Références » Leonard, pour des listes d'éléments concrets
 *  (AAP en cours, projets exemples). Chaque item peut être un React node cliquable. */
export function PucesLosange({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-text">
          <span className="text-sky-ink shrink-0 leading-5">◆</span>
          <span className="flex-1 min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}
