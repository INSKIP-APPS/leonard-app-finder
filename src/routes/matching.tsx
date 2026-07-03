import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X, SlidersHorizontal, Check, AlertTriangle, Sparkles, HelpCircle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAaps, saveMatchingRequest } from "@/services/data-store";
import { matchProjet, type ProjetInput, type ScoredAap } from "@/utils/scoring-engine";
import { affinerAvecClaude, type MatchMode } from "@/services/claude-matching";
import { TIERS, TIER_ORDER, tierFor, TierBadge } from "@/utils/tier";
import { FicheAap } from "@/components/FicheAap";


export const Route = createFileRoute("/matching")({
  head: () => ({
    meta: [
      { title: "Matching à la demande — Leonard Veille AAP" },
      { name: "description", content: "Trouvez les Appels à Projets compatibles avec votre projet d'innovation : profil porteur, TRL, secteur, géographie." },
    ],
  }),
  component: Matching,
});

const POLES = [
  "VINCI Construction",
  "VINCI Energies",
  "VINCI Concessions",
  "VINCI Autoroutes",
  "VINCI Airports",
  "Cobra IS",
  "Leonard",
  "Holding / Autre",
];

const TYPES_ACTEUR = [
  "BU ou direction VINCI",
  "Projet interne VINCI",
  "Startup accompagnée",
  "Startup partenaire",
  "Partenaire externe",
  "Autre acteur de l'écosystème",
];

const TYPES_PROJET = [
  "Nouvelle offre ou nouveau produit",
  "Amélioration d'une offre, solution ou process existant",
  "Adaptation à un nouveau marché ou cas d'usage",
  "Innovation interne ou transformation opérationnelle",
  "Transition environnementale / décarbonation",
  "Nouveau modèle économique",
  "Projet partenarial ou consortium",
  "Infrastructure ou actif",
];

const SECTEURS = [
  "Construction",
  "Numérique",
  "Énergie",
  "Mobilité",
  "Eau",
  "Environnement",
  "Matériaux",
  "Industrie",
];

const TRLS = [
  { v: "1", l: "TRL 1 — Principes de base observés" },
  { v: "2", l: "TRL 2 — Concept technologique formulé" },
  { v: "3", l: "TRL 3 — Preuve de concept expérimentale" },
  { v: "4", l: "TRL 4 — Validation en laboratoire" },
  { v: "5", l: "TRL 5 — Validation en environnement pertinent" },
  { v: "6", l: "TRL 6 — Démonstration en environnement pertinent" },
  { v: "7", l: "TRL 7 — Démonstration en environnement opérationnel" },
  { v: "8", l: "TRL 8 — Système complet qualifié" },
  { v: "9", l: "TRL 9 — Système éprouvé en opérationnel" },
];

const REGIONS_FR = [
  "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire",
  "Corse", "Grand Est", "Hauts-de-France", "Île-de-France", "Normandie",
  "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire", "Provence-Alpes-Côte d'Azur",
  "Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte",
  "International",
];

