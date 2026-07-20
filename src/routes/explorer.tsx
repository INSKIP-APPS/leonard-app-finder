import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  List,
  LayoutGrid,
  Layers,
  FileText,
  X,
  Bookmark,
} from "lucide-react";
import { getDispositifs, getAaps } from "@/services/data-store";
import type { Dispositif, Thematiques } from "@/types/dispositif";
import { THEMATIQUE_LABELS } from "@/types/dispositif";
import type { AAP } from "@/types/aap";
import { aapEchelle } from "@/utils/echelle";
import { useSavedIds } from "@/utils/savedAaps";
import { stripAccents as norm } from "@/utils/text";
import { QueryError } from "@/components/QueryError";

// Nombre d'items rendus par « page » — évite de monter ~2 500 cartes d'un coup
// dans le DOM (PERF-001). L'utilisateur charge la suite à la demande.
const PAGE_SIZE = 60;

type SortBy = "cloture" | "recent" | "alpha";
import { FicheAap } from "@/components/FicheAap";
import { FicheDispositif } from "@/components/FicheDispositif";
import { DispositifCard } from "@/components/explorer/DispositifCard";
import { AapCard } from "@/components/explorer/AapCard";
import {
  AdvancedFiltersPanel,
  advCount,
  matchesAdvanced,
  EMPTY_ADV,
  type AdvFilters,
} from "@/components/explorer/filters";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Base de financements — Leonard Veille AAP" },
      { name: "description", content: "Explorez l'ensemble des financements publics disponibles." },
    ],
  }),
  component: Explorer,
});

const geos = ["Europe", "National", "Régional"];
const secteurs = ["Construction", "Énergie", "Mobilité", "Numérique-IA", "Eau", "Environnement"];

// Chaque secteur d'affichage regroupe plusieurs thématiques du schéma Dispositif.
const SECTEUR_THEMATIQUES: Record<string, (keyof Thematiques)[]> = {
  Construction: [
    "construction_btp",
    "renovation_batiment",
    "infrastructures_durables",
    "amenagement_urbanisme",
    "materiaux_biosources",
  ],
  Énergie: [
    "transition_energetique",
    "energies_renouvelables",
    "efficacite_energetique",
    "hydrogene",
    "decarbonation_industrie",
  ],
  Mobilité: ["mobilite_decarbonee"],
  "Numérique-IA": ["numerique_ia_iot_bim", "robotique_automatisation"],
  Eau: ["gestion_eau"],
  Environnement: ["adaptation_climatique", "economie_circulaire"],
};

// Secteur d'affichage → labels de thématiques (pour filtrer les AAP, qui portent
// des labels et non des booléens).
const SECTEUR_LABELS: Record<string, string[]> = Object.fromEntries(
  Object.entries(SECTEUR_THEMATIQUES).map(([s, keys]) => [
    s,
    keys.map((k) => THEMATIQUE_LABELS[k]),
  ]),
);

function aapMatchesSecteur(a: AAP, secteur: string): boolean {
  const labels = SECTEUR_LABELS[secteur];
  if (!labels) return true;
  return a.thematiques.some((t) => labels.includes(t));
}

