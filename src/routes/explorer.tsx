import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  List,
  LayoutGrid,
  Layers,
  FileText,
} from "lucide-react";
import { getDispositifs, getAaps, dataSource } from "@/services/data-store";
import type { Dispositif, Thematiques, ActeursCibles } from "@/types/dispositif";
import { THEMATIQUE_LABELS, ACTEUR_LABELS } from "@/types/dispositif";
import type { AAP } from "@/types/aap";
import { aapEchelle } from "@/utils/echelle";
import { FicheAap } from "@/components/FicheAap";

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
  Object.entries(SECTEUR_THEMATIQUES).map(([s, keys]) => [s, keys.map((k) => THEMATIQUE_LABELS[k])]),
);

function geoBadge(g: string) {
  const map: Record<string, string> = {
    EU: "bg-[#E6F1FB] text-navy",
    National: "bg-[#E8F5F0] text-emerald-800",
    Régional: "bg-[#FFF4E6] text-orange-700",
    Local: "bg-[#F3E8FF] text-purple",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[g] ?? "bg-muted text-text"}`}>{g}</span>;
}

// Libellé TRL à partir des bornes min/max (null si non renseigné).
function trlLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `TRL ${min}–${max}`;
  return `TRL ${min ?? max}`;
}

function descriptionOfDispositif(d: Dispositif): string {
  return d.commentaires || d.thematiques_texte || d.programme || "";
}

function statutDispositifBadge(d: Dispositif) {
  const s = d.statut_ouverture;
  if (!s) return null;
  const map: Record<string, string> = {
    Ouvert: "text-emerald-700 font-medium",
    "À surveiller": "text-orange-600 font-medium",
    Fermé: "text-muted",
  };
  return <span className={`text-xs mt-1 ${map[s] ?? "text-muted"}`}>{s}</span>;
}

// ── Helpers d'affichage AAP (schéma SEDIA réel) ──────────────────────

function fmtMillions(n: number | null): string {
  if (n == null) return "—";
  const m = n / 1_000_000;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(".", ",")} M€`;
}

function budgetLabel(a: AAP): string {
  if (a.budget_par_projet) return `${fmtMillions(a.budget_par_projet)}/projet`;
  if (a.budget_total) return fmtMillions(a.budget_total);
  return "—";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10); // "2027-04-14"
  const [y, m, day] = d.split("-");
  return day && m && y ? `${day}/${m}/${y}` : d;
}

const STATUT_AAP_LABEL: Record<AAP["statut"], string> = {
  open: "Ouvert",
  forthcoming: "À venir",
  closed: "Clôturé",
};

function aapMatchesSecteur(a: AAP, secteur: string): boolean {
  const labels = SECTEUR_LABELS[secteur];
  if (!labels) return true;
  return a.thematiques.some((t) => labels.includes(t));
}

// (Classement géographique d'un AAP → voir aapEchelle dans @/utils/echelle.)

// ── Filtres avancés (Phase 5.3) — s'appliquent aux dispositifs ───────

const FINANCEURS = ["Commission européenne", "ADEME", "Bpifrance", "Région", "ANR", "Banque des Territoires"];

function financeurOf(org: string): string {
  const o = (org || "").toLowerCase();
  if (/(commission|europ|hadea|cinea|eismea|\berc\b|\brea\b)/.test(o)) return "Commission européenne";
  if (o.includes("ademe")) return "ADEME";
  if (o.includes("bpi")) return "Bpifrance";
  if (o.includes("anr")) return "ANR";
  if (o.includes("banque des territoires") || o.includes("cdc")) return "Banque des Territoires";
  if (/(région|region)/.test(o)) return "Région";
  return "Autre";
}

