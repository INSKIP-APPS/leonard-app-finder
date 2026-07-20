import { useState } from "react";
import {
  X,
  Loader2,
  Zap,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { analyseAdhoc, type AnalyseAdhocResult } from "@/services/programmes";
import { Dialog } from "@/components/Dialog";

// Sources : libellé court pour l'UI.
const SOURCE_SHORT: Record<string, string> = {
  "EU Funding & Tenders (SEDIA)": "Europe (SEDIA)",
  "Aides-territoires": "Aides-territoires",
  "les-aides.fr": "les-aides.fr",
  "appelsprojetsrecherche.fr": "Recherche (ANR…)",
  "ADEME (Agir pour la transition)": "ADEME",
  Bpifrance: "Bpifrance",
  "Banque des Territoires (France 2030)": "Banque des Territoires",
  "Région Île-de-France (opendata)": "Île-de-France",
};

const SECTEURS = [
  "Énergie",
  "Construction",
  "Mobilité",
  "Numérique-IA",
  "Eau",
  "Environnement",
  "Matériaux",
  "Industrie",
];

const TYPES_ACTEUR = [
  "Grand groupe",
  "Filiale d'un grand groupe",
  "ETI",
  "PME",
  "Startup",
];

export function AnalyseExpressModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [secteurs, setSecteurs] = useState<string[]>([]);
  const [typeActeur, setTypeActeur] = useState("Grand groupe");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalyseAdhocResult[] | null>(null);
  const [nbCandidats, setNbCandidats] = useState(0);

  // A11Y-002 : confirmation avant fermeture (Échap / clic extérieur) si des
  // informations ont été saisies et qu'aucun résultat n'est encore affiché.
  const confirmClose = () =>
    results !== null ||
    (!description.trim() && secteurs.length === 0) ||
    window.confirm("Fermer l'analyse ? Les informations saisies seront perdues.");

  function toggleSecteur(s: string) {
    setSecteurs((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (description.trim().length < 40) {
      setError("Décris le projet en au moins 40 caractères pour un matching utile.");
      return;
    }
    if (secteurs.length === 0) {
      setError("Sélectionne au moins un secteur.");
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const r = await analyseAdhoc({
        description: description.trim(),
        secteurs,
        type_acteur: typeActeur,
      });
      if (!r.ok) {
        setError(r.error || "Erreur inconnue.");
      } else {
        setResults(r.resultats);
        setNbCandidats(r.aap_candidats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog
      onClose={onClose}
      labelledBy="analyse-express-titre"
      confirmClose={confirmClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      panelClassName="bg-white rounded-2xl w-full max-w-3xl my-8 shadow-2xl overflow-hidden"
    >
        {/* En-tête */}
        <div className="px-6 py-5 border-b border-border bg-gradient-to-br from-[#FFF3F6] to-[#ECE8FB] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-pink text-white flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 id="analyse-express-titre" className="text-lg font-bold text-navy tracking-tight">Analyse express</h2>
              <p className="text-xs text-muted mt-1">
                Teste rapidement un projet — même hors de ton programme — et récupère les AAP
                pertinents en 30 s. Rien n'est sauvegardé.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md border border-border bg-white/60 flex items-center justify-center text-muted hover:text-navy shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
          {/* Formulaire */}
          {!results && (
            <form onSubmit={run} className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-text mb-1.5 flex items-center justify-between">
                  <span>
                    Description du projet <span className="text-pink">*</span>
                  </span>
                  <span className="text-[10.5px] text-faint font-normal">
                    Minimum 40 caractères
                  </span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Décris l'objet du projet, son marché, sa maturité, sa cible… Plus c'est précis, meilleur est le matching."
                  className="input resize-y min-h-[120px]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-text mb-1.5 block">
                  Secteurs <span className="text-pink">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SECTEURS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => toggleSecteur(s)}
                      className={`inline-flex items-center text-[12px] font-medium px-3 py-1 rounded-full border transition ${
                        secteurs.includes(s)
                          ? "bg-navy text-white border-navy"
                          : "bg-white border-border-strong text-muted hover:border-sky hover:text-sky-ink"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-text mb-1.5 block">
                  Type d'acteur porteur <span className="text-pink">*</span>
                </label>
                <select
                  value={typeActeur}
                  onChange={(e) => setTypeActeur(e.target.value)}
                  className="input"
                >
                  {TYPES_ACTEUR.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p className="text-[10.5px] text-faint mt-1">
                  Filtre les AAP explicitement réservés à un autre type d'acteur.
                </p>
              </div>

              {error && (
                <div className="text-xs text-orange-700 bg-[#FFF4E6] px-3 py-2 rounded flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-md text-sm font-medium text-muted hover:text-text"
                  disabled={running}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={running}
                  className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  {running ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyse en cours…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Lancer l'analyse
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Résultats */}
          {results && (
            <div>
              <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-[#FBFBFD]">
                <div>
                  <div className="text-sm font-semibold text-navy">
                    {results.filter((r) => r.pertinent).length} AAP pertinents
                    <span className="text-muted font-normal ml-1">
                      / {nbCandidats} candidats analysés
                    </span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    Prioritaires (≥80) puis à étudier (60-79). Écartés visibles en dessous.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResults(null);
                    setError(null);
                  }}
                  className="text-xs font-semibold text-sky-ink hover:text-navy"
                >
                  ← Nouvelle analyse
                </button>
              </div>

              {results.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted">
                  {nbCandidats > 0
                    ? `${nbCandidats} candidat${nbCandidats > 1 ? "s" : ""} analysé${nbCandidats > 1 ? "s" : ""}, mais aucun n'a été jugé pertinent pour ce projet. Essaie d'élargir les secteurs ou de préciser la description.`
                    : "Aucun AAP candidat après présélection. Précise la description ou les secteurs."}
                </div>
              ) : (
                <>
                  {results
                    .filter((r) => r.pertinent)
                    .map((r) => (
                      <ResultRow key={r.id} r={r} />
                    ))}
                  {results.some((r) => !r.pertinent) && (
                    <div className="px-6 py-2 bg-bg border-b border-border">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted">
                        Écartés ({results.filter((r) => !r.pertinent).length})
                      </div>
                    </div>
                  )}
                  {results
                    .filter((r) => !r.pertinent)
                    .slice(0, 15)
                    .map((r) => (
                      <ResultRow key={r.id} r={r} />
                    ))}
                </>
              )}
            </div>
          )}
        </div>
    </Dialog>
  );
}

function ResultRow({ r }: { r: AnalyseAdhocResult }) {
  const jours = r.date_cloture
    ? Math.ceil((new Date(r.date_cloture).getTime() - Date.now()) / 86400000)
    : null;
  const scoreColor =
    r.score >= 80 ? "bg-emerald-500" : r.score >= 60 ? "bg-amber-500" : "bg-muted";

  return (
    <div className="grid grid-cols-[46px_1fr] gap-3 items-start px-6 py-3.5 border-b border-border">
      <div
        className={`w-11 h-11 rounded-lg flex items-center justify-center text-white font-bold text-sm tabular-nums ${scoreColor}`}
      >
        {r.score}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-navy leading-snug">{r.titre}</div>
        {(r.tier === "prioritaire" || !r.pertinent) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {r.tier === "prioritaire" && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-emerald-100 text-emerald-700">
                Prioritaire
              </span>
            )}
            {!r.pertinent && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-bg border border-border text-muted">
                Écarté
              </span>
            )}
          </div>
        )}
        <div className="text-[11px] text-muted flex items-center gap-2 flex-wrap mb-1.5 mt-1">
          <span className="font-medium">{SOURCE_SHORT[r.source] ?? r.source}</span>
          {jours !== null && jours >= 0 && (
            <span className={jours < 30 ? "text-pink font-semibold" : ""}>· J-{jours}</span>
          )}
        </div>
        {r.raison && r.pertinent && (
          <div className="text-xs text-text leading-relaxed flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>{r.raison}</span>
          </div>
        )}
        {r.motif_ecart && !r.pertinent && (
          <div className="text-xs text-muted italic leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
            <span>{r.motif_ecart}</span>
          </div>
        )}
      </div>
    </div>
  );
}
