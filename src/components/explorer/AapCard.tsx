import { ChevronRight } from "lucide-react";
import type { AAP } from "@/types/aap";
import { aapEchelle } from "@/utils/echelle";
import { statutEffectif } from "@/utils/scoring-engine";
import { fmtDate, budgetCompact, trlLabel, STATUT_AAP_LABEL } from "@/utils/format";
import { geoBadge } from "./badges";

// Carte AAP de l'Explorer (vue « AAP scrapés »). Extraite de routes/explorer.tsx.

export function AapCard({ a, onOpen }: { a: AAP; onOpen: (a: AAP) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      className="card-flat p-4 hover:border-navy transition cursor-pointer flex gap-4 text-left w-full"
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-navy text-sm">{a.titre}</div>
        <div className="text-xs text-muted mt-0.5">
          {a.programme}
          {a.cluster && (
            <>
              {" · "}
              <span className="text-navy/70 font-medium">{a.cluster}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {geoBadge(aapEchelle(a))}
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#F3E8FF] text-purple">
            {a.type_action}
          </span>
          {trlLabel(a.trl_min, a.trl_max) && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-navy">
              {trlLabel(a.trl_min, a.trl_max)}
            </span>
          )}
          {a.thematiques.slice(0, 2).map((s) => (
            <span key={s} className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-text">
              {s}
            </span>
          ))}
          {a.sources_multiples && a.sources_multiples.length > 0 && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium bg-[#ECFDF5] text-emerald-700 border border-emerald-200"
              title={`Ce dispositif est aussi référencé sur : ${a.sources_multiples.join(", ")}`}
            >
              aussi via {a.sources_multiples.join(", ")}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end justify-between shrink-0 text-right">
        <div>
          <div className="text-sm font-semibold text-text">{budgetCompact(a)}</div>
          <div className="text-xs mt-1 text-muted">
            {STATUT_AAP_LABEL[statutEffectif(a)]} · {fmtDate(a.date_cloture)}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted mt-2" />
      </div>
    </button>
  );
}
