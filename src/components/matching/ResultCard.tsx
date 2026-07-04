import { ChevronRight, Check, AlertTriangle, Sparkles, HelpCircle } from "lucide-react";
import type { AAP } from "@/types/aap";
import type { ScoredAap } from "@/utils/scoring-engine";
import { fmtDate, fmtMillions } from "@/utils/format";
import { TierBadge } from "@/utils/tier";

// ── Carte de résultat du matching (sous-scores réels + raisons Couche 1,
//    enrichissements Couche 2 le cas échéant) ──────────────────────────

function barColor(v: number) {
  if (v >= 70) return "bg-emerald-500";
  if (v >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</span>
        <span className="text-xs font-semibold text-navy tabular-nums">
          {value}
          <span className="text-muted font-normal">/100</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#eef2ff] overflow-hidden">
        <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ResultCard({ scored, onOpen }: { scored: ScoredAap; onOpen: (a: AAP) => void }) {
  const {
    aap,
    score,
    sous_scores,
    raisons,
    points_attention,
    enrichi,
    score_structurel,
    score_semantique,
    elements_manquants,
  } = scored;
  return (
    <button
      type="button"
      onClick={() => onOpen(aap)}
      className={`card-flat p-4 hover:border-navy transition flex flex-col gap-3 text-left w-full ${enrichi ? "border-purple/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {enrichi && (
              <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F3E8FF] text-purple">
                <Sparkles className="w-3 h-3" /> IA
              </span>
            )}
            <div className="font-semibold text-navy text-sm leading-snug">{aap.titre}</div>
          </div>
          <div className="text-xs text-muted mt-0.5">
            {aap.programme}
            {aap.cluster && (
              <>
                {" "}
                · <span className="font-medium">{aap.cluster}</span>
              </>
            )}
            {" · "}
            {aap.type_action}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-navy tabular-nums leading-none">{score}</div>
          <div className="mt-1">
            <TierBadge score={score} />
          </div>
          {enrichi && score_structurel != null && score_semantique != null && (
            <div className="text-[10px] text-muted mt-1 whitespace-nowrap">
              struct. {score_structurel} · IA {score_semantique}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <SubScore label="Adéquation" value={sous_scores.adequation} />
        <SubScore label="Accessibilité" value={sous_scores.accessibilite} />
        <SubScore label="Financier" value={sous_scores.financier} />
      </div>

      {raisons.length > 0 && (
        <ul className="space-y-1">
          {raisons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-text">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {points_attention.length > 0 && (
        <ul className="space-y-1">
          {points_attention.map((p, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      {elements_manquants && elements_manquants.length > 0 && (
        <ul className="space-y-1">
          {elements_manquants.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-purple">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>À renforcer : {e}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-xs text-muted border-t border-border pt-2 mt-auto">
        <span>Clôture {fmtDate(aap.date_cloture)}</span>
        <span className="inline-flex items-center gap-1 text-navy font-medium">
          {fmtMillions(aap.budget_par_projet ?? aap.budget_total)}{" "}
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}
