import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAaps, getDispositifs, getProjets, dataSource } from "@/services/data-store";
import { aapEchelle } from "@/utils/echelle";
import { joursRestants, statutEffectif } from "@/utils/scoring-engine";
import type { AAP } from "@/types/aap";
import type { Dispositif } from "@/types/dispositif";
import { FicheAap } from "@/components/FicheAap";
import { FicheDispositif } from "@/components/FicheDispositif";
import { useSavedIds, useSavedDispositifIds } from "@/utils/savedAaps";

// Pertinence VINCI = nombre de thématiques « métier » concrètes (on écarte la
// R&D générique, trop peu discriminante pour prioriser un secteur d'activité).
const GENERIC_THEME = "Recherche & développement";
function vinciRelevance(a: AAP): number {
  return (a.thematiques ?? []).filter((t) => t !== GENERIC_THEME).length;
}
import { BarChart } from "@/components/BarChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, TrendingUp, Target, Bookmark, Layers, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — Leonard Veille AAP" },
      {
        name: "description",
        content:
          "Cockpit veille : KPIs de la base d'AAP, fermetures imminentes, dernières demandes de matching.",
      },
    ],
  }),
  component: Dashboard,
});

// Raccourci d'affichage pour les libellés de source (charts).
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

function Dashboard() {
  const { data: aaps = [], isLoading } = useQuery({ queryKey: ["aaps"], queryFn: () => getAaps() });
  const { data: dispositifs = [] } = useQuery({
    queryKey: ["dispositifs"],
    queryFn: getDispositifs,
  });
  const { data: projets = [] } = useQuery({ queryKey: ["projets"], queryFn: () => getProjets() });
  const [selectedAap, setSelectedAap] = useState<AAP | null>(null);
  const [selectedDispositif, setSelectedDispositif] = useState<Dispositif | null>(null);

  // Statut EFFECTIF : un AAP « open » dont la deadline est passée est compté clôturé.
  const ouverts = useMemo(() => aaps.filter((a) => statutEffectif(a) === "open"), [aaps]);

  const dated = useMemo(
    () =>
      ouverts
        .map((a) => ({ a, j: joursRestants(a.date_cloture) }))
        .filter((x): x is { a: AAP; j: number } => x.j !== null && x.j >= 0),
    [ouverts],
  );
  const ferm30 = useMemo(() => dated.filter((x) => x.j <= 30), [dated]);
  // À saisir en priorité : pertinence VINCI d'abord, échéance ensuite (fenêtre 120 j).
  const prioritaires = useMemo(
    () =>
      [...dated]
        .filter((x) => x.j <= 120)
        .sort((x, y) => vinciRelevance(y.a) - vinciRelevance(x.a) || x.j - y.j),
    [dated],
  );

  const nbSources = useMemo(() => new Set(aaps.map((a) => a.source)).size, [aaps]);
  const savedIds = useSavedIds();
  const savedAaps = useMemo(() => aaps.filter((a) => savedIds.includes(a.id)), [aaps, savedIds]);
  const savedDispIds = useSavedDispositifIds();
  const savedDispositifs = useMemo(
    () => dispositifs.filter((d) => savedDispIds.includes(d.id)),
    [dispositifs, savedDispIds],
  );

  const parTheme = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of ouverts) for (const t of a.thematiques ?? []) c[t] = (c[t] ?? 0) + 1;
    return Object.entries(c)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [ouverts]);

  const parSource = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of ouverts) {
      const s = SOURCE_SHORT[a.source] ?? a.source;
      c[s] = (c[s] ?? 0) + 1;
    }
    return Object.entries(c)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [ouverts]);

  const parGeo = useMemo(() => {
    const order = ["EU", "National", "Régional", "Local"];
    const c: Record<string, number> = {};
    for (const a of ouverts) {
      const e = aapEchelle(a);
      c[e] = (c[e] ?? 0) + 1;
    }
    return order.filter((k) => c[k]).map((k) => ({ label: k, value: c[k] }));
  }, [ouverts]);

  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Chargement de la base d'AAP…
      </div>
    );
  }

  return (
    <>
      <header className="mb-5 flex items-end justify-between fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cockpit veille AAP</h1>
          <div className="text-xs text-muted mt-1">
            Mis à jour le {today} · source{" "}
            {dataSource === "supabase" ? "Supabase (live)" : "locale"}
          </div>
        </div>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-border text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-sky live-dot" />{" "}
          {aaps.length.toLocaleString("fr-FR")} AAP en base
        </span>
      </header>

      {/* KPIs globaux (réels) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KpiTile
          label="AAP ouverts"
          value={ouverts.length}
          sub="disponibles"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KpiTile
          label="Fermetures < 30j"
          value={ferm30.length}
          sub="à traiter vite"
          icon={<AlertCircle className="w-4 h-4" />}
          accent
        />
        <KpiTile
          label="Sources connectées"
          value={nbSources}
          sub="plateformes"
          icon={<Layers className="w-4 h-4" />}
        />
        <KpiTile
          label="Demandes de matching"
          value={projets.length}
          sub="historisées"
          icon={<Target className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* === GAUCHE : Fermetures imminentes === */}
        <Panel
          className="col-span-12 lg:col-span-6"
          icon={<AlertCircle className="w-4 h-4 text-pink" />}
          title="À saisir en priorité"
          count={prioritaires.length}
          accent="pink"
          subtitle="Pertinence VINCI d'abord · échéance < 120 j"
        >
          <div className="space-y-2">
            {prioritaires.slice(0, 7).map(({ a, j }) => (
              <button
                type="button"
                key={a.id}
                onClick={() => setSelectedAap(a)}
                className="w-full text-left p-3 rounded-lg border border-border hover:border-pink/40 hover:bg-pink/[0.02] transition flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-navy line-clamp-2 leading-snug">
                    {a.titre}
                  </div>
                  <div className="text-[10px] text-muted mt-1 truncate">
                    {SOURCE_SHORT[a.source] ?? a.source} ·{" "}
                    {new Date(a.date_cloture!).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <JoursBadge jours={j} />
              </button>
            ))}
            {prioritaires.length === 0 && <EmptyState text="Aucune échéance à venir." />}
          </div>
        </Panel>

        {/* === DROITE : Dernières demandes de matching === */}
        <div className="col-span-12 lg:col-span-6 space-y-4">
          <Panel
            icon={<Target className="w-4 h-4 text-sky" />}
            title="Dernières demandes de matching"
            count={projets.length}
            accent="sky"
            subtitle="Projets soumis au matching"
          >
            {projets.length === 0 && (
              <EmptyState text="Aucune demande pour l'instant. Lancez un matching pour l'historiser ici." />
            )}
            <div className="space-y-2">
              {[...projets]
                .reverse()
                .slice(0, 6)
                .map((p, i) => {
                  const nb = (p as { data?: { nb_resultats?: number } }).data?.nb_resultats;
                  return (
                    <Link
                      key={p.id ?? i}
                      to="/matching"
                      className="block w-full text-left p-3 rounded-lg border border-border hover:border-sky/40 hover:bg-sky/[0.02] transition"
                    >
                      <div className="text-xs font-semibold text-navy line-clamp-1">{p.nom}</div>
                      <div className="text-[10px] text-muted mt-1 line-clamp-1">
                        {p.description || "—"}
                      </div>
                      {typeof nb === "number" && (
                        <div className="text-[10px] text-sky font-medium mt-1">
                          {nb} AAP compatibles
                        </div>
                      )}
                    </Link>
                  );
                })}
            </div>
          </Panel>

          <Panel
            icon={<Bookmark className="w-4 h-4 text-pink" />}
            title="Sauvegardés"
            count={savedAaps.length + savedDispositifs.length}
            accent="pink"
            subtitle="Vos AAP et dispositifs mis de côté"
          >
            {savedAaps.length === 0 && savedDispositifs.length === 0 && (
              <EmptyState text="Rien de sauvegardé. Ouvrez une fiche (AAP ou dispositif) et cliquez « Sauvegarder » pour la retrouver ici." />
            )}
            <div className="space-y-2">
              {savedDispositifs.slice(0, 4).map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => setSelectedDispositif(d)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-pink/40 hover:bg-pink/[0.02] transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-navy/10 text-navy">
                      Dispositif
                    </span>
                    <div className="text-xs font-semibold text-navy line-clamp-1">{d.nom}</div>
                  </div>
                  <div className="text-[10px] text-muted mt-1 truncate">{d.organisme}</div>
                </button>
              ))}
              {savedAaps.slice(0, 8).map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setSelectedAap(a)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-pink/40 hover:bg-pink/[0.02] transition"
                >
                  <div className="text-xs font-semibold text-navy line-clamp-1">{a.titre}</div>
                  <div className="text-[10px] text-muted mt-1 truncate">
                    {SOURCE_SHORT[a.source] ?? a.source}
                    {a.date_cloture
                      ? ` · clôture ${new Date(a.date_cloture).toLocaleDateString("fr-FR")}`
                      : ""}
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* === BAS : Répartition des AAP ouverts === */}
        <div className="col-span-12 card-flat p-6 fade-up">
          <Tabs defaultValue="thematique">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div>
                <h3 className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sky" />
                  Répartition des AAP ouverts
                </h3>
                <div className="text-[11px] text-muted mt-1">
                  {ouverts.length.toLocaleString("fr-FR")} AAP ouverts — vue par critère
                </div>
              </div>
              <TabsList className="bg-bg">
                <TabsTrigger value="thematique">Thématique</TabsTrigger>
                <TabsTrigger value="source">Source</TabsTrigger>
                <TabsTrigger value="geo">Géographie</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="thematique" className="mt-0">
              <BarChart title="" data={parTheme} bare />
            </TabsContent>
            <TabsContent value="source" className="mt-0">
              <BarChart title="" data={parSource} bare />
            </TabsContent>
            <TabsContent value="geo" className="mt-0">
              <BarChart title="" data={parGeo} bare />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <FicheAap aap={selectedAap} onClose={() => setSelectedAap(null)} />
      <FicheDispositif
        dispositif={selectedDispositif}
        onClose={() => setSelectedDispositif(null)}
      />
    </>
  );
}

