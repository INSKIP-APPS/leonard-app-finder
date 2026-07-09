import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Sparkles, Loader2, SearchX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAaps, saveMatchingRequest } from "@/services/data-store";
import type { AAP } from "@/types/aap";
import type { ProjetInput } from "@/utils/scoring-engine";
import { preselectionner, type Preselection, type Candidat } from "@/utils/preselection";
import { jugerCandidats, type JugementResult } from "@/services/claude-judge";
import { FicheAap } from "@/components/FicheAap";
import { VerdictCard } from "@/components/matching/VerdictCard";
import {
  Stepper,
  Block,
  Field,
  TextInput,
  Select,
  MultiSelect,
} from "@/components/matching/FormFields";
import {
  POLES,
  TYPES_ACTEUR,
  TYPES_PROJET,
  SECTEURS,
  TRLS,
  REGIONS_FR,
  PARTENAIRES,
} from "@/components/matching/constants";
import { fmtDate } from "@/utils/format";

export const Route = createFileRoute("/matching")({
  head: () => ({
    meta: [
      { title: "Matching à la demande — Leonard Veille AAP" },
      {
        name: "description",
        content:
          "Trouvez les Appels à Projets compatibles avec votre projet d'innovation : profil porteur, TRL, secteur, géographie.",
      },
    ],
  }),
  component: Matching,
});

