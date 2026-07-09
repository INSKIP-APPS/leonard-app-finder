import { ChevronRight, Check, AlertTriangle, Sparkles } from "lucide-react";
import type { AAP } from "@/types/aap";
import type { Candidat } from "@/utils/preselection";
import type { Verdict } from "@/services/claude-judge";
import { fmtDate, budgetCompact } from "@/utils/format";

// Carte d'un AAP RETENU par le juge (V2.1) : l'argumentaire « pourquoi pour
// vous » est l'information principale ; les métadonnées passent en pied.

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
  return (
    <button
      type="button"
      onClick={() => onOpen(aap)}
      className="card-flat p-4 hover:border-navy transition flex flex-col gap-3 text-left w-full"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-navy text-sm leading-snug">{aap.titre}</div>
          <div className="text-xs text-muted mt-0.5">
            {aap.source}
            {aap.type_action ? ` · ${aap.type_action}` : ""}
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ECFDF5] text-emerald-700 border border-emerald-200">
          <Sparkles className="w-3 h-3" /> Validé IA
        </span>
      </div>

      {/* L'argumentaire du juge : l'info principale */}
      <div className="flex items-start gap-1.5 text-sm text-text">
        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <span>{verdict.raison}</span>
      </div>

      {(verdict.points_attention.length > 0 || candidat.flags.length > 0) && (
        <ul className="space-y-1">
          {[...verdict.points_attention, ...candidat.flags]
            .filter((p, i, arr) => arr.indexOf(p) === i)
            .slice(0, 3)
            .map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-xs text-muted border-t border-border pt-2 mt-auto">
        <span>Clôture {fmtDate(aap.date_cloture)}</span>
        <span className="inline-flex items-center gap-1 text-navy font-medium">
          {aap.montants ? aap.montants.slice(0, 40) : budgetCompact(aap)}
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}
