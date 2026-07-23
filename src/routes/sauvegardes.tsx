import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bookmark, Download, FileText, Layers, Search } from "lucide-react";
import { getAaps, getDispositifs } from "@/services/data-store";
import type { AAP } from "@/types/aap";
import type { Dispositif } from "@/types/dispositif";
import { aapEchelle } from "@/utils/echelle";
import { statutEffectif } from "@/utils/scoring-engine";
import { fmtDate, budgetCompact, STATUT_AAP_LABEL } from "@/utils/format";
import { useSavedIds, useSavedDispositifIds, toggleSaved, toggleSavedDispositif } from "@/utils/savedAaps";
import { FicheAap } from "@/components/FicheAap";
import { FicheDispositif } from "@/components/FicheDispositif";
import { QueryError } from "@/components/QueryError";
import { geoBadge } from "@/components/explorer/badges";

export const Route = createFileRoute("/sauvegardes")({
  head: () => ({
    meta: [
      { title: "Sauvegardés — Leonard Veille AAP" },
      { name: "description", content: "Vos AAP et dispositifs sauvegardés." },
    ],
  }),
  component: Sauvegardes,
});

type Onglet = "aap" | "dispositifs";
type SortBy = "cloture" | "recent" | "alpha";

/** Jours restants avant clôture (négatif si passée), null sans date. */
function joursRestants(dateCloture: string | null): number | null {
  if (!dateCloture) return null;
  return Math.ceil((new Date(dateCloture).getTime() - Date.now()) / 86_400_000);
}

