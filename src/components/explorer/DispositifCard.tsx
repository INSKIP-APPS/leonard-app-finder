import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import type { Dispositif } from "@/types/dispositif";
import type { AAP } from "@/types/aap";
import { fmtDate, budgetCompact, trlLabel } from "@/utils/format";
import { geoBadge, statutDispositifBadge } from "./badges";

// Carte dispositif de l'Explorer : en-tête dépliable (AAP rattachés) +
// bouton « Voir la fiche ». Extraite de routes/explorer.tsx.

export function DispositifCard({
  d,
  rattaches,
  isOpen,
  onToggle,
  onOpenFiche,
  onOpenAap,
}: {
  d: Dispositif;
  rattaches: AAP[];
  isOpen: boolean;
  onToggle: () => void;
  onOpenFiche: (d: Dispositif) => void;
  onOpenAap: (a: AAP) => void;
}) {
  const trl = trlLabel(d.trl_min, d.trl_max);
  return (
    <article className="card-flat hover:border-navy transition overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4 flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-navy text-sm">{d.nom}</div>
            {rattaches.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-navy/10 text-navy">
                {rattaches.length} AAP
              </span>
            )}
          </div>
          <div className="text-xs text-muted mt-0.5">{d.organisme}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {geoBadge(d.echelle)}
            {d.type_financement && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#F3E8FF] text-purple">
                {d.type_financement}
              </span>
            )}
            {trl && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-navy">
                {trl}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end justify-between shrink-0 text-right">
          <div>
            <div className="text-sm font-semibold text-text">{d.montant ?? "—"}</div>
            {statutDispositifBadge(d)}
          </div>
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-muted mt-2" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted mt-2" />
          )}
        </div>
      </button>

      {/* Action : ouvrir la fiche détaillée (le dépliant reste au clic sur la carte) */}
      <div className="flex justify-end px-4 pb-3 -mt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFiche(d);
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-navy hover:underline"
        >
          <FileText className="w-3.5 h-3.5" /> Voir la fiche
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-border bg-[#F9FAFC] px-4 py-3 space-y-2">
          <div className="label-caps">AAP rattachés ({rattaches.length})</div>
          {rattaches.length === 0 && (
            <div className="text-xs text-muted italic">Aucun AAP scrapé pour ce dispositif.</div>
          )}
          {rattaches.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={(e) => {
                e.stopPropagation();
                onOpenAap(a);
              }}
              className="w-full text-left rounded-md border border-border bg-white p-3 flex items-start justify-between gap-3 hover:border-navy transition"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-text truncate">{a.titre}</div>
                <div className="text-xs text-muted mt-0.5">
                  {a.id} · clôture {fmtDate(a.date_cloture)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-semibold text-navy">{budgetCompact(a)}</div>
                <div className="text-[11px] text-muted">
                  {trlLabel(a.trl_min, a.trl_max) ?? "—"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
