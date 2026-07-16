import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Users as UsersIcon,
  Clock,
  Send,
  Zap,
} from "lucide-react";
import { getProgramme, getProjetsByProgramme, getCohortesDispo } from "@/services/programmes";
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

  const { data: programme, isLoading: loadingProg } = useQuery({
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

  if (loadingProg) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
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
            <KpiMini label="AAP recommandés" value="—">
              <span className="text-muted">disponible après la 1re veille</span>
            </KpiMini>
            <KpiMini label="Nouveaux cette semaine" value="—">
              <span className="text-muted">à venir</span>
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
            Chaque projet reçoit des propositions d'AAP au fil des scrapes hebdomadaires.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Grille projets */}
      {loadingProj ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        </div>
      ) : projets.length === 0 ? (
        <div className="border border-dashed border-border-strong rounded-xl p-10 text-center">
          <Sparkles className="w-6 h-6 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">Aucun projet dans ce programme pour l'instant.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projets.map((p) => (
            <ProjetCard key={p.id} projet={p} />
          ))}
        </div>
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
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            title={dispo ? `Cohorte #${n}` : `Cohorte #${n} · aucun projet importé`}
            className={`min-w-[32px] h-7 px-2 rounded-full text-xs font-semibold tabular-nums transition ${
              on
                ? "bg-navy text-white shadow-sm"
                : dispo
                  ? "text-navy hover:bg-navy/5"
                  : "text-muted/70 hover:bg-bg"
            }`}
          >
            #{n}
          </button>
        );
      })}
    </div>
  );
}