function Panel({
  icon,
  title,
  count,
  subtitle,
  accent,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  subtitle?: string;
  accent: "pink" | "sky";
  children: React.ReactNode;
  className?: string;
}) {
  const dot = accent === "pink" ? "bg-pink" : "bg-sky";
  return (
    <section className={`card-flat p-4 fade-up ${className ?? ""}`}>
      <header className="flex items-center justify-between mb-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h3 className="text-sm font-semibold text-navy leading-none">{title}</h3>
            {subtitle && <div className="text-[10px] text-muted mt-1">{subtitle}</div>}
          </div>
        </div>
        {typeof count === "number" && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-navy">
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            {count}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-xs text-muted text-center py-6 px-2">{text}</div>;
}

function JoursBadge({ jours }: { jours: number }) {
  const tone =
    jours <= 7
      ? "bg-pink/10 text-pink"
      : jours <= 15
        ? "bg-[#FFF4E6] text-orange-700"
        : "bg-bg text-muted";
  return (
    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${tone}`}>
      J-{jours}
    </span>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card-flat p-4 group hover:border-sky/40 transition-colors fade-up flex flex-col justify-between gap-3 min-h-[110px]">
      <div className="flex items-center justify-between">
        <div className="label-caps text-[10px]">{label}</div>
        <span
          className={accent ? "text-pink" : "text-muted group-hover:text-sky transition-colors"}
        >
          {icon}
        </span>
      </div>
      <div>
        <div
          className={`text-3xl font-bold leading-none tabular-nums ${accent ? "text-pink" : "text-navy group-hover:text-sky"} transition-colors`}
        >
          {value.toLocaleString("fr-FR")}
        </div>
        <div className="text-[10px] text-muted mt-1">{sub}</div>
      </div>
    </div>
  );
}