function Explorer() {
  const {
    data: dispositifs = [],
    isLoading: loadingD,
    isError: errorD,
    refetch: refetchD,
  } = useQuery({
    queryKey: ["dispositifs"],
    queryFn: getDispositifs,
  });
  const {
    data: aaps = [],
    isLoading: loadingA,
    isError: errorA,
    refetch: refetchA,
  } = useQuery({
    queryKey: ["aaps"],
    queryFn: () => getAaps(),
  });

  const [mode, setMode] = useState<"dispositifs" | "aap">("dispositifs");
  const [geoActif, setGeoActif] = useState<string | null>(null);
  const [secteurActif, setSecteurActif] = useState<string | null>(null);
  const [vue, setVue] = useState<"liste" | "cartes">("liste");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("cloture");
  const [savedOnly, setSavedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const savedIds = useSavedIds();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedAap, setSelectedAap] = useState<AAP | null>(null);
  const [selectedDispositif, setSelectedDispositif] = useState<Dispositif | null>(null);

  // Filtres avancés (Phase 5.3)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adv, setAdv] = useState<AdvFilters>(EMPTY_ADV);
  const nbAdv = advCount(adv);

  // Recherche différée : la frappe reste fluide, le filtrage des ~2 500 lignes
  // suit avec un léger décalage (même résultat, priorité au champ de saisie).
  const deferredQuery = useDeferredValue(query);
  const q = norm(deferredQuery.trim());

  // Rattachement exact via la clé étrangère dispositif_id (Phase 2).
  const aapsByDispositif = useMemo(() => {
    const map = new Map<string, AAP[]>();
    for (const a of aaps) {
      if (!a.dispositif_id) continue;
      const arr = map.get(a.dispositif_id) ?? [];
      arr.push(a);
      map.set(a.dispositif_id, arr);
    }
    return map;
  }, [aaps]);

  // Haystacks précalculés (1× par chargement) : la recherche ne re-normalise
  // plus ~15 000 champs à chaque frappe. Jointure "\n" pour qu'une requête ne
  // puisse pas chevaucher deux champs (mêmes résultats que champ par champ).
  const aapHaystacks = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aaps)
      m.set(
        a.id,
        norm(
          [
            a.titre,
            a.programme,
            a.cluster ?? "",
            a.description,
            ...a.thematiques,
            ...(a.mots_cles ?? []),
          ].join("\n"),
        ),
      );
    return m;
  }, [aaps]);

  const dispositifHaystacks = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dispositifs) {
      const enfants = (aapsByDispositif.get(d.id) ?? []).flatMap((a) => [
        a.titre,
        ...(a.mots_cles ?? []),
      ]);
      m.set(
        d.id,
        norm(
          [
            d.nom,
            d.organisme,
            d.programme,
            d.commentaires ?? "",
            d.thematiques_texte ?? "",
            d.acteurs_texte ?? "",
            ...enfants,
          ].join("\n"),
        ),
      );
    }
    return m;
  }, [dispositifs, aapsByDispositif]);

  const filteredDispositifs = useMemo(() => {
    return dispositifs.filter((d) => {
      if (geoActif) {
        const match =
          (geoActif === "Europe" && d.echelle === "EU") ||
          (geoActif === "National" && d.echelle === "National") ||
          (geoActif === "Régional" && d.echelle === "Régional");
        if (!match) return false;
      }
      if (secteurActif) {
        const keys = SECTEUR_THEMATIQUES[secteurActif];
        if (keys && !keys.some((k) => d.thematiques?.[k])) return false;
      }
      if (!matchesAdvanced(d, adv)) return false;
      if (!q) return true;
      return (dispositifHaystacks.get(d.id) ?? "").includes(q);
    });
  }, [dispositifs, dispositifHaystacks, q, geoActif, secteurActif, adv]);

  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  const filteredAaps = useMemo(() => {
    const list = aaps.filter((a) => {
      if (savedOnly && !savedSet.has(a.id)) return false;
      if (geoActif) {
        const ech = aapEchelle(a);
        const match =
          (geoActif === "Europe" && ech === "EU") ||
          (geoActif === "National" && ech === "National") ||
          (geoActif === "Régional" && ech === "Régional");
        if (!match) return false;
      }
      if (secteurActif && !aapMatchesSecteur(a, secteurActif)) return false;
      if (!q) return true;
      return (aapHaystacks.get(a.id) ?? "").includes(q);
    });
    // Tri (UX-006). Clôture : les plus proches d'abord, sans date en dernier.
    const byCloture = (a: AAP) =>
      a.date_cloture ? new Date(a.date_cloture).getTime() : Number.POSITIVE_INFINITY;
    const sorted = [...list];
    if (sortBy === "cloture") sorted.sort((a, b) => byCloture(a) - byCloture(b));
    else if (sortBy === "recent")
      sorted.sort(
        (a, b) =>
          (b.date_scraping ? Date.parse(b.date_scraping) : 0) -
          (a.date_scraping ? Date.parse(a.date_scraping) : 0),
      );
    else sorted.sort((a, b) => a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" }));
    return sorted;
  }, [aaps, aapHaystacks, q, geoActif, secteurActif, sortBy, savedOnly, savedSet]);

  // PERF-002 : chaque vue n'attend que ses propres données. La liste des
  // dispositifs s'affiche sans attendre le téléchargement des ~2 500 AAP
  // (dont elle n'a besoin que pour des badges secondaires).
  const loading = mode === "aap" ? loadingA : loadingD;
  const hasError = errorD || errorA;

  // Réinitialise la pagination quand les critères changent (PERF-001).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [q, geoActif, secteurActif, adv, mode, sortBy, savedOnly]);

  const resetFiltres = () => {
    setQuery("");
    setGeoActif(null);
    setSecteurActif(null);
    setSavedOnly(false);
    setAdv(EMPTY_ADV);
  };
  const hasActiveFilters =
    !!query || !!geoActif || !!secteurActif || savedOnly || nbAdv > 0;

  // BUG-004 : sur erreur de chargement, écran d'erreur explicite avec relance —
  // sinon la panne serait indistinguable d'une base vide (« 0 dispositifs »).
  if (hasError) {
    return (
      <QueryError
        title="Impossible de charger la base de financements."
        hint="Vérifiez votre connexion, puis réessayez."
        onRetry={() => {
          refetchD();
          refetchA();
        }}
        className="max-w-[1200px] mx-auto flex flex-col items-center justify-center py-32 text-center gap-3"
      />
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Base de financements</h1>
          <p className="text-sm text-muted mt-1">
            Explorez l'ensemble des dispositifs et des appels à projets suivis par la veille
          </p>
        </div>
        {!loading && (
          <span className="text-xs text-muted whitespace-nowrap">
            {dispositifs.length} dispositifs · {aaps.length} appels à projets
          </span>
        )}
      </header>

      {/* Toggle Dispositifs / AAP */}
      <div className="inline-flex items-center rounded-lg border border-border bg-white p-1">
        <button
          onClick={() => setMode("dispositifs")}
          aria-pressed={mode === "dispositifs"}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            mode === "dispositifs" ? "bg-navy text-white" : "text-text hover:text-navy"
          }`}
        >
          <Layers className="w-4 h-4" />
          Dispositifs
        </button>
        <button
          onClick={() => setMode("aap")}
          aria-pressed={mode === "aap"}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            mode === "aap" ? "bg-navy text-white" : "text-text hover:text-navy"
          }`}
        >
          <FileText className="w-4 h-4" />
          Appels à projets
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={mode === "dispositifs" ? "Rechercher un dispositif" : "Rechercher un appel à projets"}
          placeholder={
            mode === "dispositifs"
              ? "Rechercher un dispositif, un organisme ou un AAP rattaché..."
              : "Rechercher un AAP, un mot-clé, un dispositif parent..."
          }
          className="w-full pl-10 pr-10 h-11 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-navy"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="card-flat p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-caps shrink-0 mr-1">Échelle</span>
              {geos.map((g) => (
                <button
                  key={g}
                  onClick={() => setGeoActif(geoActif === g ? null : g)}
                  aria-pressed={geoActif === g}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    geoActif === g
                      ? "bg-navy text-white border-navy"
                      : "bg-white text-text border-border hover:border-navy"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-caps shrink-0 mr-1">Secteur</span>
              {secteurs.map((s) => (
                <button
                  key={s}
                  onClick={() => setSecteurActif(secteurActif === s ? null : s)}
                  aria-pressed={secteurActif === s}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    secteurActif === s
                      ? "bg-navy text-white border-navy"
                      : "bg-white text-text border-border hover:border-navy"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {/* Les filtres avancés portent sur des champs propres aux dispositifs :
              on ne les propose que dans le mode « Dispositifs ». */}
          {mode === "dispositifs" && (
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition ${
                showAdvanced || nbAdv > 0
                  ? "border-navy bg-navy text-white"
                  : "border-border bg-white text-text hover:border-navy"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtres avancés
              {nbAdv > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-navy text-[10px] font-bold">
                  {nbAdv}
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>

        {/* Panneau filtres avancés (dispositifs uniquement) */}
        {mode === "dispositifs" && showAdvanced && (
          <AdvancedFiltersPanel adv={adv} setAdv={setAdv} />
        )}
      </div>

      {/* Tri + vue */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {mode === "dispositifs"
              ? `${filteredDispositifs.length} dispositif(s)`
              : `${filteredAaps.length} AAP`}
          </span>
          {hasActiveFilters && (
            <button
              onClick={resetFiltres}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-ink hover:text-navy"
            >
              <X className="w-3 h-3" /> Réinitialiser
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {mode === "aap" && (
            <>
              <button
                onClick={() => setSavedOnly((v) => !v)}
                aria-pressed={savedOnly}
                title="N'afficher que les AAP sauvegardés"
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium transition ${
                  savedOnly ? "border-pink/40 bg-pink/10 text-pink" : "border-border bg-white text-text hover:border-navy"
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                Sauvegardés
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                aria-label="Trier les appels à projets"
                className="h-8 rounded-md border border-border bg-white text-xs font-medium text-text px-2 focus:outline-none focus:border-navy"
              >
                <option value="cloture">Clôture la plus proche</option>
                <option value="recent">Ajout récent</option>
                <option value="alpha">Alphabétique</option>
              </select>
            </>
          )}
          <div className="flex items-center rounded-md border border-border bg-white overflow-hidden">
            <button
              onClick={() => setVue("liste")}
              aria-pressed={vue === "liste"}
              className={`p-2 ${vue === "liste" ? "bg-navy text-white" : "text-text"}`}
              title="Vue liste"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setVue("cartes")}
              aria-pressed={vue === "cartes"}
              className={`p-2 ${vue === "cartes" ? "bg-navy text-white" : "text-text"}`}
              title="Vue cartes"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted italic text-center py-8">Chargement des données…</div>
      )}

      {/* === Vue Dispositifs === */}
      {!loading && mode === "dispositifs" && (
        <div className={vue === "cartes" ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-3"}>
          {filteredDispositifs.slice(0, visibleCount).map((d) => (
            <DispositifCard
              key={d.id}
              d={d}
              rattaches={aapsByDispositif.get(d.id) ?? []}
              isOpen={expanded === d.id}
              onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
              onOpenFiche={setSelectedDispositif}
              onOpenAap={setSelectedAap}
            />
          ))}
          {filteredDispositifs.length === 0 && <EmptyResult onReset={hasActiveFilters ? resetFiltres : undefined} />}
        </div>
      )}

      {/* === Vue AAP === */}
      {!loading && mode === "aap" && (
        <div className={vue === "cartes" ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-3"}>
          {filteredAaps.slice(0, visibleCount).map((a) => (
            <AapCard key={a.id} a={a} onOpen={setSelectedAap} />
          ))}
          {filteredAaps.length === 0 && (
            <EmptyResult
              label={savedOnly ? "Aucun AAP sauvegardé pour l'instant." : undefined}
              onReset={hasActiveFilters ? resetFiltres : undefined}
            />
          )}
        </div>
      )}

      {/* Pagination progressive (PERF-001) */}
      {!loading &&
        (() => {
          const total = mode === "dispositifs" ? filteredDispositifs.length : filteredAaps.length;
          if (total <= visibleCount) return null;
          const restants = total - visibleCount;
          return (
            <div className="text-center pt-2">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-white text-sm font-medium text-navy hover:border-navy transition"
              >
                Afficher plus ({restants} restant{restants > 1 ? "s" : ""})
              </button>
            </div>
          );
        })()}

      <FicheAap aap={selectedAap} onClose={() => setSelectedAap(null)} />
      <FicheDispositif
        dispositif={selectedDispositif}
        onClose={() => setSelectedDispositif(null)}
      />
    </div>
  );
}

/** État vide de recherche, avec une sortie explicite (réinitialiser) — UX-012. */
function EmptyResult({ label, onReset }: { label?: string; onReset?: () => void }) {
  return (
    <div className="text-sm text-muted italic text-center py-10">
      {label ?? "Aucun résultat ne correspond à votre recherche."}
      {onReset && (
        <div className="mt-3">
          <button
            onClick={onReset}
            className="not-italic inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-white text-xs font-medium text-navy hover:border-navy transition"
          >
            <X className="w-3.5 h-3.5" /> Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}
