import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Users as UsersIcon,
  Clock,
  Send,
  Zap,
  LayoutGrid,
  Table as TableIcon,
  Download,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getProgramme, getProjetsByProgramme, getCohortesDispo, getStatsParProjet, type ProjetStats } from "@/services/programmes";
import type {
  ProgrammeId,
  ProjetV3,
  ProjetStatut,
} from "@/types/programme";
import { STATUT_LABEL, STATUT_TONE, COHORTE_ACTIVE, COHORTES_INTRAP } from "@/types/programme";
import { NewProjetModal } from "@/components/NewProjetModal";
import { AnalyseExpressModal } from "@/components/AnalyseExpressModal";
import { useProfil } from "@/services/auth";

export const Route = createFileRoute("/programmes/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Programme ${params.id} — Leonard Veille AAP` }],
  }),
  component: ProgrammePage,
});

/** Échappe une valeur pour CSV (guillemets doublés, champ quoté si besoin). */
function csvCell(v: string | number | null): string {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export CSV de la vue analytique — livrable COPIL sans dépendance externe. */
function exportAnalyseCsv(
  programmeNom: string,
  projets: ProjetV3[],
  stats: Record<string, ProjetStats>,
) {
  const headers = [
    "Projet",
    "Statut",
    "AAP retenus",
    "Prioritaires",
    "Nouveautés",
    "Clôture ≤ 30 j",
    "Candidatures",
    "Dernière veille",
  ];
  const lines = projets.map((p) => {
    const s = stats[p.id] ?? { retenus: 0, prioritaires: 0, nouveautes: 0, deadlines_30j: 0, candidatures: 0 };
    const veille = p.derniere_veille_le
      ? new Date(p.derniere_veille_le).toLocaleDateString("fr-FR")
      : "—";
    return [p.nom, p.statut, s.retenus, s.prioritaires, s.nouveautes, s.deadlines_30j, s.candidatures, veille]
      .map(csvCell)
      .join(";");
  });
  // BOM UTF-8 pour qu'Excel lise correctement les accents.
  const csv = "﻿" + [headers.map(csvCell).join(";"), ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = programmeNom.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  a.href = url;
  a.download = `veille-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ProgrammePage() {
  const { id } = Route.useParams();
  const programmeId = id as ProgrammeId;
  const qc = useQueryClient();
  const { profil } = useProfil();
  const canCreate = profil?.role === "admin" || profil?.role === "editeur";
  const [modalOpen, setModalOpen] = useState(false);
  const [analyseOpen, setAnalyseOpen] = useState(false);
  // Cohorte : uniquement pertinent pour Intrapreneur. Défaut = cohorte active (10).
  const isIntrap = programmeId === "intrapreneur";
  const [cohorte, setCohorte] = useState<number>(COHORTE_ACTIVE);
  const [vue, setVue] = useState<"grid" | "table">("grid");

  const {
    data: programme,
    isLoading: loadingProg,
    isError: errorProg,
    refetch: refetchProg,
  } = useQuery({
    queryKey: ["programme", programmeId],
    queryFn: () => getProgramme(programmeId),
  });
  const { data: projets = [], isLoading: loadingProj } = useQuery({
    queryKey: ["projets-by-programme", programmeId, isIntrap ? cohorte : null],
    queryFn: () => getProjetsByProgramme(programmeId, isIntrap ? cohorte : null),
  });
  const { data: cohortesDispo = [] } = useQuery({
    queryKey: ["cohortes-dispo", programmeId],
    queryFn: () => getCohortesDispo(programmeId),
    enabled: isIntrap,
    staleTime: 5 * 60_000,
  });
  const {
    data: stats = {},
    isLoading: loadingStats,
    isError: errorStats,
  } = useQuery({
    queryKey: ["stats-par-projet", programmeId, isIntrap ? cohorte : null],
    queryFn: () => getStatsParProjet(programmeId, isIntrap ? cohorte : null),
    // Chargé en continu : alimente aussi les KPIs du hero (pas seulement la table).
    staleTime: 60_000,
  });

  if (loadingProg) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    );
  }
  // BUG-007 : distinguer l'erreur (réseau/RLS) du « introuvable » — sinon une
  // simple coupure affiche « Programme introuvable ».
  if (errorProg) {
    return (
      <div className="max-w-lg mx-auto text-center pt-16">
        <h2 className="text-lg font-semibold text-navy">Impossible de charger ce programme</h2>
        <p className="text-sm text-muted mt-2">Vérifiez votre connexion, puis réessayez.</p>
        <button
          onClick={() => refetchProg()}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-navy text-white text-sm font-medium hover:opacity-90 transition"
        >
          Réessayer
        </button>
      </div>
    );
  }
  if (!programme) {
    return (
      <div className="max-w-lg mx-auto text-center pt-16">
        <h2 className="text-lg font-semibold text-navy">Programme introuvable</h2>
        <p className="text-sm text-muted mt-2">
          Ce programme n'existe pas ou n'est pas publié.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm text-sky-ink font-semibold">
          ← Retour au cockpit
        </Link>
      </div>
    );
  }

  const industrialise = projets.filter((p) => p.statut === "industrialise").length;
  const prototype = projets.filter((p) => p.statut === "prototype").length;
  const idee = projets.filter((p) => p.statut === "idee").length;
  const actifs = projets.filter((p) => p.actif).length;

  // KPIs hero réels (UX-007) : agrégés depuis les stats par projet.
  const totalRecommandes = Object.values(stats).reduce((a, s) => a + s.retenus, 0);
  const totalNouveautes = Object.values(stats).reduce((a, s) => a + s.nouveautes, 0);
  const kpiRecos = loadingStats ? "…" : totalRecommandes;
  const kpiNouveautes = loadingStats ? "…" : totalNouveautes;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Fil d'Ariane */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/" className="hover:text-navy">
          Cockpit
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-text font-semibold">Programme {programme.nom}</span>
      </div>

      {/* Hero programme */}
      <div
        className="rounded-2xl p-6 md:p-8 relative overflow-hidden"
        style={{
          background: programme.couleur
            ? `linear-gradient(120deg, ${programme.couleur}18 0%, #E2F7FC 100%)`
            : "linear-gradient(120deg, #ECE8FB 0%, #E2F7FC 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-35"
          style={{
            background: `radial-gradient(circle, ${programme.couleur ?? "#00B7E0"} 0%, transparent 70%)`,
          }}
        />
        <div className="relative">
          <div
            className="text-[11px] uppercase tracking-widest font-semibold mb-2"
            style={{ color: programme.couleur ?? "#009FC6" }}
          >
            Programme Leonard
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-navy tracking-tight mb-1">
            {programme.nom}
          </h1>
          {programme.sous_titre && (
            <p className="text-sm md:text-base text-muted max-w-xl">{programme.sous_titre}</p>
          )}

          {/* Sélecteur de cohorte (Intrapreneur uniquement) */}
          {isIntrap && (
            <CohorteSwitcher
              current={cohorte}
              onChange={setCohorte}
              disponibles={cohortesDispo}
            />
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
            <KpiMini label="Projets suivis" value={projets.length}>
              <span className="text-muted">
                {industrialise > 0 && `${industrialise} industrialisé${industrialise > 1 ? "s" : ""}`}
                {industrialise > 0 && prototype > 0 && " · "}
                {prototype > 0 && `${prototype} prototype${prototype > 1 ? "s" : ""}`}
                {(industrialise > 0 || prototype > 0) && idee > 0 && " · "}
                {idee > 0 && `${idee} idée${idee > 1 ? "s" : ""}`}
              </span>
            </KpiMini>
            <KpiMini label="AAP recommandés" value={kpiRecos}>
              <span className="text-muted">retenus sur l'ensemble des projets</span>
            </KpiMini>
            <KpiMini label="À découvrir" value={kpiNouveautes}>
              <span className="text-muted">non encore consultés</span>
            </KpiMini>
            <KpiMini label="Projets actifs" value={actifs}>
              <span className="text-muted">recevant la veille</span>
            </KpiMini>
          </div>
        </div>
      </div>

      {/* En-tête section projets */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-navy">Projets suivis</h2>
          <p className="text-xs text-muted mt-0.5">
            {vue === "grid"
              ? "Chaque projet reçoit des propositions d'AAP au fil des scrapes hebdomadaires."
              : "Vue analytique — comparez les projets sur leur volume, urgence et couverture."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Grille / Analyse */}
          <div className="inline-flex items-center bg-white border border-border rounded-md p-0.5">
            <button
              onClick={() => setVue("grid")}
              title="Vue grille (cartes projet)"
              className={`inline-flex items-center gap-1 px-2.5 h-8 rounded text-xs font-semibold transition ${
                vue === "grid" ? "bg-navy text-white" : "text-muted hover:text-navy"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Grille
            </button>
            <button
              onClick={() => setVue("table")}
              title="Vue analytique (tableau)"
              className={`inline-flex items-center gap-1 px-2.5 h-8 rounded text-xs font-semibold transition ${
                vue === "table" ? "bg-navy text-white" : "text-muted hover:text-navy"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Analyse
            </button>
          </div>
          {vue === "table" && projets.length > 0 && (
            <button
              onClick={() => exportAnalyseCsv(programme.nom, projets, stats)}
              title="Exporter le tableau analytique en CSV (pour COPIL / Excel)"
              className="inline-flex items-center gap-1.5 bg-white text-navy border border-border px-3 py-2 rounded-md text-sm font-medium hover:border-navy transition"
            >
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
          )}
          <button
            onClick={() => setAnalyseOpen(true)}
            title="Tester un projet ad hoc et voir les AAP pertinents (rien n'est sauvegardé)"
            className="inline-flex items-center gap-1.5 bg-white text-navy border border-navy px-4 py-2 rounded-md text-sm font-medium hover:bg-[#FFF3F6] transition"
          >
            <Zap className="w-4 h-4 text-pink" />
            Analyse express
          </button>
          <button
            onClick={() => setModalOpen(true)}
            disabled={!canCreate}
            title={canCreate ? "Créer un projet dans ce programme" : "Rôle Éditeur ou Administrateur requis"}
            className="inline-flex items-center gap-1.5 bg-navy text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Plus className="w-4 h-4" />
            Ajouter un projet
          </button>
        </div>
      </div>

      {modalOpen && programme && (
        <NewProjetModal
          programmeId={programmeId}
          programmeNom={programme.nom}
          cohorte={isIntrap ? cohorte : null}
          onClose={() => {
            setModalOpen(false);
            qc.invalidateQueries({ queryKey: ["projets-by-programme", programmeId] });
            qc.invalidateQueries({ queryKey: ["cohortes-dispo", programmeId] });
          }}
        />
      )}

      {analyseOpen && (
        <AnalyseExpressModal onClose={() => setAnalyseOpen(false)} />
      )}

      {/* Contenu principal — grille OU tableau selon la vue */}
      {loadingProj ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        </div>
      ) : projets.length === 0 ? (
        <div className="border border-dashed border-border-strong rounded-xl p-10 text-center">
          <Sparkles className="w-6 h-6 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">
            {isIntrap
              ? `Aucun projet actif dans la cohorte #${cohorte}.`
              : `Aucun projet suivi dans le programme ${programme.nom} pour l'instant.`}
          </p>
          {canCreate ? (
            <button
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 bg-navy text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Ajouter le premier projet
            </button>
          ) : (
            <p className="text-xs text-muted mt-2">
              Les projets sont ajoutés par un administrateur ou un éditeur du programme.
            </p>
          )}
        </div>
      ) : vue === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projets.map((p) => (
            <ProjetCard key={p.id} projet={p} />
          ))}
        </div>
      ) : (
        <AnalyseTable
          projets={projets}
          stats={stats}
          loading={loadingStats}
          error={errorStats}
        />
      )}
    </div>
  );
}

function KpiMini({
  label,
  value,
  children,
}: {
  label: string;
  value: string | number;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/95 border border-border p-3.5 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-muted mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-navy leading-none tabular-nums">{value}</div>
      <div className="text-[11px] mt-1.5">{children}</div>
    </div>
  );
}

function ProjetCard({ projet }: { projet: ProjetV3 }) {
  const navigate = useNavigate();
  const porteur = projet.porteurs?.[0];
  const secteurs = projet.data?.secteurs ?? [];
  const description = projet.description ?? "";

  return (
    <button
      onClick={() => navigate({ to: "/projets/$id", params: { id: projet.id } })}
      className="text-left bg-white border border-border rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-border-strong transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-base font-semibold text-navy leading-snug">{projet.nom}</h3>
        {projet.statut && (
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${STATUT_TONE[projet.statut as ProjetStatut]}`}
          >
            {STATUT_LABEL[projet.statut as ProjetStatut]}
          </span>
        )}
      </div>
      {porteur && (
        <div className="text-xs text-muted mb-2 flex items-center gap-1.5">
          <UsersIcon className="w-3 h-3" /> {porteur.nom} · {porteur.entite}
        </div>
      )}
      <p className="text-[13px] text-muted line-clamp-2 mb-3 leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {secteurs.slice(0, 3).map((s) => (
          <span
            key={s}
            className="text-[10.5px] font-medium px-2 py-0.5 rounded bg-bg border border-border text-muted"
          >
            {s}
          </span>
        ))}
        {projet.trl && (
          <span className="text-[10.5px] font-medium px-2 py-0.5 rounded bg-bg border border-border text-muted">
            TRL {projet.trl}
          </span>
        )}
      </div>
      <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
        <VeilleStatus projet={projet} />
        <ChevronRight className="w-4 h-4 text-muted" />
      </div>
    </button>
  );
}

function VeilleStatus({ projet }: { projet: ProjetV3 }) {
  // Statut de veille temporaire (avant que projet_aap soit alimenté)
  if (!projet.actif) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Clock className="w-3 h-3" /> Veille en pause
      </span>
    );
  }
  if (!projet.derniere_veille_le) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sky-ink font-semibold">
        <Send className="w-3 h-3" /> Veille à lancer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <Clock className="w-3 h-3" /> Dernière veille récente
    </span>
  );
}

// ─── Vue analytique tabulaire ────────────────────────────────────────

type SortKey = "nom" | "retenus" | "prioritaires" | "nouveautes" | "deadlines_30j" | "candidatures" | "veille";

function AnalyseTable({
  projets,
  stats,
  loading = false,
  error = false,
}: {
  projets: ProjetV3[];
  stats: Record<string, ProjetStats>;
  loading?: boolean;
  error?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("prioritaires");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    return projets.map((p) => {
      const s = stats[p.id] ?? { projet_id: p.id, retenus: 0, prioritaires: 0, nouveautes: 0, deadlines_30j: 0, candidatures: 0 };
      const veilleMs = p.derniere_veille_le ? new Date(p.derniere_veille_le).getTime() : 0;
      return { p, s, veilleMs };
    });
  }, [projets, stats]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "nom": va = a.p.nom.toLowerCase(); vb = b.p.nom.toLowerCase(); break;
        case "retenus": va = a.s.retenus; vb = b.s.retenus; break;
        case "prioritaires": va = a.s.prioritaires; vb = b.s.prioritaires; break;
        case "nouveautes": va = a.s.nouveautes; vb = b.s.nouveautes; break;
        case "deadlines_30j": va = a.s.deadlines_30j; vb = b.s.deadlines_30j; break;
        case "candidatures": va = a.s.candidatures; vb = b.s.candidatures; break;
        case "veille": va = a.veilleMs; vb = b.veilleMs; break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggle(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "nom" ? "asc" : "desc"); }
  }

  // BUG-012 : ne pas présenter un tableau de zéros comme réel pendant le
  // chargement, ni le laisser à zéro silencieusement sur erreur.
  if (error) {
    return (
      <div className="bg-white border border-border rounded-xl shadow-sm p-8 text-center">
        <div className="text-sm font-medium text-pink">Impossible de charger les statistiques.</div>
        <div className="text-xs text-muted mt-1">
          Les chiffres ci-dessous ne peuvent pas être affichés pour l'instant — réessayez plus tard.
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="bg-white border border-border rounded-xl shadow-sm p-8 flex items-center justify-center gap-2 text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Calcul des statistiques…
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest font-semibold text-muted border-b border-border bg-bg">
              <Th active={sortKey === "nom"} dir={sortDir} onClick={() => toggle("nom")} align="left">Projet</Th>
              <Th active={sortKey === "retenus"} dir={sortDir} onClick={() => toggle("retenus")}>AAP retenus</Th>
              <Th active={sortKey === "prioritaires"} dir={sortDir} onClick={() => toggle("prioritaires")}>Prioritaires</Th>
              <Th active={sortKey === "nouveautes"} dir={sortDir} onClick={() => toggle("nouveautes")}>Nouveautés</Th>
              <Th active={sortKey === "deadlines_30j"} dir={sortDir} onClick={() => toggle("deadlines_30j")}>Deadline &lt; 30 j</Th>
              <Th active={sortKey === "candidatures"} dir={sortDir} onClick={() => toggle("candidatures")}>Candidatures</Th>
              <Th active={sortKey === "veille"} dir={sortDir} onClick={() => toggle("veille")}>Dernière veille</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ p, s, veilleMs }) => (
              <AnalyseRow key={p.id} projet={p} stats={s} veilleMs={veilleMs} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  active,
  dir,
  onClick,
  align = "right",
}: {
  children: React.ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2.5 ${align === "left" ? "text-left" : "text-right"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-navy transition ${active ? "text-navy" : ""}`}
      >
        {children}
        {active ? (
          dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function AnalyseRow({
  projet,
  stats,
  veilleMs,
}: {
  projet: ProjetV3;
  stats: ProjetStats;
  veilleMs: number;
}) {
  const navigate = useNavigate();
  const veilleLabel = veilleMs
    ? relativeTime(veilleMs)
    : "—";
  return (
    <tr
      onClick={() => navigate({ to: "/projets/$id", params: { id: projet.id } })}
      className="border-b border-border hover:bg-[#FBFBFD] transition cursor-pointer"
    >
      <td className="px-3 py-3">
        <div className="font-semibold text-navy text-sm">{projet.nom}</div>
        {projet.statut && (
          <span
            className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1 ${STATUT_TONE[projet.statut as ProjetStatut]}`}
          >
            {STATUT_LABEL[projet.statut as ProjetStatut]}
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums font-semibold text-text">
        {stats.retenus > 0 ? stats.retenus : <span className="text-faint">0</span>}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {stats.prioritaires > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-emerald-100 text-emerald-700 font-bold">
            {stats.prioritaires}
          </span>
        ) : (
          <span className="text-faint">0</span>
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {stats.nouveautes > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-pink text-white font-bold">
            {stats.nouveautes}
          </span>
        ) : (
          <span className="text-faint">0</span>
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {stats.deadlines_30j > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-orange-100 text-orange-700 font-bold">
            {stats.deadlines_30j}
          </span>
        ) : (
          <span className="text-faint">0</span>
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-text">
        {stats.candidatures > 0 ? stats.candidatures : <span className="text-faint">0</span>}
      </td>
      <td className="px-3 py-3 text-right text-[11px] text-muted">{veilleLabel}</td>
    </tr>
  );
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const jours = Math.floor(diff / 86_400_000);
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Hier";
  if (jours < 7) return `Il y a ${jours} j`;
  if (jours < 30) return `Il y a ${Math.floor(jours / 7)} sem`;
  return `Il y a ${Math.floor(jours / 30)} mois`;
}

function CohorteSwitcher({
  current,
  onChange,
  disponibles,
}: {
  current: number;
  onChange: (n: number) => void;
  disponibles: number[];
}) {
  const dispoSet = new Set(disponibles);
  return (
    <div className="mt-5 inline-flex items-center gap-1.5 bg-white/60 backdrop-blur border border-border rounded-full p-1">
      <span className="text-[10px] uppercase tracking-widest font-bold text-muted px-2.5">
        Cohorte
      </span>
      {COHORTES_INTRAP.map((n) => {
        const on = n === current;
        const dispo = dispoSet.has(n);
        // UX-008 : une cohorte vide n'est pas cliquable (sauf celle déjà active),
        // pour ne pas mener à un écran vide trompeur.
        const disabled = !dispo && !on;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            disabled={disabled}
            title={dispo ? `Cohorte #${n}` : `Cohorte #${n} · aucun projet importé`}
            className={`min-w-[32px] h-7 px-2 rounded-full text-xs font-semibold tabular-nums transition ${
              on
                ? "bg-navy text-white shadow-sm"
                : dispo
                  ? "text-navy hover:bg-navy/5"
                  : "text-muted/40 cursor-not-allowed"
            }`}
          >
            #{n}
          </button>
        );
      })}
    </div>
  );
}
