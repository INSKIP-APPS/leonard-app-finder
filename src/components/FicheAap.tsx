import {
  X,
  ExternalLink,
  FileDown,
  Calendar,
  Coins,
  Users,
  Layers,
  Tag,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import type { AAP } from "@/types/aap";
import { aapEchelle } from "@/utils/echelle";
import { joursRestants } from "@/utils/scoring-engine";
import { useSavedIds, toggleSaved } from "@/utils/savedAaps";

// ──────────────────────────────────────────────────────────────────────
// Fiche détaillée d'un AAP (modale). Un clic sur un AAP l'ouvre au lieu de
// partir directement sur le lien externe : on voit la carte, on peut
// l'exporter en PDF, et on garde le lien cliquable vers l'appel officiel.
// ──────────────────────────────────────────────────────────────────────

const STATUT_LABEL: Record<string, string> = {
  open: "Ouvert",
  forthcoming: "À venir",
  closed: "Clôturé",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function fmtEuros(n: number | null): string | null {
  if (n == null) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function budgetLabel(a: AAP): string {
  const parProjet = fmtEuros(a.budget_par_projet);
  if (parProjet) return `${parProjet} / projet`;
  const total = fmtEuros(a.budget_total);
  if (total) return `${total} (enveloppe)`;
  const montants = (a as unknown as { montants?: string }).montants;
  if (montants) return montants.slice(0, 120);
  return "Montant non précisé";
}

function trlLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `TRL ${min}–${max}`;
  return `TRL ${min ?? max}`;
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Génère une fenêtre imprimable propre (l'utilisateur choisit « Enregistrer en PDF »). */
function exporterPdf(a: AAP) {
  const jr = joursRestants(a.date_cloture);
  const rows: [string, string][] = [
    ["Programme / financeur", a.programme],
    ["Source", a.source],
    ["Échelle", aapEchelle(a)],
    ["Statut", STATUT_LABEL[a.statut] ?? a.statut],
    ["Date d'ouverture", fmtDate(a.date_ouverture)],
    ["Date de clôture", fmtDate(a.date_cloture) + (jr != null && jr >= 0 ? ` (J-${jr})` : "")],
    ["Budget", budgetLabel(a)],
    ["Maturité (TRL)", trlLabel(a.trl_min, a.trl_max) ?? "—"],
    ["Acteurs éligibles", (a.acteurs_eligibles ?? []).join(", ") || "—"],
    ["Type d'action", a.type_action_detail || a.type_action],
    ["Thématiques", (a.thematiques ?? []).join(", ") || "—"],
  ];
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(a.titre)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a2b4a; margin: 40px; line-height: 1.5; }
  .brand { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #6b7a99; margin-bottom: 6px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .prog { color: #6b7a99; font-size: 13px; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e7ebf3; font-size: 13px; vertical-align: top; }
  td.k { color: #6b7a99; width: 200px; font-weight: 500; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #6b7a99; margin: 18px 0 6px; }
  p.desc { font-size: 13px; white-space: pre-wrap; }
  a { color: #2b5cad; }
  .foot { margin-top: 24px; font-size: 11px; color: #9aa7bd; border-top: 1px solid #e7ebf3; padding-top: 10px; }
</style></head><body>
  <div class="brand">Leonard — Veille AAP</div>
  <h1>${esc(a.titre)}</h1>
  <div class="prog">${esc(a.programme)}${a.cluster ? " · " + esc(a.cluster) : ""}</div>
  <table><tbody>${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
  ${a.description ? `<h2>Description</h2><p class="desc">${esc(a.description)}</p>` : ""}
  <h2>Lien officiel</h2><p><a href="${esc(a.lien_officiel)}">${esc(a.lien_officiel)}</a></p>
  <div class="foot">Fiche générée le ${new Date().toLocaleDateString("fr-FR")} — Leonard AAP Finder</div>
  <script>window.onload = function(){ window.print(); }</script>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) {
    alert("Autorisez les fenêtres pop-up pour exporter en PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "sky" | "purple" | "emerald" | "pink";
}) {
  const cls = {
    muted: "bg-muted text-text",
    sky: "bg-[#E6F1FB] text-navy",
    purple: "bg-[#F3E8FF] text-purple",
    emerald: "bg-[#ECFDF5] text-emerald-700 border border-emerald-200",
    pink: "bg-pink/10 text-pink",
  }[tone];
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{children}</span>;
}

function InfoLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted mt-0.5">{icon}</span>
      <div>
        <div className="label-caps text-[10px]">{label}</div>
        <div className="text-sm text-text">{value}</div>
      </div>
    </div>
  );
}

export function FicheAap({ aap, onClose }: { aap: AAP | null; onClose: () => void }) {
  const saved = useSavedIds().includes(aap?.id ?? "");
  if (!aap) return null;
  const jr = joursRestants(aap.date_cloture);
  const echelle = aapEchelle(aap);
  const trl = trlLabel(aap.trl_min, aap.trl_max);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl my-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div className="min-w-0">
            <div className="label-caps text-[10px] mb-1">{aap.source}</div>
            <h2 className="text-lg font-bold text-navy leading-snug">{aap.titre}</h2>
            <div className="text-sm text-muted mt-1">
              {aap.programme}
              {aap.cluster ? ` · ${aap.cluster}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-muted hover:text-navy"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 px-5 pt-4">
          <Badge tone="sky">{echelle}</Badge>
          <Badge tone={aap.statut === "closed" ? "pink" : "emerald"}>
            {STATUT_LABEL[aap.statut] ?? aap.statut}
          </Badge>
          <Badge tone="purple">{aap.type_action}</Badge>
          {trl && <Badge tone="muted">{trl}</Badge>}
          {(aap.thematiques ?? []).slice(0, 4).map((t) => (
            <Badge key={t} tone="muted">
              {t}
            </Badge>
          ))}
        </div>

        {/* Infos clés */}
        <div className="grid grid-cols-2 gap-4 px-5 py-4">
          <InfoLine
            icon={<Calendar className="w-4 h-4" />}
            label="Clôture"
            value={`${fmtDate(aap.date_cloture)}${jr != null && jr >= 0 ? ` · J-${jr}` : ""}`}
          />
          <InfoLine
            icon={<Calendar className="w-4 h-4" />}
            label="Ouverture"
            value={fmtDate(aap.date_ouverture)}
          />
          <InfoLine icon={<Coins className="w-4 h-4" />} label="Budget" value={budgetLabel(aap)} />
          <InfoLine
            icon={<Users className="w-4 h-4" />}
            label="Acteurs éligibles"
            value={(aap.acteurs_eligibles ?? []).join(", ") || "—"}
          />
        </div>

        {/* Aussi disponible via */}
        {aap.sources_multiples && aap.sources_multiples.length > 0 && (
          <div className="px-5 pb-2 flex items-center gap-2 text-xs text-emerald-700">
            <Layers className="w-3.5 h-3.5" /> Aussi référencé sur :{" "}
            {aap.sources_multiples.join(", ")}
          </div>
        )}

        {/* Description */}
        {aap.description && (
          <div className="px-5 pb-4">
            <div className="label-caps text-[10px] mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Description
            </div>
            <p className="text-sm text-text whitespace-pre-wrap max-h-64 overflow-y-auto">
              {aap.description}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 p-5 border-t border-border bg-bg rounded-b-xl">
          <button
            onClick={() => toggleSaved(aap.id)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition ${saved ? "border-pink/40 bg-pink/10 text-pink" : "border-border text-navy hover:border-navy"}`}
          >
            {saved ? (
              <>
                <BookmarkCheck className="w-4 h-4" /> Sauvegardé
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4" /> Sauvegarder
              </>
            )}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exporterPdf(aap)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm font-medium text-navy hover:border-navy transition"
            >
              <FileDown className="w-4 h-4" /> Exporter en PDF
            </button>
            <a
              href={aap.lien_officiel}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-navy text-white text-sm font-medium hover:opacity-90 transition"
            >
              Voir l'appel officiel <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
