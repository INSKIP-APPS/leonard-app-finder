import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  AlertTriangle,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAaps, saveMatchingRequest } from "@/services/data-store";
import type { AAP } from "@/types/aap";
import { matchProjet, type ProjetInput, type ScoredAap } from "@/utils/scoring-engine";
import { affinerAvecClaude, type MatchMode } from "@/services/claude-matching";
import { TIERS, TIER_ORDER, tierFor } from "@/utils/tier";
import { FicheAap } from "@/components/FicheAap";
import { ResultCard } from "@/components/matching/ResultCard";
import {
  Stepper,
  Block,
  Field,
  TextInput,
  Select,
  MultiSelect,
  SliderField,
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

// Référence stable pour « aucun matching lancé » (évite les re-rendus inutiles).
const EMPTY_SCORED: ScoredAap[] = [];

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

  // Filtres dynamiques (jauges)
  const [minScore, setMinScore] = useState(40);
  const [minAdequation, setMinAdequation] = useState(0);
  const [minAccessibilite, setMinAccessibilite] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

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

  // Projet SOUMIS (figé au clic « Lancer le matching »). Le scoring des ~2 500
  // AAP ne tourne qu'à la soumission — pas à chaque frappe dans le formulaire.
  // `aaps` reste en dépendance : si la base arrive après le clic (chargement
  // initial), les résultats se calculent dès qu'elle est disponible.
  const [submitted, setSubmitted] = useState<ProjetInput | null>(null);
  const scored = useMemo(
    () => (submitted ? matchProjet(aaps, submitted) : EMPTY_SCORED),
    [aaps, submitted],
  );

  // Couche 2 — affinage Claude (à la demande)
  const [enriched, setEnriched] = useState<ScoredAap[] | null>(null);
  const [affinement, setAffinement] = useState<"idle" | "loading" | "done">("idle");
  const [affinementMode, setAffinementMode] = useState<MatchMode | null>(null);
  const [affinementError, setAffinementError] = useState<string | null>(null);

  // Toute modification du projet (donc de `scored`) invalide l'affinage précédent.
  useEffect(() => {
    setEnriched(null);
    setAffinement("idle");
    setAffinementMode(null);
    setAffinementError(null);
  }, [scored]);

  const effectiveScored = enriched ?? scored;

  const lancerAffinage = async () => {
    if (!submitted) return; // résultats affichés ⇒ toujours défini
    setAffinement("loading");
    const res = await affinerAvecClaude(submitted, scored);
    setEnriched(res.scored);
    setAffinementMode(res.mode);
    setAffinementError(res.error ?? null);
    setAffinement("done");
  };

  // Lancement du matching : enregistre la demande en base (une fois par saisie
  // distincte) puis affiche les résultats. La sauvegarde ne bloque pas l'UI.
  const savedSigRef = useRef("");
  const lancerMatching = () => {
    const sig = JSON.stringify([
      nomProjet,
      description,
      secteursSel,
      trl,
      region,
      typeActeur,
      budget,
      financement,
    ]);
    if (nomProjet.trim() && sig !== savedSigRef.current) {
      savedSigRef.current = sig;
      void saveMatchingRequest({
        nom: nomProjet,
        description,
        filiale: entitePorteuse || pole || undefined,
        trl: trl ? parseInt(trl) : null,
        secteurs: secteursSel,
        region: region || undefined,
        profil: typeActeur || undefined,
        budget: budget || undefined,
        financement: financement || undefined,
        motsCles: [...typesProjet],
        nb_resultats: matchProjet(aaps, projet).length,
        extra: { pole, typesProjet, partenaires, dateDeploiement, autresInfos },
      });
    }
    setSubmitted(projet);
    setStep("results");
  };

  const results = useMemo(
    () =>
      effectiveScored.filter(
        (r) =>
          r.score >= minScore &&
          r.sous_scores.adequation >= minAdequation &&
          r.sous_scores.accessibilite >= minAccessibilite,
      ),
    [effectiveScored, minScore, minAdequation, minAccessibilite],
  );

  const filtersDirty = minScore !== 40 || minAdequation !== 0 || minAccessibilite !== 0;
  const resetFilters = () => {
    setMinScore(40);
    setMinAdequation(0);
    setMinAccessibilite(0);
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl">Matching à la demande</h1>
        <div className="text-sm text-muted mt-1">
          Décrivez votre projet pour identifier les AAP compatibles.
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
              <Field label="Localisation">
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
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-lg font-semibold text-navy">
              {results.length} AAP compatibles{nomProjet ? ` avec « ${nomProjet} »` : ""}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={lancerAffinage}
                disabled={affinement === "loading"}
                className="inline-flex items-center gap-2 bg-purple text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
                title="Analyse sémantique du top des résultats par Claude"
              >
                {affinement === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {affinement === "loading" ? "Analyse en cours…" : "Affiner avec l'IA"}
              </button>
              <button
                onClick={() => setStep("form")}
                className="border border-navy text-navy px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--color-accent)]"
              >
                ← Modifier les critères
              </button>
            </div>
          </div>

          {affinement === "done" && affinementMode === "claude" && (
            <div className="mb-4 flex items-center gap-2 text-xs bg-[#F3E8FF] text-purple px-3 py-2 rounded-md">
              <Sparkles className="w-4 h-4 shrink-0" />
              Top {Math.min(18, results.length)} affiné par Claude (Sonnet 5) — score fusionné 60 %
              structurel / 40 % sémantique, raisons et points d'attention reformulés.
            </div>
          )}
          {affinement === "done" && affinementMode === "fallback" && (
            <div className="mb-4 flex items-start gap-2 text-xs bg-[#FFF4E6] text-orange-700 px-3 py-2 rounded-md">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Affinage IA indisponible — repli sur le scoring structurel.
                {affinementError ? ` (${affinementError})` : ""} La clé API Anthropic doit être
                configurée côté serveur.
              </span>
            </div>
          )}

          <div className="mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="inline-flex items-center gap-2 text-sm font-medium text-navy border border-border bg-white px-3 py-1.5 rounded-md hover:border-navy"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Affiner les résultats
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
                />
              </button>
              {filtersDirty && (
                <button
                  onClick={resetFilters}
                  className="text-xs text-pink hover:underline font-medium"
                >
                  Réinitialiser
                </button>
              )}
            </div>
            {showFilters && (
              <div className="card-flat p-4 mt-3 grid grid-cols-1 md:grid-cols-3 gap-5">
                <SliderField
                  label="Score d'opportunité min."
                  value={minScore}
                  onChange={setMinScore}
                />
                <SliderField
                  label="Adéquation min."
                  value={minAdequation}
                  onChange={setMinAdequation}
                />
                <SliderField
                  label="Accessibilité min."
                  value={minAccessibilite}
                  onChange={setMinAccessibilite}
                />
              </div>
            )}
          </div>

          {/* Légende */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-muted">
            <span className="font-medium text-navy">Légende :</span>
            {TIER_ORDER.map((k) => {
              const t = TIERS[k];
              const Icon = t.icon;
              return (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${t.className}`}
                >
                  <Icon className="w-3 h-3" />
                  {t.label} <span className="opacity-70 font-normal ml-1">{t.range}</span>
                </span>
              );
            })}
          </div>

          {isLoading && (
            <div className="card-flat p-8 text-center text-muted">
              Chargement des appels à projets…
            </div>
          )}

          {!isLoading && results.length === 0 && (
            <div className="card-flat p-8 text-center text-muted">
              Aucun AAP ne correspond à vos critères. Élargissez le périmètre.
            </div>
          )}

          {!isLoading &&
            TIER_ORDER.map((k) => {
              const group = results.filter((r) => tierFor(r.score).key === k);
              if (group.length === 0) return null;
              const t = TIERS[k];
              const Icon = t.icon;
              return (
                <div key={k} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${t.className}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <h3 className="text-sm font-semibold text-navy">
                      {t.label}s <span className="text-muted font-normal">({group.length})</span>
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {group.map((r) => (
                      <ResultCard key={r.aap.id} scored={r} onOpen={setSelectedAap} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <FicheAap aap={selectedAap} onClose={() => setSelectedAap(null)} />
    </>
  );
}
