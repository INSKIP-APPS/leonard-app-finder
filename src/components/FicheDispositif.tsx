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
  RatingRow,
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

/**
 * Fenêtre imprimable qui reproduit fidèlement la fiche à l'écran (mêmes
 * couleurs, cartes, badges outline, tableau diagnostic, tuiles BU 2×2,
 * puces croix/donut, section titles cyan). L'utilisateur choisit
 * « Enregistrer en PDF » dans la boîte de dialogue d'impression.
 */
function exporterPdf(d: Dispositif) {
  const origin = window.location.origin;
  const modalites = modalitesEnPuces(d.modalites_criteres);
  const bus = perimetreVinci(d);
  const trl = trlLabel(d.trl_min, d.trl_max);

  const niv = (v: string | null): number => {
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
  };

  const ratingRow = (label: string, valeur: string | null, icon: string) => {
    const lvl = niv(valeur);
    if (!lvl || !valeur) return "";
    const marks = [1, 2, 3]
      .map(
        (i) =>
          `<img src="${origin}${icon}" alt="" style="width:16px;height:16px;object-fit:contain;${i > lvl ? "opacity:.2;" : ""}">`,
      )
      .join("");
    return `<div class="rrow"><span class="rrow-name">${esc(label)}</span><span class="rrow-marks">${marks}</span><span class="rrow-val">${esc(valeur)}</span></div>`;
  };

  const puces = (items: string[], icon: string) =>
    items.length
      ? `<ul class="puces">${items
          .map(
            (it) =>
              `<li><img src="${origin}${icon}" alt=""><span>${esc(it)}</span></li>`,
          )
          .join("")}</ul>`
      : `<div class="empty">Non précisé.</div>`;

  const infoLine = (label: string, value: string) =>
    `<div class="info-line"><div class="caps">${esc(label)}</div><div class="v">${esc(value)}</div></div>`;

  const badges = [d.echelle, d.statut_ouverture, trl, d.type_financement]
    .filter(Boolean)
    .map((b) => `<span class="badge">${esc(b as string)}</span>`)
    .join("");

  const buTiles = bus
    .map(
      (bu) =>
        `<span class="tile" title="${esc(bu.nom)}"><img src="${origin}${bu.logo}" alt="${esc(bu.nom)}"></span>`,
    )
    .join("");

  const buildingIcon = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`;

  const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8">
<title>${esc(d.nom)} — Fiche dispositif</title>
<style>
  @page { size: A4; margin: 12mm; }
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a2b4a; background: #EAF3FC; margin: 0; padding: 0; line-height: 1.4; font-size: 12px; }
  .modal { background: #EAF3FC; padding: 14px; }
  .hdr { padding: 4px 4px 12px; }
  .hdr .brand { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #6b7a99; margin-bottom: 4px; font-weight: 600; }
  .hdr h1 { font-size: 16px; margin: 0 0 3px; font-weight: 700; line-height: 1.3; color: #1a2b4a; }
  .hdr .prog { color: #6b7a99; font-size: 12px; margin-bottom: 8px; }
  .hdr .badges { display: flex; flex-wrap: wrap; gap: 5px; }
  .badge { background: #fff; border: 1px solid rgba(26,43,74,.2); color: #1a2b4a; font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 4px; }
  .card { background: #fff; border-radius: 8px; padding: 12px; margin-top: 10px; page-break-inside: avoid; }
  .diag { display: grid; grid-template-columns: 1fr 250px; gap: 16px; }
  .caps { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #6b7a99; font-weight: 600; display: flex; align-items: center; gap: 4px; }
  .caps .icon { flex-shrink: 0; }
  .rrow { display: grid; grid-template-columns: 1fr auto 60px; align-items: center; gap: 12px; padding: 7px 0; }
  .rrow + .rrow { border-top: 1px solid #e7ebf3; }
  .rrow-name { font-size: 13px; font-weight: 600; color: #1a2b4a; }
  .rrow-marks { display: inline-flex; gap: 3px; }
  .rrow-val { font-size: 13px; font-weight: 500; text-align: right; }
  .bus { display: flex; flex-wrap: wrap; gap: 6px; max-width: 236px; margin-top: 6px; }
  .tile { display: inline-flex; align-items: center; justify-content: center; width: 114px; height: 42px; padding: 0 8px; border-radius: 6px; border: 1px solid #E5E7EB; background: #fff; }
  .tile img { max-height: 30px; max-width: 96px; object-fit: contain; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .col { min-width: 0; }
  .sec-title { display: flex; align-items: center; gap: 6px; color: #0FAFEE; font-weight: 700; font-size: 13px; border-bottom: 1px solid #e7ebf3; padding-bottom: 5px; margin-bottom: 8px; }
  .info-line { margin-bottom: 6px; }
  .info-line .caps { margin-bottom: 1px; }
  .info-line .v { font-size: 13px; word-break: break-word; }
  ul.puces { list-style: none; margin: 0; padding: 0; }
  ul.puces li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; margin-bottom: 5px; page-break-inside: avoid; }
  ul.puces li img { width: 12px; height: 12px; flex-shrink: 0; margin-top: 3px; object-fit: contain; }
  ul.puces li span { flex: 1; word-break: break-word; }
  .empty { font-size: 12px; color: #6b7a99; font-style: italic; }
  .analyse .caps { margin-bottom: 4px; }
  .analyse p { font-size: 13px; margin: 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: #1a2b4a; }
  .foot { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e7ebf3; font-size: 10px; color: #9aa7bd; text-align: center; }
  .foot a { color: #2b5cad; word-break: break-all; }
  @media print {
    html, body { background: #EAF3FC !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    .modal { padding: 0; }
    .card { box-shadow: none; }
  }
</style>
</head>
<body>
<div class="modal">
  <div class="hdr">
    <div class="brand">${esc(d.organisme)}</div>
    <h1>${esc(d.nom)}</h1>
    ${d.programme ? `<div class="prog">${esc(d.programme)}</div>` : ""}
    <div class="badges">${badges}</div>
  </div>

  <div class="card diag">
    <div>
      <div class="caps" style="margin-bottom:8px">Diagnostic Leonard</div>
      ${ratingRow("Difficulté de montage", d.difficulte, "/logos/vinci-mark.png")}
      ${ratingRow("Pertinence VINCI", d.pertinence_vinci, "/logos/leonard-mark.png")}
    </div>
    <div>
      <div class="caps" style="margin-bottom:6px">${buildingIcon}Périmètre VINCI</div>
      <div class="bus">${buTiles}</div>
    </div>
  </div>

  <div class="card grid2">
    <div class="col">
      <div class="sec-title">Périmètre &amp; nature</div>
      ${infoLine("Organisme", d.organisme)}
      ${infoLine("Échelle", d.echelle)}
      ${infoLine("Statut", d.statut_ouverture ?? "—")}
    </div>
    <div class="col">
      <div class="sec-title">Financement</div>
      ${infoLine("Type", d.type_financement ?? "—")}
      ${infoLine("Montant", d.montant ?? "—")}
      ${infoLine("Taux max", d.taux_max ?? "—")}
      ${infoLine("Maturité (TRL)", trl ?? "—")}
    </div>
  </div>

  <div class="card">
    <div class="sec-title">Critères &amp; modalités</div>
    ${puces(modalites, "/logos/leonard-puce-croix.png")}
  </div>

  <div class="card grid2">
    <div class="col">
      <div class="sec-title">Thématiques ciblées</div>
      ${puces(d.thematiques_liste ?? [], "/logos/leonard-puce-croix.png")}
    </div>
    <div class="col">
      <div class="sec-title">Acteurs ciblés</div>
      ${puces(d.acteurs_liste ?? [], "/logos/leonard-puce-donut.png")}
    </div>
  </div>

  ${d.commentaires ? `<div class="card analyse"><div class="caps">Analyse Leonard</div><p>${esc(d.commentaires)}</p></div>` : ""}

  <div class="foot">
    ${d.lien_officiel ? `<a href="${esc(d.lien_officiel)}">${esc(d.lien_officiel)}</a><br>` : ""}
    Fiche générée le ${new Date().toLocaleDateString("fr-FR")} — Leonard · Veille AAP
  </div>
</div>

<script>
  window.addEventListener('load', function () {
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    Promise.all(imgs.map(function (img) {
      if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
      return new Promise(function (r) { img.onload = r; img.onerror = r; });
    })).then(function () { setTimeout(function () { window.print(); }, 250); });
  });
</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1200");
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

        {/* Diagnostic Leonard (table) + Périmètre VINCI (logos) — carte blanche */}
        <div className="mx-5 rounded-lg bg-white shadow-sm p-4 grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-5">
          <div className="min-w-0">
            <div className="label-caps text-[10px] mb-2">Diagnostic Leonard</div>
            <div className="divide-y divide-border">
              <RatingRow
                label="Difficulté de montage"
                valeur={d.difficulte}
                palette="difficulte"
              />
              <RatingRow
                label="Pertinence VINCI"
                valeur={d.pertinence_vinci}
                palette="pertinence"
              />
            </div>
          </div>
          <div className="min-w-0">
            <div className="label-caps text-[10px] mb-2 flex items-center gap-1">
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