function csvCell(v: string | number | null): string {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, headers: string[], lines: (string | number | null)[][]) {
  // BOM UTF-8 pour qu'Excel lise correctement les accents.
  const csv =
    "﻿" +
    [headers.map(csvCell).join(";"), ...lines.map((l) => l.map(csvCell).join(";"))].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Sauvegardes() {
  const {
    data: aaps = [],
    isLoading: loadingA,
    isError: errorA,
    refetch: refetchA,
  } = useQuery({ queryKey: ["aaps"], queryFn: () => getAaps() });
  const {
    data: dispositifs = [],
    isLoading: loadingD,
    isError: errorD,
    refetch: refetchD,
  } = useQuery({ queryKey: ["dispositifs"], queryFn: getDispositifs });

  const savedAapIds = useSavedIds();
  const savedDispositifIds = useSavedDispositifIds();

  const [onglet, setOnglet] = useState<Onglet>("aap");
  const [sortBy, setSortBy] = useState<SortBy>("cloture");
  const [selectedAap, setSelectedAap] = useState<AAP | null>(null);
  const [selectedDispositif, setSelectedDispositif] = useState<Dispositif | null>(null);

  // Les ids sauvegardés sont en ordre d'ajout : « Ajout récent » = ordre inversé.
  const savedAaps = useMemo(() => {
    const byId = new Map(aaps.map((a) => [a.id, a]));
    const list = savedAapIds.map((id) => byId.get(id)).filter((a): a is AAP => Boolean(a));
    const byCloture = (a: AAP) =>
      a.date_cloture ? new Date(a.date_cloture).getTime() : Number.POSITIVE_INFINITY;
    if (sortBy === "recent") return [...list].reverse();
    if (sortBy === "alpha")
      return [...list].sort((a, b) => a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" }));
    // Clôture la plus proche d'abord ; clôturés et sans date en fin de liste.
    return [...list].sort((a, b) => {
      const ca = statutEffectif(a) === "closed" ? Number.POSITIVE_INFINITY - 1 : byCloture(a);
      const cb = statutEffectif(b) === "closed" ? Number.POSITIVE_INFINITY - 1 : byCloture(b);
      return ca - cb;
    });
  }, [aaps, savedAapIds, sortBy]);

  const savedDispositifs = useMemo(() => {
    const byId = new Map(dispositifs.map((d) => [d.id, d]));
    const list = savedDispositifIds
      .map((id) => byId.get(id))
      .filter((d): d is Dispositif => Boolean(d));
    if (sortBy === "recent") return [...list].reverse();
    return [...list].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
  }, [dispositifs, savedDispositifIds, sortBy]);

  const loading = onglet === "aap" ? loadingA : loadingD;
  const hasError = onglet === "aap" ? errorA : errorD;

  const exporterCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (onglet === "aap") {
      downloadCsv(
        `sauvegardes-aap-${stamp}.csv`,
        ["Titre", "Source", "Programme", "Échelle", "Statut", "Clôture", "Budget", "Lien"],
        savedAaps.map((a) => [
          a.titre,
          a.source,
          a.programme,
          aapEchelle(a),
          STATUT_AAP_LABEL[statutEffectif(a)],
          a.date_cloture ? fmtDate(a.date_cloture) : "Sans échéance",
          budgetCompact(a),
          a.lien_officiel,
        ]),
      );
    } else {
      downloadCsv(
        `sauvegardes-dispositifs-${stamp}.csv`,
        ["Nom", "Organisme", "Programme", "Échelle", "Statut", "Lien"],
        savedDispositifs.map((d) => [
          d.nom,
          d.organisme,
          d.programme,
          d.echelle,
          d.statut_ouverture,
          d.lien_officiel,
        ]),
      );
    }
  };

  if (hasError) {
    return (
      <QueryError
        title="Impossible de charger vos sauvegardes."
        hint="Vérifiez votre connexion, puis réessayez."
        onRetry={() => {
          refetchA();
          refetchD();
        }}
        className="max-w-[1100px] mx-auto flex flex-col items-center justify-center py-32 text-center gap-3"
      />
    );
  }

  const nbVisible = onglet === "aap" ? savedAaps.length : savedDispositifs.length;

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Sauvegardés</h1>
          <p className="text-sm text-muted mt-1">
            Vos AAP et dispositifs mis de côté, sur tous vos postes
          </p>
        </div>
        {!loading && (
          <span className="text-xs text-muted whitespace-nowrap">
            {savedAapIds.length} AAP · {savedDispositifIds.length} dispositif
            {savedDispositifIds.length > 1 ? "s" : ""}
          </span>
        )}
      </header>

      {/* Onglets + outils */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center rounded-lg border border-border bg-white p-1">
          <button
            onClick={() => setOnglet("aap")}
            aria-pressed={onglet === "aap"}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
              onglet === "aap" ? "bg-navy text-white" : "text-text hover:text-navy"
            }`}
          >
            <FileText className="w-4 h-4" />
            Appels à projets
            <span className={`text-xs ${onglet === "aap" ? "text-white/70" : "text-muted"}`}>
              {savedAapIds.length}
            </span>
          </button>
          <button
            onClick={() => setOnglet("dispositifs")}
            aria-pressed={onglet === "dispositifs"}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
              onglet === "dispositifs" ? "bg-navy text-white" : "text-text hover:text-navy"
            }`}
          >
            <Layers className="w-4 h-4" />
            Dispositifs
            <span
              className={`text-xs ${onglet === "dispositifs" ? "text-white/70" : "text-muted"}`}
            >
              {savedDispositifIds.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={onglet === "aap" ? sortBy : sortBy === "cloture" ? "alpha" : sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label="Trier les sauvegardes"
            className="h-8 rounded-md border border-border bg-white text-xs font-medium text-text px-2 focus:outline-none focus:border-navy"
          >
            {onglet === "aap" && <option value="cloture">Clôture la plus proche</option>}
            <option value="recent">Ajout récent</option>
            <option value="alpha">Alphabétique</option>
          </select>
          {nbVisible > 0 && (
            <button
              onClick={exporterCsv}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-white text-xs font-medium text-navy hover:border-navy transition"
            >
              <Download className="w-3.5 h-3.5" />
              Exporter CSV
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted italic text-center py-8">Chargement des données…</div>
      )}

      {/* === AAP sauvegardés === */}
      {!loading && onglet === "aap" && (
        <div className="space-y-3">
          {savedAaps.map((a) => (
            <SavedAapRow key={a.id} a={a} onOpen={setSelectedAap} />
          ))}
          {savedAaps.length === 0 && <EmptySaved type="aap" />}
        </div>
      )}

      {/* === Dispositifs sauvegardés === */}
      {!loading && onglet === "dispositifs" && (
        <div className="space-y-3">
          {savedDispositifs.map((d) => (
            <SavedDispositifRow key={d.id} d={d} onOpen={setSelectedDispositif} />
          ))}
          {savedDispositifs.length === 0 && <EmptySaved type="dispositif" />}
        </div>
      )}

      <FicheAap aap={selectedAap} onClose={() => setSelectedAap(null)} />
      <FicheDispositif dispositif={selectedDispositif} onClose={() => setSelectedDispositif(null)} />
    </div>
  );
}

// ── Lignes ────────────────────────────────────────────────────────────

function SavedAapRow({ a, onOpen }: { a: AAP; onOpen: (a: AAP) => void }) {
  const statut = statutEffectif(a);
  const clos = statut === "closed";
  const j = joursRestants(a.date_cloture);

  return (
    <div className={`card-flat p-4 flex gap-4 items-start ${clos ? "opacity-60" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-muted">
          {a.source}
        </div>
        <button
          type="button"
          onClick={() => onOpen(a)}
          className="font-semibold text-navy text-sm mt-0.5 text-left hover:underline"
        >
          {a.titre}
        </button>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {geoBadge(aapEchelle(a))}
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              statut === "open"
                ? "bg-[#ECFDF5] text-emerald-700"
                : clos
                  ? "bg-muted text-text"
                  : "bg-[#E6F1FB] text-navy"
            }`}
          >
            {STATUT_AAP_LABEL[statut]}
          </span>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#F3E8FF] text-purple">
            {a.type_action}
          </span>
          {!clos && j !== null && j >= 0 && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                j <= 30 ? "bg-pink/10 text-pink font-bold" : "bg-[#EEF2FF] text-navy"
              }`}
            >
              Clôture J-{j}
            </span>
          )}
          {!clos && a.date_cloture === null && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-text">
              Au fil de l'eau
            </span>
          )}
        </div>
        {clos && (
          <div className="text-xs text-muted mt-2">
            Cet appel est désormais clôturé, vous pouvez le retirer de vos sauvegardes.
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0 text-right">
        <div
          className={`text-xs font-semibold ${
            clos || j === null ? "text-muted font-medium" : j <= 30 ? "text-pink" : "text-emerald-700"
          }`}
        >
          {a.date_cloture ? fmtDate(a.date_cloture) : "Sans échéance"}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => toggleSaved(a.id)}
            className="px-3 py-1.5 rounded-md border border-pink/30 bg-pink/5 text-xs font-semibold text-pink hover:bg-pink/10 transition"
          >
            Retirer
          </button>
          <button
            onClick={() => onOpen(a)}
            className="px-3 py-1.5 rounded-md bg-navy text-xs font-semibold text-white hover:opacity-90 transition"
          >
            Voir la fiche
          </button>
        </div>
      </div>
    </div>
  );
}

function SavedDispositifRow({ d, onOpen }: { d: Dispositif; onOpen: (d: Dispositif) => void }) {
  const ferme = d.statut_ouverture === "Fermé";
  return (
    <div className={`card-flat p-4 flex gap-4 items-start ${ferme ? "opacity-60" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-muted">
          {d.organisme}
        </div>
        <button
          type="button"
          onClick={() => onOpen(d)}
          className="font-semibold text-navy text-sm mt-0.5 text-left hover:underline"
        >
          {d.nom}
        </button>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {geoBadge(d.echelle)}
          {d.statut_ouverture && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                d.statut_ouverture === "Ouvert"
                  ? "bg-[#ECFDF5] text-emerald-700"
                  : ferme
                    ? "bg-muted text-text"
                    : "bg-[#FFF4E6] text-orange-700"
              }`}
            >
              {d.statut_ouverture}
            </span>
          )}
          {d.type_financement && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-navy">
              {d.type_financement}
            </span>
          )}
          {d.montant && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-text">
              {d.montant}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={() => toggleSavedDispositif(d.id)}
          className="px-3 py-1.5 rounded-md border border-pink/30 bg-pink/5 text-xs font-semibold text-pink hover:bg-pink/10 transition"
        >
          Retirer
        </button>
        <button
          onClick={() => onOpen(d)}
          className="px-3 py-1.5 rounded-md bg-navy text-xs font-semibold text-white hover:opacity-90 transition"
        >
          Voir la fiche
        </button>
      </div>
    </div>
  );
}

/** État vide : renvoie vers l'Explorer, où se font les sauvegardes. */
function EmptySaved({ type }: { type: "aap" | "dispositif" }) {
  return (
    <div className="card-flat py-14 flex flex-col items-center gap-3 text-center">
      <Bookmark className="w-8 h-8 text-muted" />
      <div className="text-sm text-muted">
        {type === "aap"
          ? "Aucun AAP sauvegardé pour l'instant."
          : "Aucun dispositif sauvegardé pour l'instant."}
        <br />
        Utilisez le bouton « Sauvegarder » d'une fiche pour la retrouver ici.
      </div>
      <Link
        to="/explorer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-navy text-sm font-medium text-white hover:opacity-90 transition"
      >
        <Search className="w-4 h-4" />
        Ouvrir l'Explorer
      </Link>
    </div>
  );
}
