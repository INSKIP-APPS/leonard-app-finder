import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  List,
  LayoutGrid,
  Layers,
  FileText,
} from "lucide-react";
import { getDispositifs, getAaps } from "@/services/data-store";
import type { Dispositif, Thematiques } from "@/types/dispositif";
import { THEMATIQUE_LABELS } from "@/types/dispositif";
import type { AAP } from "@/types/aap";
import { aapEchelle } from "@/utils/echelle";
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
      { title: "Base de dispositifs — Leonard Veille AAP" },
      { name: "description", content: "Explorez l'ensemble des financements publics disponibles." },
    ],
  }),
  component: Explorer,
});

const geos = ["Europe", "National", "Régional", "Local"];
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
  const { data: dispositifs = [], isLoading: loadingD } = useQuery({
    queryKey: ["dispositifs"],
    queryFn: getDispositifs,
  });
  const { data: aaps = [], isLoading: loadingA } = useQuery({
    queryKey: ["aaps"],
    queryFn: () => getAaps(),
  });

  const [mode, setMode] = useState<"dispositifs" | "aap">("dispositifs");
  const [geoActif, setGeoActif] = useState<string | null>(null);
  const [secteurActif, setSecteurActif] = useState<string | null>(null);
  const [vue, setVue] = useState<"liste" | "cartes">("liste");
  const [query, setQuery] = useState("");
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
  const q = deferredQuery.trim().toLowerCase();

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
        [
          a.titre,
          a.programme,
          a.cluster ?? "",
          a.description,
          ...a.thematiques,
          ...(a.mots_cles ?? []),
        ]
          .join("\n")
          .toLowerCase(),
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
        [
          d.nom,
          d.organisme,
          d.programme,
          d.commentaires ?? "",
          d.thematiques_texte ?? "",
          d.acteurs_texte ?? "",
          ...enfants,
        ]
          .join("\n")
          .toLowerCase(),
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

  const filteredAaps = useMemo(() => {
    return aaps.filter((a) => {
      if (geoActif) {
        const ech = aapEchelle(a);
        const match =
          (geoActif === "Europe" && ech === "EU") ||
          (geoActif === "National" && ech === "National") ||
          (geoActif === "Régional" && ech === "Régional") ||
          (geoActif === "Local" && ech === "Local");
        if (!match) return false;
      }
      if (secteurActif && !aapMatchesSecteur(a, secteurActif)) return false;
      if (!q) return true;
      return (aapHaystacks.get(a.id) ?? "").includes(q);
    });
  }, [aaps, aapHaystacks, q, geoActif, secteurActif]);

  const loading = loadingD || loadingA;

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
        <span className="text-xs text-muted whitespace-nowrap">
          {dispositifs.length} dispositifs · {aaps.length} appels à projets
        </span>
      </header>

      {/* Toggle Dispositifs / AAP */}
      <div className="inline-flex items-center rounded-lg border border-border bg-white p-1">
        <button
          onClick={() => setMode("dispositifs")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            mode === "dispositifs" ? "bg-navy text-white" : "text-text hover:text-navy"
          }`}
        >
          <Layers className="w-4 h-4" />
          Dispositifs
        </button>
        <button
          onClick={() => setMode("aap")}
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
          placeholder={
            mode === "dispositifs"
              ? "Rechercher un dispositif, un organisme ou un AAP rattaché..."
              : "Rechercher un AAP, un mot-clé, un dispositif parent..."
          }
          className="w-full pl-10 pr-4 h-11 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-navy"
        />
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
        </div>

        {/* Panneau filtres avancés (dispositifs) */}
        {showAdvanced && <AdvancedFiltersPanel adv={adv} setAdv={setAdv} />}
      </div>

      {/* Tri + vue */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {mode === "dispositifs"
            ? `${filteredDispositifs.length} dispositif(s)`
            : `${filteredAaps.length} AAP`}
        </span>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1 text-sm text-text hover:text-navy">
            Trier par : <span className="font-medium">Pertinence</span>
            <ChevronDown className="w-4 h-4" />
          </button>
          <div className="flex items-center rounded-md border border-border bg-white overflow-hidden">
            <button
              onClick={() => setVue("liste")}
              className={`p-2 ${vue === "liste" ? "bg-navy text-white" : "text-text"}`}
              title="Vue liste"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setVue("cartes")}
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
          {filteredDispositifs.map((d) => (
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
          {filteredDispositifs.length === 0 && (
            <div className="text-sm text-muted italic text-center py-8">
              Aucun dispositif ne correspond à votre recherche.
            </div>
          )}
        </div>
      )}

      {/* === Vue AAP === */}
      {!loading && mode === "aap" && (
        <div className={vue === "cartes" ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-3"}>
          {filteredAaps.map((a) => (
            <AapCard key={a.id} a={a} onOpen={setSelectedAap} />
          ))}
          {filteredAaps.length === 0 && (
            <div className="text-sm text-muted italic text-center py-8">
              Aucun AAP ne correspond à votre recherche.
            </div>
          )}
        </div>
      )}

      <FicheAap aap={selectedAap} onClose={() => setSelectedAap(null)} />
      <FicheDispositif
        dispositif={selectedDispositif}
        onClose={() => setSelectedDispositif(null)}
      />
    </div>
  );
}