function Matching() {
  const [step, setStep] = useState<"form" | "results">("form");
  const [selectedAap, setSelectedAap] = useState<AAP | null>(null);

  // Informations générales
  const [nomProjet, setNomProjet] = useState("");
  const [description, setDescription] = useState("");

  // Profil porteur
  const [pole, setPole] = useState("");
  const [typeActeur, setTypeActeur] = useState("");
  const [entitePorteuse, setEntitePorteuse] = useState("");

  // Nature du projet
  const [typesProjet, setTypesProjet] = useState<string[]>([]);
  const [secteursSel, setSecteursSel] = useState<string[]>([]);
  const [trl, setTrl] = useState("");
  const [region, setRegion] = useState("");

  // Complémentaires
  const [budget, setBudget] = useState("");
  const [financement, setFinancement] = useState("");
  const [partenaires, setPartenaires] = useState<string[]>([]);
  const [dateDeploiement, setDateDeploiement] = useState("");
  const [autresInfos, setAutresInfos] = useState("");

  const [showEcartes, setShowEcartes] = useState(false);

  const { data: aaps = [], isLoading } = useQuery({ queryKey: ["aaps"], queryFn: () => getAaps() });

  const mapProfil = (t: string): "BU" | "Startup" | "GT" => {
    if (t.includes("Startup")) return "Startup";
    if (t.includes("Partenaire externe") || t.includes("écosystème")) return "GT";
    return "BU";
  };

  const projet: ProjetInput = useMemo(
    () => ({
      nom: nomProjet,
      description,
      profil: typeActeur ? mapProfil(typeActeur) : undefined,
      typeActeur: typeActeur || undefined,
      secteurs: secteursSel,
      trl: trl ? parseInt(trl) : undefined,
      region: region || undefined,
      budgetTotal: budget || undefined,
      financementRecherche: financement || undefined,
      motsClesLibres: `${typesProjet.join(" ")} ${autresInfos}`,
    }),
    [
      nomProjet,
      description,
      typeActeur,
      secteursSel,
      trl,
      region,
      budget,
      financement,
      typesProjet,
      autresInfos,
    ],
  );

  // ── Pipeline V2.1 : présélection (locale) → juge IA (verdicts) ──────
  // Le projet est FIGÉ au clic « Lancer le matching » ; la présélection ne
  // tourne qu'à la soumission. `aaps` reste en dépendance pour couvrir le cas
  // « base pas encore chargée au moment du clic ».
  const [submitted, setSubmitted] = useState<ProjetInput | null>(null);
  const presel: Preselection | null = useMemo(
    () => (submitted && aaps.length > 0 ? preselectionner(aaps, submitted, 30) : null),
    [aaps, submitted],
  );

  const [jugement, setJugement] = useState<JugementResult | null>(null);
  const [statutJuge, setStatutJuge] = useState<"idle" | "loading" | "done">("idle");
  const requeteRef = useRef(0);
  const savedSigRef = useRef("");

  useEffect(() => {
    setJugement(null);
    setShowEcartes(false);
    if (!presel || !submitted) {
      setStatutJuge("idle");
      return;
    }
    if (presel.candidats.length === 0) {
      setJugement({ verdicts: {}, mode: "juge" });
      setStatutJuge("done");
      return;
    }
    const reqId = ++requeteRef.current;
    setStatutJuge("loading");
    void jugerCandidats(submitted, presel.candidats).then((res) => {
      if (requeteRef.current !== reqId) return; // une soumission plus récente existe
      setJugement(res);
      setStatutJuge("done");
      // Historisation : une fois le verdict rendu, avec le nombre de retenus.
      const sig = JSON.stringify([
        submitted.nom,
        submitted.description,
        submitted.secteurs,
        submitted.trl,
        submitted.region,
        submitted.typeActeur,
      ]);
      if (submitted.nom.trim() && sig !== savedSigRef.current) {
        savedSigRef.current = sig;
        const nbRetenus =
          res.mode === "juge"
            ? presel.candidats.filter((c) => res.verdicts[c.aap.id]?.pertinent).length
            : presel.candidats.length;
        void saveMatchingRequest({
          nom: submitted.nom,
          description: submitted.description,
          filiale: entitePorteuse || pole || undefined,
          trl: submitted.trl ?? null,
          secteurs: submitted.secteurs,
          region: submitted.region,
          profil: submitted.typeActeur,
          budget: submitted.budgetTotal,
          financement: submitted.financementRecherche,
          motsCles: [...typesProjet],
          nb_resultats: nbRetenus,
          extra: { pole, typesProjet, partenaires, dateDeploiement, autresInfos },
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presel, submitted]);

  const lancerMatching = () => {
    setSubmitted(projet);
    setStep("results");
  };

  // ── Tri des candidats selon les verdicts ──
  const retenus: { c: Candidat; raison: string; points: string[] }[] = [];
  const ecartes: { c: Candidat; motif: string }[] = [];
  const nonJuges: Candidat[] = [];
  if (presel && jugement && jugement.mode === "juge") {
    for (const c of presel.candidats) {
      const v = jugement.verdicts[c.aap.id];
      if (!v) nonJuges.push(c);
      else if (v.pertinent) retenus.push({ c, raison: v.raison, points: v.points_attention });
      else ecartes.push({ c, motif: v.motif_ecart || v.raison || "Hors du sujet du projet" });
    }
  }
  const fallback = jugement?.mode === "fallback";

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl">Matching à la demande</h1>
        <div className="text-sm text-muted mt-1">
          Décrivez votre projet — l'outil présélectionne puis l'IA ne retient que les AAP réellement
          en rapport.
        </div>
      </header>

      <Stepper step={step} />

      {step === "form" && (
        <div className="card-flat p-6 mt-6 max-w-4xl">
          <Block title="Le projet">
            <div className="grid grid-cols-1 gap-4">
              <Field label="Nom du projet">
                <TextInput
                  value={nomProjet}
                  onChange={setNomProjet}
                  placeholder="Ex : Jumeau numérique chantier urbain"
                />
              </Field>
              <Field label="Description courte">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Objectifs, contexte, mots-clés…"
                  className="w-full min-h-[110px] px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-navy"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="Pôle ou rattachement principal">
                <Select value={pole} onChange={setPole} options={POLES} />
              </Field>
              <Field label="Type d'acteur">
                <Select value={typeActeur} onChange={setTypeActeur} options={TYPES_ACTEUR} />
              </Field>
              <Field label="Nom de l'entreprise ou entité porteuse">
                <TextInput
                  value={entitePorteuse}
                  onChange={setEntitePorteuse}
                  placeholder="Ex : Actemium Paris, MyStartup…"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Type de projet">
                <MultiSelect
                  options={TYPES_PROJET}
                  values={typesProjet}
                  onChange={setTypesProjet}
                  placeholder="Choisir un ou plusieurs types"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Secteur(s) et thématique(s)">
                <MultiSelect
                  options={SECTEURS}
                  values={secteursSel}
                  onChange={setSecteursSel}
                  placeholder="Choisir un ou plusieurs secteurs"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="Niveau de maturité / TRL">
                <select
                  value={trl}
                  onChange={(e) => setTrl(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-navy"
                >
                  <option value="">—</option>
                  {TRLS.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Localisation"
                hint="Une région précise = uniquement les aides de cette région."
              >
                <Select value={region} onChange={setRegion} options={REGIONS_FR} />
              </Field>
            </div>
          </Block>

          <Block
            title="Informations complémentaires"
            subtitle="Optionnel — affine les recommandations sans bloquer le parcours."
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Budget total estimé du projet">
                <TextInput value={budget} onChange={setBudget} placeholder="Ex : 2,5 M€" />
              </Field>
              <Field label="Montant de financement recherché">
                <TextInput value={financement} onChange={setFinancement} placeholder="Ex : 1 M€" />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Partenaires déjà identifiés">
                <MultiSelect
                  options={PARTENAIRES}
                  values={partenaires}
                  onChange={setPartenaires}
                  placeholder="Choisir un ou plusieurs partenaires"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="Date prévisionnelle de déploiement">
                <input
                  type="date"
                  value={dateDeploiement}
                  onChange={(e) => setDateDeploiement(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-navy"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Autres informations">
                <textarea
                  value={autresInfos}
                  onChange={(e) => setAutresInfos(e.target.value)}
                  placeholder="Tout élément complémentaire utile au matching…"
                  className="w-full min-h-[80px] px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-navy"
                />
              </Field>
            </div>
          </Block>

          <button
            onClick={lancerMatching}
            className="w-full mt-6 bg-navy text-white py-3 rounded-md font-medium hover:opacity-90 flex items-center justify-center gap-2"
          >
            Lancer le matching <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {step === "results" && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-1 gap-3">
            <h2 className="text-lg font-semibold text-navy">
              {statutJuge === "done" && !fallback
                ? `${retenus.length} AAP correspondent à votre projet`
                : nomProjet
                  ? `Matching « ${nomProjet} »`
                  : "Matching"}
            </h2>
            <button
              onClick={() => setStep("form")}
              className="shrink-0 border border-navy text-navy px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--color-accent)]"
            >
              ← Modifier les critères
            </button>
          </div>

          {presel && (
            <div className="text-xs text-muted mb-4">
              {presel.totalActifs.toLocaleString("fr-FR")} AAP actifs passés au crible ·{" "}
              {presel.candidats.length} candidats étudiés par l'IA
              {presel.exclusions.acteurs > 0 &&
                ` · ${presel.exclusions.acteurs} écartés (acteurs non éligibles)`}
              {presel.exclusions.geo > 0 &&
                ` · ${presel.exclusions.geo} écartés (hors périmètre géographique)`}
            </div>
          )}

          {(isLoading || (submitted && !presel)) && (
            <div className="card-flat p-8 text-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Chargement de la base d'AAP…
            </div>
          )}

          {statutJuge === "loading" && presel && (
            <div className="card-flat p-8 text-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              L'IA analyse les {presel.candidats.length} candidats face à votre projet… (~10 s)
            </div>
          )}

          {/* Repli : juge indisponible → présélection brute, annoncée comme telle */}
          {statutJuge === "done" && fallback && presel && (
            <>
              <div className="mb-4 flex items-start gap-2 text-xs bg-[#FFF4E6] text-orange-700 px-3 py-2 rounded-md">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Juge IA indisponible{jugement?.error ? ` (${jugement.error})` : ""} — voici la
                  présélection brute, non validée. Réessayez plus tard pour un tri définitif.
                </span>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {presel.candidats.slice(0, 12).map((c) => (
                  <button
                    key={c.aap.id}
                    type="button"
                    onClick={() => setSelectedAap(c.aap)}
                    className="card-flat p-4 hover:border-navy transition text-left"
                  >
                    <div className="font-semibold text-navy text-sm">{c.aap.titre}</div>
                    <div className="text-xs text-muted mt-1">
                      {c.aap.source} · clôture {fmtDate(c.aap.date_cloture)}
                    </div>
                    {c.raisons[0] && <div className="text-xs text-text mt-2">{c.raisons[0]}</div>}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Mode nominal : short-list validée par le juge */}
          {statutJuge === "done" && !fallback && (
            <>
              {retenus.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
                  {retenus.map(({ c }) => (
                    <VerdictCard
                      key={c.aap.id}
                      candidat={c}
                      verdict={jugement!.verdicts[c.aap.id]}
                      onOpen={setSelectedAap}
                    />
                  ))}
                </div>
              )}

              {retenus.length === 0 && (
                <div className="card-flat p-8 text-center mb-6">
                  <SearchX className="w-8 h-8 text-muted mx-auto mb-3" />
                  <div className="text-sm font-medium text-navy mb-1">
                    Aucun AAP ne correspond vraiment à ce projet aujourd'hui.
                  </div>
                  <div className="text-xs text-muted max-w-md mx-auto">
                    La base évolue chaque nuit — retentez plus tard, élargissez la description, ou
                    consultez ci-dessous les candidats les plus proches examinés par l'IA.
                  </div>
                </div>
              )}

              {(ecartes.length > 0 || nonJuges.length > 0) && (
                <div className="border-t border-border pt-4">
                  <button
                    onClick={() => setShowEcartes((v) => !v)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-navy"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${showEcartes ? "rotate-180" : ""}`}
                    />
                    {ecartes.length + nonJuges.length} candidats examinés et écartés par l'IA
                  </button>
                  {showEcartes && (
                    <div className="mt-3 space-y-2">
                      {ecartes.map(({ c, motif }) => (
                        <button
                          key={c.aap.id}
                          type="button"
                          onClick={() => setSelectedAap(c.aap)}
                          className="w-full text-left rounded-md border border-border bg-white p-3 hover:border-navy transition"
                        >
                          <div className="text-sm font-medium text-text">{c.aap.titre}</div>
                          <div className="text-xs text-muted mt-0.5 flex items-start gap-1">
                            <SearchX className="w-3.5 h-3.5 shrink-0 mt-0.5 text-pink/70" />
                            <span>{motif}</span>
                          </div>
                        </button>
                      ))}
                      {nonJuges.map((c) => (
                        <button
                          key={c.aap.id}
                          type="button"
                          onClick={() => setSelectedAap(c.aap)}
                          className="w-full text-left rounded-md border border-border bg-white p-3 hover:border-navy transition"
                        >
                          <div className="text-sm font-medium text-text">{c.aap.titre}</div>
                          <div className="text-xs text-muted mt-0.5">
                            Non analysé (incident technique) — à vérifier manuellement.
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 text-[11px] text-muted">
                <Sparkles className="w-3.5 h-3.5" />
                Verdicts rendus par Claude sur la base du titre et de la description de chaque AAP —
                vérifiez toujours les critères d'éligibilité sur l'appel officiel.
              </div>
            </>
          )}
        </div>
      )}

      <FicheAap aap={selectedAap} onClose={() => setSelectedAap(null)} />
    </>
  );
}
