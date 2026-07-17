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
    <div>
      <div className="label-caps text-[10px]">{label}</div>
      <div className="text-sm text-text">{value}</div>
    </div>
  );
}

export function Puces({ items }: { items: string[] }) {
  // Puce = symbole VINCI (croix bleue + rouge), reprise du mark utilisé par Rating3.
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it} className="flex items-start gap-2.5 text-sm text-text">
          <img
            src="/logos/vinci-mark.png"
            alt=""
            aria-hidden
            className="w-[16px] h-[16px] shrink-0 object-contain mt-0.5"
          />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Variante « losange Leonard » — puces pour les listes concrètes (références,
 *  exemples, AAP en cours). Chaque item peut être un React node. */
export function PucesLosange({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-text">
          <img
            src="/logos/leonard-mark.png"
            alt=""
            aria-hidden
            className="w-[16px] h-[16px] shrink-0 object-contain mt-0.5"
          />
          <span className="flex-1 min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}
