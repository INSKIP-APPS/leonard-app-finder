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
import { RatingRow, SectionTitle, InfoLine, Puces } from "@/components/fiche/partials";

// ──────────────────────────────────────────────────────────────────────
// Fiche détaillée d'un APPEL À PROJETS (modale), sur la même mise en forme
// que la fiche dispositif : niveaux 3 points (difficulté de candidature),
// sections structurées, puces, export PDF et lien officiel.
// ──────────────────────────────────────────────────────────────────────

/**
 * Fenêtre imprimable « standing VINCI » pour un appel à projets : mêmes
 * codes que la fiche dispositif (bandeau navy avec logo Leonard, gros
 * titre, badges outline, sections pipe cyan, description en highlight
 * card, footer navy) — contenu spécifique AAP.
 */
function exporterPdf(a: AAP) {
  const origin = window.location.origin;
  const jr = joursRestants(a.date_cloture);
  const diff = difficulteCandidature(a);
  const trl = trlLabel(a.trl_min, a.trl_max);
  const echelle = aapEchelle(a);
  const statut = statutEffectif(a);

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

  const badges = [
    echelle,
    STATUT_AAP_LABEL[statut] ?? a.statut,
    a.type_action,
    trl,
  ]
    .filter(Boolean)
    .map((b) => `<span class="badge">${esc(b as string)}</span>`)
    .join("");

  const clotureText = a.date_cloture
    ? `${fmtDateLongue(a.date_cloture)}${jr != null && jr >= 0 ? ` (J-${jr})` : ""}`
    : "Non précisée";

  const pointsVigilance = diff.points.slice(0, 3);
  const warnIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;color:#F59E0B"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
  const pointsBloc = pointsVigilance.length
    ? `<div class="warn-panel"><div class="warn-lab">${warnIcon.replace('width="13" height="13"', 'width="12" height="12"')}<span>Points de vigilance</span></div><ul>${pointsVigilance
        .map(
          (p) =>
            `<li>${warnIcon}<span>${esc(p)}</span></li>`,
        )
        .join("")}</ul></div>`
    : "";

  const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8">
<title>${esc(a.titre)} — Fiche appel à projets</title>
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
  .src-caps { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #0FAFEE; font-weight: 700; margin-bottom: 3mm; }
  .hdr-band h1 { font-size: 22px; font-weight: 700; line-height: 1.25; margin: 0 0 3mm; letter-spacing: -0.01em; max-width: 90%; }
  .prog { font-size: 12px; color: rgba(255,255,255,.75); margin-bottom: 5mm; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; }
  .badge { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.28); color: #fff; font-size: 10px; font-weight: 500; padding: 3px 10px; border-radius: 999px; letter-spacing: .04em; }

  /* Content */
  .body { padding: 10mm 15mm 12mm; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
  .row2-diag { display: grid; grid-template-columns: 1fr 280px; gap: 10mm; align-items: start; }

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

  /* Points de vigilance — panel amber façon Analyse Leonard */
  .warn-panel { background: #FFFBEB; border-left: 3px solid #F59E0B; border-radius: 0 4px 4px 0; padding: 4mm 5mm; }
  .warn-panel .warn-lab { display: flex; align-items: center; gap: 5px; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #B45309; font-weight: 700; margin-bottom: 3mm; }
  .warn-panel .warn-lab svg { flex-shrink: 0; color: #F59E0B; }
  .warn-panel ul { list-style: none; margin: 0; padding: 0; }
  .warn-panel li { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; margin-bottom: 5px; color: #7C2D12; page-break-inside: avoid; }
  .warn-panel li:last-child { margin-bottom: 0; }
  .warn-panel li span { flex: 1; word-break: break-word; line-height: 1.5; }

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

  /* Description highlighted */
  .desc-card { background: #EAF3FC; border-left: 3px solid #0FAFEE; padding: 5mm 6mm; border-radius: 0 4px 4px 0; page-break-inside: avoid; }
  .desc-card .caps-cyan { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #0FAFEE; font-weight: 700; margin-bottom: 2mm; }
  .desc-card p { font-size: 12.5px; margin: 0; line-height: 1.55; color: #1a2b4a; white-space: pre-wrap; word-break: break-word; }

  /* Divider */
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
        <div class="value">Fiche appel à projets</div>
      </div>
    </div>
    <div class="src-caps">${esc(a.source)}</div>
    <h1>${esc(a.titre)}</h1>
    ${a.programme ? `<div class="prog">${esc(a.programme)}${a.cluster ? " · " + esc(a.cluster) : ""}</div>` : ""}
    <div class="badges">${badges}</div>
  </div>

  <div class="body">

    <div class="${pointsVigilance.length ? "row2-diag" : ""}">
      <div class="sec">
        <div class="sec-title">Diagnostic Leonard</div>
        ${ratingRow("Difficulté de candidature", diff.niveau, "/logos/vinci-mark.png")}
      </div>
      ${pointsVigilance.length ? `<div class="sec">${pointsBloc}</div>` : ""}
    </div>

    <div class="divider"></div>

    <div class="row2">
      <div class="sec">
        <div class="sec-title">Périmètre &amp; nature</div>
        ${infoLine("Source", a.source)}
        ${infoLine("Échelle", echelle)}
        ${infoLine("Statut", STATUT_AAP_LABEL[statut] ?? a.statut)}
        ${infoLine("Type d'action", a.type_action_detail || a.type_action || "Non précisé")}
      </div>
      <div class="sec">
        <div class="sec-title">Financement &amp; calendrier</div>
        ${infoLine("Montant", montantAffiche(a))}
        ${infoLine("Ouverture", a.date_ouverture ? fmtDateLongue(a.date_ouverture) : "Non précisée")}
        ${infoLine("Clôture", clotureText)}
        ${infoLine("Maturité (TRL)", trl ?? "Non précisé")}
      </div>
    </div>

    <div class="divider"></div>

    <div class="row2">
      <div class="sec">
        <div class="sec-title">Acteurs éligibles</div>
        ${puces((a.acteurs_eligibles ?? []).slice(0, 12), "/logos/leonard-puce-donut.png")}
      </div>
      <div class="sec">
        <div class="sec-title">Thématiques</div>
        ${puces(a.thematiques ?? [], "/logos/leonard-puce-croix.png")}
      </div>
    </div>

    ${
      a.sources_multiples && a.sources_multiples.length > 0
        ? `<div class="divider"></div>
    <div class="sec">
      <div class="sec-title">Aussi référencé sur</div>
      ${puces(a.sources_multiples, "/logos/leonard-puce-croix.png")}
    </div>`
        : ""
    }

    ${
      a.description
        ? `<div class="divider"></div>
    <div class="desc-card">
      <div class="caps-cyan">Description</div>
      <p>${esc(a.description)}</p>
    </div>`
        : ""
    }

  </div>

  <div class="foot-band">
    <div><a href="${esc(a.lien_officiel)}">${esc(a.lien_officiel)}</a></div>
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
        className="bg-[#EAF3FC] rounded-xl w-full max-w-5xl my-8 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête (fond bleu très pâle) */}
        <div className="flex items-start justify-between gap-4 p-5 rounded-t-xl">
          <div className="min-w-0 flex-1">
            <div className="label-caps text-[10px] mb-1 break-words">{aap.source}</div>
            <h2 className="text-lg font-bold text-navy leading-snug break-words">{aap.titre}</h2>
            <div className="text-sm text-muted mt-1 break-words">
              {aap.programme}
              {aap.cluster ? ` · ${aap.cluster}` : ""}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge tone="sky">{echelle}</Badge>
              <Badge tone={statut === "closed" ? "pink" : "emerald"}>
                {STATUT_AAP_LABEL[statut] ?? statut}
              </Badge>
              <Badge tone="sky">{aap.type_action}</Badge>
              {trl && <Badge tone="sky">{trl}</Badge>}
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

        {/* Diagnostic Leonard (table) + Points de vigilance (panel amber) — carte blanche */}
        <div
          className={`mx-5 rounded-lg bg-white shadow-sm p-4 grid grid-cols-1 gap-5 ${
            diff.points.length > 0 ? "lg:grid-cols-[1fr_300px]" : ""
          }`}
        >
          <div className="min-w-0">
            <div className="label-caps text-[10px] mb-2">Diagnostic Leonard</div>
            <div className="divide-y divide-border">
              <RatingRow
                label="Difficulté de candidature"
                valeur={diff.niveau}
                palette="difficulte"
              />
            </div>
          </div>
          {diff.points.length > 0 && (
            <div className="min-w-0 rounded-md bg-amber-50 border-l-[3px] border-amber-500 px-3.5 py-3">
              <div className="text-[10px] tracking-[.08em] uppercase font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Points de vigilance
              </div>
              <ul className="space-y-1.5">
                {diff.points.slice(0, 3).map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2 text-[13px] text-amber-900 min-w-0"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-[3px]" />
                    <span className="flex-1 min-w-0 break-words leading-snug">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 3 colonnes : périmètre · financement · acteurs — fond bleu pâle */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 px-5 py-5">
          <div className="space-y-3 min-w-0">
            <SectionTitle>Périmètre &amp; nature</SectionTitle>
            <InfoLine label="Source" value={aap.source} />
            <InfoLine label="Échelle" value={echelle} />
            <InfoLine label="Statut" value={STATUT_AAP_LABEL[statut] ?? statut} />
            <InfoLine
              label="Type d'action"
              value={aap.type_action_detail || aap.type_action || "Non précisé"}
            />
          </div>
          <div className="space-y-3 min-w-0">
            <SectionTitle icon={<Coins className="w-3.5 h-3.5" />}>
              Financement &amp; calendrier
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
          <div className="min-w-0">
            <SectionTitle icon={<Users className="w-3.5 h-3.5" />}>Acteurs éligibles</SectionTitle>
            {(aap.acteurs_eligibles ?? []).length > 0 ? (
              <Puces items={(aap.acteurs_eligibles ?? []).slice(0, 8)} />
            ) : (
              <div className="text-sm text-muted italic">Non précisé.</div>
            )}
          </div>
        </div>

        {/* Thématiques · Aussi référencé */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 pb-5">
          <div className="min-w-0">
            <SectionTitle icon={<Layers className="w-3.5 h-3.5" />}>Thématiques</SectionTitle>
            {(aap.thematiques ?? []).length > 0 ? (
              <Puces items={aap.thematiques} />
            ) : (
              <div className="text-sm text-muted italic">Non précisé.</div>
            )}
          </div>
          <div className="min-w-0">
            {aap.sources_multiples && aap.sources_multiples.length > 0 && (
              <>
                <SectionTitle>Aussi référencé sur</SectionTitle>
                <Puces items={aap.sources_multiples} />
              </>
            )}
          </div>
        </div>

        {/* Description — carte blanche détachée sur fond bleu pâle */}
        {aap.description && (
          <div className="mx-5 mb-5 rounded-lg bg-white shadow-sm p-4">
            <div className="label-caps text-[10px] mb-1">Description</div>
            <p className="text-sm text-text whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
              {aap.description}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 p-5 border-t border-sky/15 bg-white rounded-b-xl">
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
