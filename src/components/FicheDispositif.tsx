import { useState } from "react";
import {
  X,
  ExternalLink,
  FileDown,
  Coins,
  Layers,
  Building2,
  Users,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import type { Dispositif } from "@/types/dispositif";
import { perimetreVinci, type PerimetreVinci } from "@/utils/vinciBU";
import { useSavedDispositifIds, toggleSavedDispositif } from "@/utils/savedAaps";
import { trlLabel, escapeHtml as esc } from "@/utils/format";
import { Badge } from "@/components/Badge";
import {
  Rating3,
  SectionTitle,
  InfoLine,
  Puces,
  PucesLosange,
} from "@/components/fiche/partials";

// ──────────────────────────────────────────────────────────────────────
// Fiche détaillée d'un DISPOSITIF (modale), mise en forme inspirée de la
// slide « Zoom | Dispositif spécifique » :
//   • niveaux (Difficulté de montage, Pertinence VINCI) en échelle 3 points
//   • périmètre VINCI en LOGOS de BU (repli texte si le logo manque)
//   • contenu en puces propres · export PDF · lien officiel
// ──────────────────────────────────────────────────────────────────────

function modalitesEnPuces(txt: string | null): string[] {
  if (!txt) return [];
  return txt
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Logo d'une BU — tuile de taille FIXE identique pour toutes (logos centrés,
 * fond blanc), pour un rendu homogène malgré des ratios d'images différents.
 * Repli sur le nom si l'image est absente / 404.
 */
function BuLogo({ bu }: { bu: PerimetreVinci }) {
  const [err, setErr] = useState(false);
  return (
    <span
      title={bu.nom}
      className="inline-flex items-center justify-center w-[128px] h-12 rounded-md border border-border bg-white px-2.5 shrink-0"
    >
      {err ? (
        <span className="text-[11px] font-semibold text-navy text-center leading-tight">
          {bu.nom}
        </span>
      ) : (
        <img
          src={bu.logo}
          alt={bu.nom}
          onError={() => setErr(true)}
          className="max-h-9 max-w-[108px] object-contain"
        />
      )}
    </span>
  );
}

/** Fenêtre imprimable propre (l'utilisateur choisit « Enregistrer en PDF »). */
function exporterPdf(d: Dispositif) {
  const modalites = modalitesEnPuces(d.modalites_criteres);
  const bus = perimetreVinci(d).map((b) => b.nom);
  const rows: [string, string][] = [
    ["Organisme", d.organisme],
    ["Programme", d.programme],
    ["Échelle", d.echelle],
    ["Statut", d.statut_ouverture ?? "—"],
    ["Pertinence VINCI", d.pertinence_vinci ?? "—"],
    ["Difficulté de montage", d.difficulte ?? "—"],
    ["Type de financement", d.type_financement ?? "—"],
    ["Montant", d.montant ?? "—"],
    ["Taux max", d.taux_max ?? "—"],
    ["Maturité (TRL)", trlLabel(d.trl_min, d.trl_max) ?? "—"],
  ];
  const liste = (titre: string, items: string[]) =>
    items.length
      ? `<h2>${esc(titre)}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
      : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(d.nom)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#1a2b4a;margin:40px;line-height:1.5}
  .brand{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7a99;margin-bottom:6px}
  h1{font-size:20px;margin:0 0 4px}
  .prog{color:#6b7a99;font-size:13px;margin-bottom:20px}
  table{border-collapse:collapse;width:100%;margin-bottom:16px}
  td{padding:7px 10px;border-bottom:1px solid #e7ebf3;font-size:13px;vertical-align:top}
  td.k{color:#6b7a99;width:200px;font-weight:500}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6b7a99;margin:18px 0 6px}
  ul{margin:0 0 12px;padding-left:18px}
  li{font-size:13px;margin:3px 0}
  a{color:#2b5cad}
  .foot{margin-top:24px;font-size:11px;color:#9aa7bd;border-top:1px solid #e7ebf3;padding-top:10px}
</style></head><body>
  <div class="brand">Leonard — Veille AAP · Fiche dispositif</div>
  <h1>${esc(d.nom)}</h1>
  <div class="prog">${esc(d.organisme)}${d.programme ? " · " + esc(d.programme) : ""}</div>
  <table><tbody>${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
  ${liste("Critères & modalités", modalites)}
  ${liste("Thématiques ciblées", d.thematiques_liste ?? [])}
  ${liste("Acteurs ciblés", d.acteurs_liste ?? [])}
  ${liste("Périmètre VINCI", bus)}
  ${d.commentaires ? `<h2>Analyse Leonard</h2><p style="font-size:13px">${esc(d.commentaires)}</p>` : ""}
  ${d.lien_officiel ? `<h2>Lien officiel</h2><p><a href="${esc(d.lien_officiel)}">${esc(d.lien_officiel)}</a></p>` : ""}
  <div class="foot">Fiche générée le ${new Date().toLocaleDateString("fr-FR")} — Leonard AAP Finder</div>
  <script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) {
    alert("Autorisez les fenêtres pop-up pour exporter en PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

export function FicheDispositif({
  dispositif,
  onClose,
}: {
  dispositif: Dispositif | null;
  onClose: () => void;
}) {
  const saved = useSavedDispositifIds().includes(dispositif?.id ?? "");
  if (!dispositif) return null;
  const d = dispositif;
  const trl = trlLabel(d.trl_min, d.trl_max);
  const modalites = modalitesEnPuces(d.modalites_criteres);
  const bus = perimetreVinci(d);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#EAF3FC] rounded-xl w-full max-w-5xl my-8 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête (fond bleu très pâle) */}
        <div className="flex items-start justify-between gap-4 p-5 rounded-t-xl">
          <div className="min-w-0 flex-1">
            <div className="label-caps text-[10px] mb-1 break-words">{d.organisme}</div>
            <h2 className="text-lg font-bold text-navy leading-snug break-words">{d.nom}</h2>
            {d.programme && (
              <div className="text-sm text-muted mt-1 break-words">{d.programme}</div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge tone="sky">{d.echelle}</Badge>
              {d.statut_ouverture && <Badge tone="sky">{d.statut_ouverture}</Badge>}
              {trl && <Badge tone="sky">{trl}</Badge>}
              {d.type_financement && <Badge tone="sky">{d.type_financement}</Badge>}
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

        {/* Niveaux (3 points) + Périmètre VINCI (logos) — carte blanche détachée */}
        <div className="mx-5 rounded-lg bg-white shadow-sm p-4 grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-5">
          <div className="space-y-2.5 min-w-0">
            <Rating3 label="Difficulté de montage" valeur={d.difficulte} palette="difficulte" />
            <Rating3 label="Pertinence VINCI" valeur={d.pertinence_vinci} palette="pertinence" />
          </div>
          <div className="min-w-0">
            <div className="label-caps text-[10px] mb-1.5 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Périmètre VINCI
            </div>
            <div className="flex flex-wrap items-center gap-2 max-w-[268px]">
              {bus.map((bu) => (
                <BuLogo key={bu.id} bu={bu} />
              ))}
            </div>
          </div>
        </div>

        {/* 3 colonnes : périmètre · financement · modalités — fond bleu pâle */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr] gap-5 px-5 py-5">
          <div className="space-y-3 min-w-0">
            <SectionTitle>Périmètre & nature</SectionTitle>
            <InfoLine label="Organisme" value={d.organisme} />
            <InfoLine label="Échelle" value={d.echelle} />
            <InfoLine label="Statut" value={d.statut_ouverture ?? "—"} />
          </div>
          <div className="space-y-3 min-w-0">
            <SectionTitle icon={<Coins className="w-3.5 h-3.5" />}>Financement</SectionTitle>
            <InfoLine label="Type" value={d.type_financement ?? "—"} />
            <InfoLine label="Montant" value={d.montant ?? "—"} />
            <InfoLine label="Taux max" value={d.taux_max ?? "—"} />
            <InfoLine label="Maturité (TRL)" value={trl ?? "—"} />
          </div>
          <div className="min-w-0">
            <SectionTitle>Critères & modalités</SectionTitle>
            {modalites.length ? (
              <Puces items={modalites} />
            ) : (
              <div className="text-sm text-muted italic">Non précisé.</div>
            )}
          </div>
        </div>

        {/* Thématiques · Acteurs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 pb-5">
          <div className="min-w-0">
            <SectionTitle icon={<Layers className="w-3.5 h-3.5" />}>
              Thématiques ciblées
            </SectionTitle>
            <Puces items={d.thematiques_liste ?? []} />
          </div>
          <div className="min-w-0">
            <SectionTitle icon={<Users className="w-3.5 h-3.5" />}>Acteurs ciblés</SectionTitle>
            <PucesLosange items={d.acteurs_liste ?? []} />
          </div>
        </div>

        {/* Analyse Leonard — carte blanche détachée sur fond bleu pâle */}
        {d.commentaires && (
          <div className="mx-5 mb-5 rounded-lg bg-white shadow-sm p-4">
            <div className="label-caps text-[10px] mb-1">Analyse Leonard</div>
            <p className="text-sm text-text whitespace-pre-wrap break-words">{d.commentaires}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 p-5 border-t border-sky/15 bg-white rounded-b-xl">
          <button
            onClick={() => toggleSavedDispositif(d.id)}
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
              onClick={() => exporterPdf(d)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm font-medium text-navy hover:border-navy transition"
            >
              <FileDown className="w-4 h-4" /> Exporter en PDF
            </button>
            {d.lien_officiel && (
              <a
                href={d.lien_officiel}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-navy text-white text-sm font-medium hover:opacity-90 transition"
              >
                Voir le dispositif officiel <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