// libellé de filtre → mot-clé recherché dans type_financement
const TYPES_FIN: Record<string, string> = {
  Subvention: "subvention",
  Prêt: "prêt",
  "Avance récupérable": "avance",
  Equity: "equity",
  Garantie: "garantie",
  Accompagnement: "accompagnement",
  "Crédit d'impôt": "crédit",
};
const MONTANTS = ["<100k€", "100k€–1M€", "1M€–5M€", ">5M€", "Variable"];
const STATUTS = ["Ouvert", "À surveiller", "Fermé"];
const PERTINENCES = ["Forte", "Moyenne", "Faible"];
const ACTEUR_KEYS: (keyof ActeursCibles)[] = [
  "pme", "eti", "grand_groupe", "startup", "collectivite",
  "laboratoire_universite", "consortium", "bailleur_social", "agriculteur",
];

interface AdvFilters {
  financeurs: string[];
  typesFin: string[];
  montants: string[];
  statuts: string[];
  pertinences: string[];
  acteurs: (keyof ActeursCibles)[];
  trlMin: number | null;
  trlMax: number | null;
}

const EMPTY_ADV: AdvFilters = {
  financeurs: [], typesFin: [], montants: [], statuts: [], pertinences: [], acteurs: [], trlMin: null, trlMax: null,
};

function advCount(f: AdvFilters): number {
  return (
    f.financeurs.length + f.typesFin.length + f.montants.length + f.statuts.length +
    f.pertinences.length + f.acteurs.length + (f.trlMin != null || f.trlMax != null ? 1 : 0)
  );
}

function matchesAdvanced(d: Dispositif, f: AdvFilters): boolean {
  if (f.financeurs.length && !f.financeurs.includes(financeurOf(d.organisme))) return false;
  if (f.typesFin.length) {
    const tf = (d.type_financement ?? "").toLowerCase();
    if (!f.typesFin.some((label) => tf.includes(TYPES_FIN[label]))) return false;
  }
  if (f.montants.length) {
    const m = d.montant ?? "";
    if (!f.montants.some((b) => m.includes(b))) return false;
  }
  if (f.statuts.length && !(d.statut_ouverture && f.statuts.includes(d.statut_ouverture))) return false;
  if (f.pertinences.length && !(d.pertinence_vinci && f.pertinences.includes(d.pertinence_vinci))) return false;
  if (f.acteurs.length && !f.acteurs.some((k) => d.acteurs_cibles?.[k])) return false;
  if (f.trlMin != null || f.trlMax != null) {
    if (d.trl_min != null || d.trl_max != null) {
      const lo = d.trl_min ?? d.trl_max ?? 0;
      const hi = d.trl_max ?? d.trl_min ?? 9;
      const selLo = f.trlMin ?? 0;
      const selHi = f.trlMax ?? 9;
      if (hi < selLo || lo > selHi) return false;
    }
  }
  return true;
}

