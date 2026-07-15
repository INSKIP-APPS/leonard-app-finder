import {
  X,
  ExternalLink,
  FileDown,
  Coins,
  Layers,
  Users,
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import type { AAP } from "@/types/aap";
import { aapEchelle } from "@/utils/echelle";
import { joursRestants, statutEffectif, difficulteCandidature } from "@/utils/scoring-engine";
import { useSavedIds, toggleSaved } from "@/utils/savedAaps";
import {
  fmtDateLongue,
  montantAffiche,
  trlLabel,
  STATUT_AAP_LABEL,
  escapeHtml as esc,
} from "@/utils/format";
import { Badge } from "@/components/Badge";
import { Rating3, SectionTitle, InfoLine, Puces } from "@/components/fiche/partials";

// ──────────────────────────────────────────────────────────────────────
// Fiche détaillée d'un APPEL À PROJETS (modale), sur la même mise en forme
// que la fiche dispositif : niveaux 3 points (difficulté de candidature),
// sections structurées, puces, export PDF et lien officiel.
// ──────────────────────────────────────────────────────────────────────

/** Génère une fenêtre imprimable propre (l'utilisateur choisit « Enregistrer en PDF »). */
function exporterPdf(a: AAP) {
  const jr = joursRestants(a.date_cloture);
  const diff = difficulteCandidature(a);
  const rows: [string, string][] = [
    ["Programme / financeur", a.programme],
    ["Source", a.source],
    ["Échelle", aapEchelle(a)],
    ["Statut", STATUT_AAP_LABEL[statutEffectif(a)] ?? a.statut],
    ["Difficulté de candidature", diff.niveau],
    ["Date d'ouverture", fmtDateLongue(a.date_ouverture)],
    [
      "Date de clôture",
      fmtDateLongue(a.date_cloture) + (jr != null && jr >= 0 ? ` (J-${jr})` : ""),
    ],
    ["Montant", montantAffiche(a)],
    ["Maturité (TRL)", trlLabel(a.trl_min, a.trl_max) ?? "Non précisé"],
    ["Acteurs éligibles", (a.acteurs_eligibles ?? []).join(", ") || "Non précisé"],
    ["Type d'action", a.type_action_detail || a.type_action],
    ["Thématiques", (a.thematiques ?? []).join(", ") || "Non précisé"],
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
  <div class="brand">Leonard · Veille AAP</div>
  <h1>${esc(a.titre)}</h1>
  <div class="prog">${esc(a.programme)}${a.cluster ? " · " + esc(a.cluster) : ""}</div>
  <table><tbody>${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
  ${a.description ? `<h2>Description</h2><p class="desc">${esc(a.description)}</p>` : ""}
  <h2>Lien officiel</h2><p><a href="${esc(a.lien_officiel)}">${esc(a.lien_officiel)}</a></p>
  <div class="foot">Fiche générée le ${new Date().toLocaleDateString("fr-FR")} · Leonard AAP Finder</div>
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

export function FicheAap({ aap, onClose }: { aap: AAP | null; onClose: () => void }) {
  const saved = useSavedIds().includes(aap?.id ?? "");
  if (!aap) return null;
  const jr = joursRestants(aap.date_cloture);
  const echelle = aapEchelle(aap);
  const trl = trlLabel(aap.trl_min, aap.trl_max);
  const statut = statutEffectif(aap);
  const diff = difficulteCandidature(aap);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-3xl my-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border bg-[#F5F8FC] rounded-t-xl">
          <div className="min-w-0">
            <div className="label-caps text-[10px] mb-1">{aap.source}</div>
            <h2 className="text-lg font-bold text-navy leading-snug">{aap.titre}</h2>
            <div className="text-sm text-muted mt-1">
              {aap.programme}
              {aap.cluster ? ` · ${aap.cluster}` : ""}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge tone="sky">{echelle}</Badge>
              <Badge tone={statut === "closed" ? "pink" : "emerald"}>
                {STATUT_AAP_LABEL[statut] ?? statut}
              </Badge>
              <Badge tone="purple">{aap.type_action}</Badge>
              {trl && <Badge tone="muted">{trl}</Badge>}
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

        {/* Niveau (3 points) + points de vigilance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-4 border-b border-border">
          <div className="space-y-2.5">
            <Rating3 label="Difficulté de candidature" valeur={diff.niveau} palette="difficulte" />
          </div>
          <div>
            {diff.points.length > 0 && (
              <>
                <div className="label-caps text-[10px] mb-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Points de vigilance
                </div>
                <ul className="space-y-1">
                  {diff.points.slice(0, 3).map((p) => (
                    <li key={p} className="flex items-start gap-1.5 text-xs text-muted">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* 3 colonnes : périmètre · financement · acteurs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 px-5 py-4">
          <div className="space-y-3">
            <SectionTitle>Périmètre & nature</SectionTitle>
            <InfoLine label="Source" value={aap.source} />
            <InfoLine label="Échelle" value={echelle} />
            <InfoLine label="Statut" value={STATUT_AAP_LABEL[statut] ?? statut} />
            <InfoLine
              label="Type d'action"
              value={aap.type_action_detail || aap.type_action || "Non précisé"}
            />
          </div>
          <div className="space-y-3">
            <SectionTitle icon={<Coins className="w-3.5 h-3.5" />}>
              Financement & calendrier
            </SectionTitle>
            <InfoLine label="Montant" value={montantAffiche(aap)} />
            <InfoLine
              label="Ouverture"
              value={aap.date_ouverture ? fmtDateLongue(aap.date_ouverture) : "Non précisée"}
            />
            <InfoLine
              label="Clôture"
              value={
                aap.date_cloture
                  ? `${fmtDateLongue(aap.date_cloture)}${jr != null && jr >= 0 ? ` (J-${jr})` : ""}`
                  : "Non précisée"
              }
            />
            <InfoLine label="Maturité (TRL)" value={trl ?? "Non précisé"} />
          </div>
          <div>
            <SectionTitle icon={<Users className="w-3.5 h-3.5" />}>Acteurs éligibles</SectionTitle>
            {(aap.acteurs_eligibles ?? []).length > 0 ? (
              <Puces items={(aap.acteurs_eligibles ?? []).slice(0, 8)} />
            ) : (
              <div className="text-sm text-muted italic">Non précisé.</div>
            )}
          </div>
        </div>

        {/* Thématiques + multi-sources */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 pb-4 border-t border-border pt-4">
          <div>
            <SectionTitle icon={<Layers className="w-3.5 h-3.5" />}>Thématiques</SectionTitle>
            {(aap.thematiques ?? []).length > 0 ? (
              <Puces items={aap.thematiques} />
            ) : (
              <div className="text-sm text-muted italic">Non précisé.</div>
            )}
          </div>
          <div>
            {aap.sources_multiples && aap.sources_multiples.length > 0 && (
              <>
                <SectionTitle>Aussi référencé sur</SectionTitle>
                <Puces items={aap.sources_multiples} />
              </>
            )}
          </div>
        </div>

        {/* Description */}
        {aap.description && (
          <div className="px-5 pb-4">
            <div className="rounded-lg bg-[#F5F7FB] border border-border p-3">
              <div className="label-caps text-[10px] mb-1">Description</div>
              <p className="text-sm text-text whitespace-pre-wrap max-h-64 overflow-y-auto">
                {aap.description}
              </p>
            </div>
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
