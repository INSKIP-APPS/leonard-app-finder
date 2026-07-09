import { ChevronRight, Check, AlertTriangle, Sparkles } from "lucide-react";
import type { AAP } from "@/types/aap";
import type { Candidat } from "@/utils/preselection";
import type { Verdict } from "@/services/claude-judge";
import { fmtDate, montantAffiche } from "@/utils/format";

// Carte d'un AAP retenu par l'analyse IA. Taille STANDARDISÉE : chaque zone de
// texte est bornée (line-clamp) et la carte a une hauteur minimale fixe, pour
// que toutes les fiches soient identiques quelle que soit la longueur des
// contenus. L'intégralité des textes reste lisible en ouvrant la fiche.

export function VerdictCard({
  candidat,
  verdict,
  onOpen,
}: {
  candidat: Candidat;
  verdict: Verdict;
  onOpen: (a: AAP) => void;
}) {
  const { aap } = candidat;
  const points = [...verdict.points_attention, ...candidat.flags]
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .slice(0, 2);

  return (
    <button
      type="button"
      onClick={() => onOpen(aap)}
      className="card-flat p-4 hover:border-navy transition flex flex-col gap-3 text-left w-full h-full min-h-[280px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-navy text-sm leading-snug line-clamp-2 min-h-[2.5rem]">
            {aap.titre}
          </div>
          <div className="text-xs text-muted mt-0.5 line-clamp-1">
            {aap.source}
            {aap.type_action ? ` · ${aap.type_action}` : ""}
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ECFDF5] text-emerald-700 border border-emerald-200">
          <Sparkles className="w-3 h-3" /> Validé IA
        </span>
      </div>

      {/* L'argumentaire de l'analyse : l'information principale */}
      <div className="flex items-start gap-1.5 text-sm text-text">
        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <span className="line-clamp-3 min-h-[3.75rem]">{verdict.raison}</span>
      </div>

      <div className="min-h-[2.5rem]">
        {points.length > 0 && (
          <ul className="space-y-1">
            {points.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{p}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted border-t border-border pt-2 mt-auto">
        <span className="shrink-0">Clôture {fmtDate(aap.date_cloture)}</span>
        <span className="inline-flex items-center gap-1 text-navy font-medium text-right">
          <span className="line-clamp-1">{montantAffiche(aap)}</span>
          <ChevronRight className="w-3 h-3 shrink-0" />
        </span>
      </div>
    </button>
  );
}