// Groupe de chips multi-sélection réutilisable pour le panneau avancé.
function ChipGroup<T extends string>({
  label, options, values, onToggle, render,
}: {
  label: string;
  options: T[];
  values: T[];
  onToggle: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label-caps shrink-0 mr-1 w-28">{label}</span>
      {options.map((o) => {
        const active = values.includes(o);
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              active ? "bg-navy text-white border-navy" : "bg-white text-text border-border hover:border-navy"
            }`}
          >
            {render ? render(o) : o}
          </button>
        );
      })}
    </div>
  );
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

  // Filtres avancés (Phase 5.3)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adv, setAdv] = useState<AdvFilters>(EMPTY_ADV);
  const nbAdv = advCount(adv);

  const toggleAdv = <K extends "financeurs" | "typesFin" | "montants" | "statuts" | "pertinences">(
    field: K,
    value: string,
  ) =>
    setAdv((prev) => {
      const arr = prev[field] as string[];
      return { ...prev, [field]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });

  const toggleActeur = (k: keyof ActeursCibles) =>
    setAdv((prev) => ({
      ...prev,
      acteurs: prev.acteurs.includes(k) ? prev.acteurs.filter((x) => x !== k) : [...prev.acteurs, k],
    }));

  const q = query.trim().toLowerCase();

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
      const inDisp =
        d.nom.toLowerCase().includes(q) ||
        d.organisme.toLowerCase().includes(q) ||
        d.programme.toLowerCase().includes(q) ||
        (d.commentaires ?? "").toLowerCase().includes(q) ||
        (d.thematiques_texte ?? "").toLowerCase().includes(q) ||
        (d.acteurs_texte ?? "").toLowerCase().includes(q);
      const inChildren = (aapsByDispositif.get(d.id) ?? []).some(
        (a) =>
          a.titre.toLowerCase().includes(q) ||
          (a.mots_cles ?? []).some((m) => m.toLowerCase().includes(q)),
      );
      return inDisp || inChildren;
    });
  }, [dispositifs, aapsByDispositif, q, geoActif, secteurActif, adv]);

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
      return (
        a.titre.toLowerCase().includes(q) ||
        a.programme.toLowerCase().includes(q) ||
        (a.cluster ?? "").toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.thematiques.some((t) => t.toLowerCase().includes(q)) ||
        (a.mots_cles ?? []).some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [aaps, q, geoActif, secteurActif]);

  const loading = loadingD || loadingA;

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Base de financements</h1>
          <p className="text-sm text-muted mt-1">
            Explorez les dispositifs et les appels à projets scrapés
          </p>
        </div>
        <span className="text-xs text-muted whitespace-nowrap">
          {dispositifs.length} dispositifs · {aaps.length} AAP
          <span className="ml-2 opacity-60">
            ({dataSource === "supabase" ? "Supabase" : "local"})
          </span>
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
          AAP scrapés
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
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Panneau filtres avancés (dispositifs) */}
        {showAdvanced && (
          <div className="border-t border-border pt-3 mt-1 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">
                Ces filtres s'appliquent aux <span className="font-medium text-text">dispositifs</span>.
              </span>
              {nbAdv > 0 && (
                <button onClick={() => setAdv(EMPTY_ADV)} className="text-xs text-pink hover:underline font-medium">
                  Tout réinitialiser
                </button>
              )}
            </div>
            <ChipGroup label="Financeur" options={FINANCEURS} values={adv.financeurs} onToggle={(v) => toggleAdv("financeurs", v)} />
            <ChipGroup label="Type de financement" options={Object.keys(TYPES_FIN)} values={adv.typesFin} onToggle={(v) => toggleAdv("typesFin", v)} />
            <ChipGroup label="Montant" options={MONTANTS} values={adv.montants} onToggle={(v) => toggleAdv("montants", v)} />
            <ChipGroup
              label="Acteur éligible"
              options={ACTEUR_KEYS}
              values={adv.acteurs}
              onToggle={(k) => toggleActeur(k)}
              render={(k) => ACTEUR_LABELS[k]}
            />
            <ChipGroup label="Statut" options={STATUTS} values={adv.statuts} onToggle={(v) => toggleAdv("statuts", v)} />
            <ChipGroup label="Pertinence VINCI" options={PERTINENCES} values={adv.pertinences} onToggle={(v) => toggleAdv("pertinences", v)} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-caps shrink-0 mr-1 w-28">TRL</span>
              <select
                value={adv.trlMin ?? ""}
                onChange={(e) => setAdv((p) => ({ ...p, trlMin: e.target.value ? Number(e.target.value) : null }))}
                className="px-2 py-1 rounded-md border border-border bg-white text-xs focus:outline-none focus:border-navy"
              >
                <option value="">min</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>TRL {n}</option>)}
              </select>
              <span className="text-xs text-muted">→</span>
              <select
                value={adv.trlMax ?? ""}
                onChange={(e) => setAdv((p) => ({ ...p, trlMax: e.target.value ? Number(e.target.value) : null }))}
                className="px-2 py-1 rounded-md border border-border bg-white text-xs focus:outline-none focus:border-navy"
              >
                <option value="">max</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>TRL {n}</option>)}
              </select>
            </div>
          </div>
        )}
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
          {filteredDispositifs.map((d) => {
            const rattaches = aapsByDispositif.get(d.id) ?? [];
            const isOpen = expanded === d.id;
            const trl = trlLabel(d.trl_min, d.trl_max);
            return (
              <article
                key={d.id}
                className="card-flat hover:border-navy transition overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  className="w-full text-left p-4 flex gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-navy text-sm">{d.nom}</div>
                      {rattaches.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-navy/10 text-navy">
                          {rattaches.length} AAP
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted mt-0.5">{d.organisme}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {geoBadge(d.echelle)}
                      {d.type_financement && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#F3E8FF] text-purple">
                          {d.type_financement}
                        </span>
                      )}
                      {trl && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-navy">
                          {trl}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-2 line-clamp-2">{descriptionOfDispositif(d)}</p>
                  </div>
                  <div className="flex flex-col items-end justify-between shrink-0 text-right">
                    <div>
                      <div className="text-sm font-semibold text-text">{d.montant ?? "—"}</div>
                      {statutDispositifBadge(d)}
                    </div>
                    {isOpen ? (
                      <ChevronDown className="w-5 h-5 text-muted mt-2" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted mt-2" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-[#F9FAFC] px-4 py-3 space-y-2">
                    <div className="label-caps">AAP rattachés ({rattaches.length})</div>
                    {rattaches.length === 0 && (
                      <div className="text-xs text-muted italic">
                        Aucun AAP scrapé pour ce dispositif.
                      </div>
                    )}
                    {rattaches.map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedAap(a); }}
                        className="w-full text-left rounded-md border border-border bg-white p-3 flex items-start justify-between gap-3 hover:border-navy transition"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-text truncate">{a.titre}</div>
                          <div className="text-xs text-muted mt-0.5">
                            {a.id} · clôture {fmtDate(a.date_cloture)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-semibold text-navy">{budgetLabel(a)}</div>
                          <div className="text-[11px] text-muted">{trlLabel(a.trl_min, a.trl_max) ?? "—"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
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
            <button
              type="button"
              key={a.id}
              onClick={() => setSelectedAap(a)}
              className="card-flat p-4 hover:border-navy transition cursor-pointer flex gap-4 text-left w-full"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-navy text-sm">{a.titre}</div>
                <div className="text-xs text-muted mt-0.5">
                  {a.programme}
                  {a.cluster && (
                    <>
                      {" · "}
                      <span className="text-navy/70 font-medium">{a.cluster}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {geoBadge(aapEchelle(a))}
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#F3E8FF] text-purple">
                    {a.type_action}
                  </span>
                  {trlLabel(a.trl_min, a.trl_max) && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-navy">
                      {trlLabel(a.trl_min, a.trl_max)}
                    </span>
                  )}
                  {a.thematiques.slice(0, 2).map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-text"
                    >
                      {s}
                    </span>
                  ))}
                  {a.sources_multiples && a.sources_multiples.length > 0 && (
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium bg-[#ECFDF5] text-emerald-700 border border-emerald-200"
                      title={`Ce dispositif est aussi référencé sur : ${a.sources_multiples.join(", ")}`}
                    >
                      aussi via {a.sources_multiples.join(", ")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-2 line-clamp-2">{a.description}</p>
              </div>
              <div className="flex flex-col items-end justify-between shrink-0 text-right">
                <div>
                  <div className="text-sm font-semibold text-text">{budgetLabel(a)}</div>
                  <div className="text-xs mt-1 text-muted">
                    {STATUT_AAP_LABEL[a.statut]} · {fmtDate(a.date_cloture)}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted mt-2" />
              </div>
            </button>
          ))}
          {filteredAaps.length === 0 && (
            <div className="text-sm text-muted italic text-center py-8">
              Aucun AAP ne correspond à votre recherche.
            </div>
          )}
        </div>
      )}

      <FicheAap aap={selectedAap} onClose={() => setSelectedAap(null)} />
    </div>
  );
}
