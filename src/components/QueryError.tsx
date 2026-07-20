import { AlertTriangle } from "lucide-react";

// État d'erreur partagé pour les écrans pilotés par useQuery. Factorise le bloc
// « icône + message + Réessayer » auparavant recopié sur le cockpit, l'explorer
// et la page programme (audit lot 2). Un chiffre affiché doit être vrai ou
// explicitement indisponible — jamais un faux zéro silencieux.
export function QueryError({
  title,
  hint,
  onRetry,
  className = "flex flex-col items-center justify-center py-32 text-center gap-3",
}: {
  title: string;
  hint?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <AlertTriangle className="w-8 h-8 text-pink" />
      <div className="text-navy font-semibold">{title}</div>
      {hint && <div className="text-sm text-muted max-w-md">{hint}</div>}
      <button
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-navy text-white text-sm font-medium hover:opacity-90 transition"
      >
        Réessayer
      </button>
    </div>
  );
}
