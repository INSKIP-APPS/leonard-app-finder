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
import { trlLabel, escapeHtml as esc, safeHttpUrl } from "@/utils/format";
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
 * Fenêtre imprimable « standing VINCI » : bandeau navy avec logo Leonard,
 * gros titre éditorial, badges outlined, sections séparées par filets fins,
 * section titles avec pipe cyan, tableau diagnostic élégant, Analyse en
 * highlight card, footer navy avec cyan accent.
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
          `<img src="${origin}${icon}" alt="" style="width:17px;height:17px;object-fit:contain;${i > lvl ? "opacity:.2;" : ""}">`,
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
    `<div class="info-line"><div class="caps-muted">${esc(label)}</div><div class="v">${esc(value)}</div></div>`;

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

  const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8">
<title>${esc(d.nom)} — Fiche dispositif</title>
<style>
  @page { size: A4; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a2b4a; background: #fff; margin: 0; padding: 0; line-height: 1.5; font-size: 12px; }

  /* Header navy band */
  .hdr-band { background: #1a2b4a; color: #fff; padding: 12mm 15mm 10mm; position: relative; }
  .hdr-band::after { content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #0FAFEE; }
  .brand-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9mm; }
  .logo-wrap { background: #fff; padding: 2.5mm 3.5mm; border-radius: 4px; display: inline-flex; align-items: center; }
  .logo-wrap img { height: 6.5mm; display: block; }
  .doc-type { text-align: right; }
  .doc-type .label { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.55); font-weight: 500; margin-bottom: 1mm; }
  .doc-type .value { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #fff; font-weight: 700; }
  .org-caps { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #0FAFEE; font-weight: 700; margin-bottom: 3mm; }
  .hdr-band h1 { font-size: 22px; font-weight: 700; line-height: 1.25; margin: 0 0 3mm; letter-spacing: -0.01em; max-width: 90%; }
  .prog { font-size: 12px; color: rgba(255,255,255,.75); margin-bottom: 5mm; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; }
  .badge { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.28); color: #fff; font-size: 10px; font-weight: 500; padding: 3px 10px; border-radius: 999px; letter-spacing: .04em; }

  /* Content */
  .body { padding: 10mm 15mm 12mm; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
  .row2-diag { display: grid; grid-template-columns: 1fr 250px; gap: 10mm; align-items: start; }

  /* Section title avec pipe cyan */
  .sec { margin-bottom: 8mm; }
  .sec-title { display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #1a2b4a; font-weight: 700; margin-bottom: 4mm; }
  .sec-title::before { content: ""; width: 3px; height: 12px; background: #0FAFEE; display: inline-block; border-radius: 2px; }

  /* Diagnostic — inline compact */
  .rrow { display: flex; align-items: center; gap: 20px; padding: 9px 0; flex-wrap: wrap; }
  .rrow + .rrow { border-top: 1px solid #e7ebf3; }
  .rrow-name { font-size: 13px; font-weight: 600; color: #1a2b4a; flex-shrink: 0; }
  .rrow-marks { display: inline-flex; gap: 5px; flex-shrink: 0; }
  .rrow-val { font-size: 13px; font-weight: 500; color: #1a2b4a; letter-spacing: .01em; flex-shrink: 0; }

  /* Périmètre VINCI tuiles plus subtiles */
  .bus { display: flex; flex-wrap: wrap; gap: 6px; max-width: 250px; }
  .tile { display: inline-flex; align-items: center; justify-content: center; width: 120px; height: 42px; padding: 0 8px; border-radius: 4px; border: 1px solid #edf0f5; background: #fff; }
  .tile img { max-height: 28px; max-width: 100px; object-fit: contain; }

  /* Info line */
  .info-line { margin-bottom: 4mm; }
  .caps-muted { font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: #6b7a99; font-weight: 600; margin-bottom: 1mm; }
  .info-line .v { font-size: 13px; font-weight: 500; color: #1a2b4a; word-break: break-word; }

  /* Puces */
  ul.puces { list-style: none; margin: 0; padding: 0; }
  ul.puces li { display: flex; align-items: flex-start; gap: 10px; font-size: 12.5px; margin-bottom: 6px; color: #1a2b4a; page-break-inside: avoid; }
  ul.puces li img { width: 12px; height: 12px; flex-shrink: 0; margin-top: 3px; object-fit: contain; }
  ul.puces li span { flex: 1; word-break: break-word; line-height: 1.5; }
  .empty { font-size: 12px; color: #6b7a99; font-style: italic; }

  /* Analyse Leonard highlighted */
  .analyse { background: #EAF3FC; border-left: 3px solid #0FAFEE; padding: 5mm 6mm; border-radius: 0 4px 4px 0; page-break-inside: avoid; }
  .analyse .caps-cyan { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #0FAFEE; font-weight: 700; margin-bottom: 2mm; }
  .analyse p { font-size: 12.5px; margin: 0; line-height: 1.55; color: #1a2b4a; white-space: pre-wrap; word-break: break-word; }

  /* Divider softer */
  .divider { height: 1px; background: #eef1f5; margin: 5mm 0; }

  /* Footer band navy */
  .foot-band { background: #1a2b4a; color: rgba(255,255,255,.85); padding: 6mm 15mm; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 10px; letter-spacing: .04em; position: relative; }
  .foot-band::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #0FAFEE; }
  .foot-band a { color: #0FAFEE; text-decoration: none; word-break: break-all; font-weight: 500; }
  .foot-band .brand-foot { font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.65); flex-shrink: 0; }
  .foot-band .brand-foot strong { color: #fff; font-weight: 700; }

  @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  }
</style>
</head>
<body>

  <div class="hdr-band">
    <div class="brand-row">
      <div class="logo-wrap"><img src="${origin}/logos/leonard-brand.png" alt="Leonard"></div>
      <div class="doc-type">
        <div class="label">Leonard · Veille AAP</div>
        <div class="value">Fiche dispositif</div>
      </div>
    </div>
    <div class="org-caps">${esc(d.organisme)}</div>
    <h1>${esc(d.nom)}</h1>
    ${d.programme ? `<div class="prog">${esc(d.programme)}</div>` : ""}
    <div class="badges">${badges}</div>
  </div>

  <div class="body">

    <div class="row2-diag">
      <div class="sec">
        <div class="sec-title">Diagnostic Leonard</div>
        ${ratingRow("Difficulté de montage", d.difficulte, "/logos/vinci-mark.png")}
        ${ratingRow("Pertinence VINCI", d.pertinence_vinci, "/logos/leonard-mark.png")}
      </div>
      <div class="sec">
        <div class="sec-title">Périmètre VINCI</div>
        <div class="bus">${buTiles}</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="row2">
      <div class="sec">
        <div class="sec-title">Périmètre &amp; nature</div>
        ${infoLine("Organisme", d.organisme)}
        ${infoLine("Échelle", d.echelle)}
        ${infoLine("Statut", d.statut_ouverture ?? "—")}
      </div>
      <div class="sec">
        <div class="sec-title">Financement</div>
        ${infoLine("Type", d.type_financement ?? "—")}
        ${infoLine("Montant", d.montant ?? "—")}
        ${infoLine("Taux max", d.taux_max ?? "—")}
        ${infoLine("Maturité (TRL)", trl ?? "—")}
      </div>
    </div>

    <div class="divider"></div>

    <div class="sec">
      <div class="sec-title">Critères &amp; modalités</div>
      ${puces(Array.from(new Set(modalites)), "/logos/leonard-puce-croix.png")}
    </div>

    <div class="divider"></div>

    <div class="row2">
      <div class="sec">
        <div class="sec-title">Thématiques ciblées</div>
        ${puces(Array.from(new Set(d.thematiques_liste ?? [])), "/logos/leonard-puce-croix.png")}
      </div>
      <div class="sec">
        <div class="sec-title">Acteurs ciblés</div>
        ${puces(Array.from(new Set(d.acteurs_liste ?? [])), "/logos/leonard-puce-donut.png")}
      </div>
    </div>

    ${
      d.commentaires
        ? `<div class="divider"></div>
    <div class="analyse">
      <div class="caps-cyan">Analyse Leonard</div>
      <p>${esc(d.commentaires)}</p>
    </div>`
        : ""
    }

  </div>

  <div class="foot-band">
    <div>${safeHttpUrl(d.lien_officiel) ? `<a href="${esc(safeHttpUrl(d.lien_officiel))}">${esc(safeHttpUrl(d.lien_officiel))}</a>` : ""}</div>
    <div class="brand-foot"><strong>Leonard</strong> · Veille AAP · ${new Date().toLocaleDateString("fr-FR")}</div>
  </div>

<script>
  window.addEventListener('load', function () {
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    Promise.all(imgs.map(function (img) {
      if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
      return new Promise(function (r) { img.onload = r; img.onerror = r; });
    })).then(function () { setTimeout(function () { window.print(); }, 300); });
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
              <Puces items={Array.from(new Set(modalites))} />
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
            <Puces items={Array.from(new Set(d.thematiques_liste ?? []))} />
          </div>
          <div className="min-w-0">
            <SectionTitle icon={<Users className="w-3.5 h-3.5" />}>Acteurs ciblés</SectionTitle>
            <PucesLosange items={Array.from(new Set(d.acteurs_liste ?? []))} />
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
            {safeHttpUrl(d.lien_officiel) && (
              <a
                href={safeHttpUrl(d.lien_officiel)}
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
