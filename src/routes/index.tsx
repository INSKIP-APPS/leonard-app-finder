import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAaps } from "@/services/data-store";
import {
  getProgrammes,
  getProjetsCountByProgramme,
  getMomentumFeed,
  type FeedItem,
} from "@/services/programmes";
import { joursRestants, statutEffectif } from "@/utils/scoring-engine";
import type { AAP } from "@/types/aap";
import type { Programme, ProgrammeId } from "@/types/programme";
import { FicheAap } from "@/components/FicheAap";

import {
  AlertCircle,
  TrendingUp,
  Layers,
  Loader2,
  Rocket,
  ChevronRight,
  Bell,
  Clock,
  Sparkles,
} from "lucide-react";

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
  const { data: programmes = [] } = useQuery({
    queryKey: ["programmes"],
    queryFn: getProgrammes,
    staleTime: 5 * 60_000,
  });
  const { data: projetCounts = {
    intrapreneur: 0,
    seed: 0,
    catalyst: 0,
    ia: 0,
    prospective: 0,
    scaleup: 0,
  } } = useQuery({
    queryKey: ["projets-count-by-programme"],
    queryFn: getProjetsCountByProgramme,
  });
  const [selectedAap, setSelectedAap] = useState<AAP | null>(null);

  // Statut EFFECTIF : un AAP « open » dont la deadline est passée est compté clôturé.
  const ouverts = useMemo(() => aaps.filter((a) => statutEffectif(a) === "open"), [aaps]);
  const ferm30 = useMemo(
    () =>
      ouverts.filter((a) => {
        const j = joursRestants(a.date_cloture);
        return j !== null && j >= 0 && j <= 30;
      }),
    [ouverts],
  );
  const nbSources = useMemo(() => new Set(aaps.map((a) => a.source)).size, [aaps]);

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
          <div className="text-xs text-muted mt-1">Données mises à jour le {today}</div>
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
          label="Projets rattachés"
          value={Object.values(projetCounts).reduce((a, b) => a + b, 0)}
          sub={`sur ${programmes.length} programmes`}
          icon={<Rocket className="w-4 h-4" />}
          tone="purple"
        />
        <KpiTile
          label="Sources connectées"
          value={nbSources}
          sub="plateformes de veille"
          icon={<Layers className="w-4 h-4" />}
        />
      </div>

      {/* Ligne principale : Programmes (gauche) + AAP forts VINCI (droite) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Programmes Leonard */}
        {programmes.length > 0 && (
          <section className="lg:col-span-2">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-navy">Programmes Leonard</h2>
              <div className="text-[11px] text-muted mt-0.5">
                Chaque programme suit ses projets et reçoit des propositions d'AAP au fil des veilles.
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {programmes.map((p) => (
                <ProgrammeTile
                  key={p.id}
                  programme={p}
                  nbProjets={projetCounts[p.id as ProgrammeId] ?? 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* « Ce qui a besoin de toi » : urgences + nouveautés cross-projets */}
        <MomentumBlock />
      </div>

      <FicheAap aap={selectedAap} onClose={() => setSelectedAap(null)} />
    </>
  );
}

function MomentumBlock() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["momentum-feed"],
    queryFn: () => getMomentumFeed(8),
    staleTime: 60_000,
  });

  return (
    <aside className="card-flat p-4 fade-up flex flex-col">
      <header className="mb-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-pink" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-navy leading-none">
              Ce qui a besoin de toi
            </h3>
            <div className="text-[10px] text-muted mt-1">
              Urgences et nouveautés sur tes projets actifs
            </div>
          </div>
          {items.length > 0 && (
            <span className="text-[10px] font-bold bg-pink text-white rounded-full min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center">
              {items.length}
            </span>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted text-center py-6 leading-relaxed">
          Rien d'urgent pour l'instant.
          <br />
          Tu es à jour sur tous tes projets.
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {items.map((it) => (
            <FeedRow key={`${it.projet_id}:${it.aap_id}`} item={it} />
          ))}
        </div>
      )}
    </aside>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const meta = FEED_TYPE_META[item.type];
  return (
    <Link
      to="/projets/$id"
      params={{ id: item.projet_id }}
      className="block p-2.5 rounded-lg border border-border hover:border-sky/40 hover:bg-sky/[0.02] transition"
    >
      <div className="flex items-start gap-2">
        <div
          className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center ${meta.iconBg}`}
        >
          <meta.Icon className={`w-3.5 h-3.5 ${meta.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${meta.labelColor}`}
            >
              {item.type === "urgent"
                ? `J-${item.jours_restants}`
                : item.type === "nouveaute-prioritaire"
                  ? "Nouveau · Prioritaire"
                  : "Nouveau"}
            </span>
            <span className="text-[10px] text-muted truncate">· {item.projet_nom}</span>
          </div>
          <div className="text-xs font-semibold text-navy line-clamp-2 leading-snug">
            {item.aap_titre}
          </div>
          <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1.5">
            <span className="truncate">{SOURCE_SHORT[item.aap_source] ?? item.aap_source}</span>
            {item.score > 0 && (
              <>
                <span>·</span>
                <span className="font-semibold text-text tabular-nums">{item.score}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

const FEED_TYPE_META: Record<
  FeedItem["type"],
  {
    Icon: typeof Bell;
    iconBg: string;
    iconColor: string;
    labelColor: string;
  }
> = {
  urgent: {
    Icon: Clock,
    iconBg: "bg-[#FFE4EC]",
    iconColor: "text-pink",
    labelColor: "text-pink",
  },
  "nouveaute-prioritaire": {
    Icon: Sparkles,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    labelColor: "text-emerald-700",
  },
  nouveaute: {
    Icon: Sparkles,
    iconBg: "bg-[#E2F7FC]",
    iconColor: "text-sky-ink",
    labelColor: "text-sky-ink",
  },
};

function ProgrammeTile({
  programme,
  nbProjets,
}: {
  programme: Programme;
  nbProjets: number;
}) {
  const navigate = useNavigate();
  const couleur = programme.couleur ?? "#2A1A6E";
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/programmes/$id", params: { id: programme.id } })}
      className="relative overflow-hidden text-left bg-white border border-border rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-border-strong transition-all p-5 flex flex-col"
    >
      <span
        className="absolute right-0 top-0 w-24 h-24 rounded-full blur-2xl opacity-30 pointer-events-none"
        style={{ background: couleur, transform: "translate(35%, -35%)" }}
      />
      <div className="flex items-center gap-2 mb-2 relative">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: couleur }}
        />
        <span
          className="text-[10px] uppercase tracking-widest font-bold"
          style={{ color: couleur }}
        >
          Programme
        </span>
      </div>
      <div className="text-xl font-bold text-navy tracking-tight leading-tight">
        {programme.nom}
      </div>
      {programme.sous_titre && (
        <div className="text-xs text-muted mt-1 line-clamp-2">{programme.sous_titre}</div>
      )}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <div className="text-xs">
          <span className="text-2xl font-bold text-navy tabular-nums">{nbProjets}</span>
          <span className="text-muted ml-1.5">
            projet{nbProjets > 1 ? "s" : ""} suivi{nbProjets > 1 ? "s" : ""}
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted" />
      </div>
    </button>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  accent = false,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  accent?: boolean;
  tone?: "sky" | "pink" | "purple";
}) {
  // Barre d'accent verticale — signature des cartes du dashboard client.
  const barColor = tone ?? (accent ? "pink" : "sky");
  const barClass = { sky: "bg-sky", pink: "bg-pink", purple: "bg-purple" }[barColor];
  return (
    <div className="card-flat p-4 group hover:border-sky/40 transition-colors fade-up flex flex-col justify-between gap-3 min-h-[110px] relative overflow-hidden">
      <span className={`absolute top-0 left-0 h-full w-1 ${barClass}`} aria-hidden />
      <div className="flex items-center justify-between">
        <div className="label-caps text-[10px]">{label}</div>
        <span
          className={accent ? "text-pink" : "text-muted group-hover:text-sky-ink transition-colors"}
        >
          {icon}
        </span>
      </div>
      <div>
        <div
          className={`text-3xl font-bold leading-none tabular-nums ${accent ? "text-pink" : "text-navy group-hover:text-sky-ink"} transition-colors`}
        >
          {value.toLocaleString("fr-FR")}
        </div>
        <div className="text-[10px] text-muted mt-1">{sub}</div>
      </div>
    </div>
  );
}