const PARTENAIRES = [
  "Partenaire(s) interne(s) VINCI",
  "Startup",
  "Entreprise / partenaire corporate",
  "Université, laboratoire ou centre de recherche",
  "Institution publique",
  "Collectivité territoriale",
  "Association, ONG ou acteur de terrain",
  "Autres",
];

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
    [nomProjet, description, typeActeur, secteursSel, trl, region, budget, financement, typesProjet, autresInfos],
  );

  const scored = useMemo(() => matchProjet(aaps, projet), [aaps, projet]);

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
    setAffinement("loading");
    const res = await affinerAvecClaude(projet, scored);
    setEnriched(res.scored);
    setAffinementMode(res.mode);
    setAffinementError(res.error ?? null);
    setAffinement("done");
  };

  // Lancement du matching : enregistre la demande en base (une fois par saisie
  // distincte) puis affiche les résultats. La sauvegarde ne bloque pas l'UI.
  const savedSigRef = useRef("");
  const lancerMatching = () => {
    const sig = JSON.stringify([nomProjet, description, secteursSel, trl, region, typeActeur, budget, financement]);
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
        nb_resultats: scored.length,
        extra: { pole, typesProjet, partenaires, dateDeploiement, autresInfos },
      });
    }
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
  const resetFilters = () => { setMinScore(40); setMinAdequation(0); setMinAccessibilite(0); };

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl">Matching à la demande</h1>
        <div className="text-sm text-muted mt-1">Décrivez votre projet pour identifier les AAP compatibles.</div>
      </header>

      <Stepper step={step} />

      {step === "form" && (
        <div className="card-flat p-6 mt-6 max-w-4xl">
          <Block title="Informations générales">
            <div className="grid grid-cols-1 gap-4">
              <Field label="Nom du projet">
                <TextInput value={nomProjet} onChange={setNomProjet} placeholder="Ex : Jumeau numérique chantier urbain" />
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
          </Block>

          <Block title="Profil du porteur de projet">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Pôle ou rattachement principal">
                <Select value={pole} onChange={setPole} options={POLES} />
              </Field>
              <Field label="Type d'acteur">
                <Select value={typeActeur} onChange={setTypeActeur} options={TYPES_ACTEUR} />
              </Field>
              <Field label="Nom de l'entreprise ou entité porteuse">
                <TextInput value={entitePorteuse} onChange={setEntitePorteuse} placeholder="Ex : Actemium Paris, MyStartup…" />
              </Field>
            </div>
          </Block>

          <Block title="Nature du projet">
            <Field label="Type de projet">
              <MultiSelect options={TYPES_PROJET} values={typesProjet} onChange={setTypesProjet} placeholder="Choisir un ou plusieurs types" />
            </Field>
            <div className="mt-4">
              <Field label="Secteur(s) et thématique(s)">
                <MultiSelect options={SECTEURS} values={secteursSel} onChange={setSecteursSel} placeholder="Choisir un ou plusieurs secteurs" />
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
                    <option key={t.v} value={t.v}>{t.l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Localisation">
                <Select value={region} onChange={setRegion} options={REGIONS_FR} />
              </Field>
            </div>
          </Block>

          <Block title="Informations complémentaires" subtitle="Optionnel — affine les recommandations sans bloquer le parcours.">
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
                <MultiSelect options={PARTENAIRES} values={partenaires} onChange={setPartenaires} placeholder="Choisir un ou plusieurs partenaires" />
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
              Top {Math.min(18, results.length)} affiné par Claude (Sonnet 5) — score fusionné 60 % structurel / 40 % sémantique, raisons et points d'attention reformulés.
            </div>
          )}
          {affinement === "done" && affinementMode === "fallback" && (
            <div className="mb-4 flex items-start gap-2 text-xs bg-[#FFF4E6] text-orange-700 px-3 py-2 rounded-md">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Affinage IA indisponible — repli sur le scoring structurel.
                {affinementError ? ` (${affinementError})` : ""} La clé API Anthropic doit être configurée côté serveur.
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
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </button>
              {filtersDirty && (
                <button onClick={resetFilters} className="text-xs text-pink hover:underline font-medium">
                  Réinitialiser
                </button>
              )}
            </div>
            {showFilters && (
              <div className="card-flat p-4 mt-3 grid grid-cols-1 md:grid-cols-3 gap-5">
                <SliderField label="Score d'opportunité min." value={minScore} onChange={setMinScore} />
                <SliderField label="Adéquation min." value={minAdequation} onChange={setMinAdequation} />
                <SliderField label="Accessibilité min." value={minAccessibilite} onChange={setMinAccessibilite} />
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
                <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${t.className}`}>
                  <Icon className="w-3 h-3" />
                  {t.label} <span className="opacity-70 font-normal ml-1">{t.range}</span>
                </span>
              );
            })}
          </div>

          {isLoading && (
            <div className="card-flat p-8 text-center text-muted">Chargement des appels à projets…</div>
          )}

          {!isLoading && results.length === 0 && (
            <div className="card-flat p-8 text-center text-muted">
              Aucun AAP ne correspond à vos critères. Élargissez le périmètre.
            </div>
          )}

          {!isLoading && TIER_ORDER.map((k) => {
            const group = results.filter((r) => tierFor(r.score).key === k);
            if (group.length === 0) return null;
            const t = TIERS[k];
            const Icon = t.icon;
            return (
              <div key={k} className="mb-6 last:mb-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${t.className}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold text-navy">{t.label}s <span className="text-muted font-normal">({group.length})</span></h3>
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

// ── Carte de résultat (sous-scores réels + raisons Couche 1) ─────────

function barColor(v: number) {
  if (v >= 70) return "bg-emerald-500";
  if (v >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</span>
        <span className="text-xs font-semibold text-navy tabular-nums">{value}<span className="text-muted font-normal">/100</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-[#eef2ff] overflow-hidden">
        <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function fmtMillions(n: number | null): string {
  if (n == null) return "—";
  const m = n / 1_000_000;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(".", ",")} M€`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso.slice(0, 10);
}

function ResultCard({ scored, onOpen }: { scored: ScoredAap; onOpen: (a: AAP) => void }) {
  const { aap, score, sous_scores, raisons, points_attention, enrichi, score_structurel, score_semantique, elements_manquants } = scored;
  return (
    <button
      type="button"
      onClick={() => onOpen(aap)}
      className={`card-flat p-4 hover:border-navy transition flex flex-col gap-3 text-left w-full ${enrichi ? "border-purple/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {enrichi && (
              <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F3E8FF] text-purple">
                <Sparkles className="w-3 h-3" /> IA
              </span>
            )}
            <div className="font-semibold text-navy text-sm leading-snug">{aap.titre}</div>
          </div>
          <div className="text-xs text-muted mt-0.5">
            {aap.programme}
            {aap.cluster && <> · <span className="font-medium">{aap.cluster}</span></>}
            {" · "}
            {aap.type_action}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-navy tabular-nums leading-none">{score}</div>
          <div className="mt-1"><TierBadge score={score} /></div>
          {enrichi && score_structurel != null && score_semantique != null && (
            <div className="text-[10px] text-muted mt-1 whitespace-nowrap">
              struct. {score_structurel} · IA {score_semantique}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <SubScore label="Adéquation" value={sous_scores.adequation} />
        <SubScore label="Accessibilité" value={sous_scores.accessibilite} />
        <SubScore label="Financier" value={sous_scores.financier} />
      </div>

      {raisons.length > 0 && (
        <ul className="space-y-1">
          {raisons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-text">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {points_attention.length > 0 && (
        <ul className="space-y-1">
          {points_attention.map((p, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      {elements_manquants && elements_manquants.length > 0 && (
        <ul className="space-y-1">
          {elements_manquants.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-purple">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>À renforcer : {e}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-xs text-muted border-t border-border pt-2 mt-auto">
        <span>Clôture {fmtDate(aap.date_cloture)}</span>
        <span className="inline-flex items-center gap-1 text-navy font-medium">
          {fmtMillions(aap.budget_par_projet ?? aap.budget_total)} <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}

function SliderField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-text">{label}</span>
        <span className="text-sm font-semibold text-navy tabular-nums">{value}<span className="text-muted font-normal text-xs">/100</span></span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-[var(--color-navy,#001D3D)] cursor-pointer"
      />
    </div>
  );
}

function Stepper({ step }: { step: string }) {
  const steps = ["1 · Projet & porteur", "2 · Nature du projet", "3 · Résultats"];
  const activeIdx = step === "form" ? 1 : 2;
  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => {
        const active = i <= activeIdx;
        return (
          <div key={s} className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${active ? "bg-navy text-white" : "bg-white border border-border text-muted"}`}>
              {s}
            </div>
            {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <div className="label-caps mb-1">{title}</div>
      {subtitle && <div className="text-xs text-muted mb-3">{subtitle}</div>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-text mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-navy"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-navy"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function MultiSelect({ options, values, onChange, placeholder }: { options: string[]; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = (o: string) => {
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  };
  const remove = (o: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(values.filter((v) => v !== o));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[38px] px-3 py-1.5 border border-border rounded-md text-sm bg-white text-left flex items-center justify-between gap-2 focus:outline-none focus:border-navy"
      >
        <div className="flex flex-wrap gap-1.5 flex-1">
          {values.length === 0 ? (
            <span className="text-muted">{placeholder ?? "—"}</span>
          ) : (
            values.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 bg-navy text-white text-xs px-2 py-0.5 rounded-full">
                {v}
                <span onClick={(e) => remove(v, e)} className="hover:opacity-80 cursor-pointer">
                  <X className="w-3 h-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-border rounded-md shadow-lg">
          {options.map((o) => {
            const active = values.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[var(--color-accent)] ${active ? "bg-[var(--color-accent)]" : ""}`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${active ? "bg-navy border-navy" : "border-border"}`}>
                  {active && <span className="text-white text-xs leading-none">✓</span>}
                </span>
                <span>{o}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
