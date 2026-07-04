import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Building2, ExternalLink } from "lucide-react";
import { getAaps } from "@/services/data-store";
import {
  aapsForEntite,
  aapsForFiliale,
  aapsGeneriquesBU,
  joursRestants,
  type Entite,
  type Filiale,
  type EntiteProjet,
} from "@/utils/scoring-engine";
import type { AAP } from "@/types/aap";
import { fmtDate, budgetCompact } from "@/utils/format";
import { TierBadge } from "@/utils/tier";
import { KpiCard } from "@/components/KpiCard";
import entitesData from "@/data/entites.json";

export const Route = createFileRoute("/push")({
  head: () => ({
    meta: [
      { title: "Veille push — Leonard Veille AAP" },
      {
        name: "description",
        content: "Veille automatique des AAP par entité VINCI : BU, filiales, projets.",
      },
    ],
  }),
  component: Push,
});

const ALL_ENTITES = entitesData as unknown as Entite[];
const STORAGE_KEY = "leonard_entites_profils";
const TOP_N = 25; // nb d'AAP affichés par section (les meilleurs matchs)

type ProfilEdits = Record<string, Partial<Entite>>;

function loadEdits(): ProfilEdits {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

// ── Helpers d'affichage ──────────────────────────────────────────────
function echeanceLabel(iso: string | null): { text: string; cls: string } {
  const j = joursRestants(iso);
  if (j == null) return { text: `Clôture ${fmtDate(iso)}`, cls: "text-muted" };
  if (j < 0) return { text: "Clôturé", cls: "text-muted" };
  const cls = j < 30 ? "text-pink" : j < 60 ? "text-orange-600" : "text-emerald-600";
  return { text: `Clôture J-${j}`, cls };
}

function Push() {
  const [activeId, setActiveId] = useState(ALL_ENTITES[0].id);
  const [edits, setEdits] = useState<ProfilEdits>({});
  const [editing, setEditing] = useState(false);

  const { data: aaps = [], isLoading } = useQuery({ queryKey: ["aaps"], queryFn: () => getAaps() });

  useEffect(() => {
    setEdits(loadEdits());
  }, []);

  const entites: Entite[] = ALL_ENTITES.map((e) => ({ ...e, ...(edits[e.id] || {}) }));
  const entite = entites.find((e) => e.id === activeId)!;

  const list = useMemo(() => aapsForEntite(aaps, entite), [aaps, entite]);

  const { totalDispatch, scoreMoyen } = useMemo(() => {
    const all = entites.flatMap((e) => aapsForEntite(aaps, e));
    const moy = all.length ? Math.round(all.reduce((s, x) => s + x.score, 0) / all.length) : 0;
    return { totalDispatch: all.length, scoreMoyen: moy };
  }, [aaps, entites]);

  const saveEntite = (next: Partial<Entite>) => {
    const newEdits = { ...edits, [activeId]: { ...(edits[activeId] || {}), ...next } };
    setEdits(newEdits);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newEdits));
    setEditing(false);
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl">Veille push — AAP par entité</h1>
        <div className="text-sm text-muted mt-1">
          Chaque entité reçoit les AAP réels automatiquement scorés selon son profil.
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4 mb-6 max-w-2xl">
        <div className="col-span-2">
          <KpiCard label="AAP dispatchés (toutes entités)" value={totalDispatch} />
        </div>
        <div className="col-span-2">
          <KpiCard label="Score moyen de pertinence" value={`${scoreMoyen}%`} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {entites.map((e) => {
          const active = e.id === activeId;
          return (
            <button
              key={e.id}
              onClick={() => {
                setActiveId(e.id);
                setEditing(false);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                active
                  ? "bg-navy text-white"
                  : "border border-navy text-navy bg-white hover:bg-[var(--color-accent)]"
              }`}
            >
              {e.nom}
            </button>
          );
        })}
      </div>

      <ProfilCard
        entite={entite}
        editing={editing}
        onEdit={() => setEditing(true)}
        onCancel={() => setEditing(false)}
        onSave={saveEntite}
      />

      {isLoading ? (
        <div className="card-flat p-8 text-center text-muted">Chargement des appels à projets…</div>
      ) : entite.filiales && entite.filiales.length > 0 ? (
        <div className="space-y-5">
          {entite.filiales.map((f) => (
            <FilialeSection key={f.id} aaps={aaps} entite={entite} filiale={f} />
          ))}
          <GeneriqueSection aaps={aaps} entite={entite} />
        </div>
      ) : (
        <div className="card-flat p-5">
          <h3 className="text-base mb-4">
            {list.length} AAP sélectionnés pour {entite.nom}
          </h3>
          <div className="divide-y divide-border">
            {list.slice(0, TOP_N).map(({ aap, score }) => (
              <AapRow key={aap.id} aap={aap} score={score} />
            ))}
            {list.length === 0 && (
              <div className="text-sm text-muted py-6 text-center">
                Aucun AAP pertinent pour cette entité.
              </div>
            )}
            {list.length > TOP_N && (
              <div className="text-xs text-muted pt-3 text-center">
                + {list.length - TOP_N} autres AAP pertinents
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function FilialeSection({
  aaps,
  entite,
  filiale,
}: {
  aaps: AAP[];
  entite: Entite;
  filiale: Filiale;
}) {
  const items = useMemo(() => aapsForFiliale(aaps, entite, filiale), [aaps, entite, filiale]);
  return (
    <div className="card-flat p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-navy" />
          <h3 className="text-base font-semibold text-navy">{filiale.nom}</h3>
          <span className="text-xs text-muted">· {filiale.secteurs.join(", ")}</span>
        </div>
        <span className="text-xs text-muted">{items.length} AAP</span>
      </div>
      <div className="divide-y divide-border">
        {items.slice(0, TOP_N).map(({ aap, score, matchedProjets }) => (
          <AapRow key={aap.id} aap={aap} score={score} projets={matchedProjets} />
        ))}
        {items.length === 0 && (
          <div className="text-sm text-muted py-4 text-center">
            Aucun AAP pertinent pour {filiale.nom}.
          </div>
        )}
        {items.length > TOP_N && (
          <div className="text-xs text-muted pt-3 text-center">
            + {items.length - TOP_N} autres AAP pertinents
          </div>
        )}
      </div>
    </div>
  );
}

function GeneriqueSection({ aaps, entite }: { aaps: AAP[]; entite: Entite }) {
  const items = useMemo(() => aapsGeneriquesBU(aaps, entite), [aaps, entite]);
  if (items.length === 0) return null;
  return (
    <div className="card-flat p-5 border-dashed">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-navy">Générique {entite.nom}</h3>
          <div className="text-xs text-muted mt-0.5">
            AAP pertinents pour toute la BU, sans filiale cible précise.
          </div>
        </div>
        <span className="text-xs text-muted">{items.length} AAP</span>
      </div>
      <div className="divide-y divide-border">
        {items.slice(0, TOP_N).map(({ aap, score }) => (
          <AapRow key={aap.id} aap={aap} score={score} />
        ))}
        {items.length > TOP_N && (
          <div className="text-xs text-muted pt-3 text-center">
            + {items.length - TOP_N} autres AAP pertinents
          </div>
        )}
      </div>
    </div>
  );
}

function AapRow({ aap, score, projets }: { aap: AAP; score: number; projets?: EntiteProjet[] }) {
  const ech = echeanceLabel(aap.date_cloture);
  return (
    <a
      href={aap.lien_officiel}
      target="_blank"
      rel="noreferrer"
      className="w-full flex items-center gap-4 py-3 text-left hover:bg-bg/50 px-2 -mx-2 rounded"
    >
      <div className="shrink-0 w-10 text-center">
        <div className="text-base font-bold text-navy tabular-nums leading-none">{score}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-navy truncate">{aap.titre}</div>
        <div className="text-xs text-muted mt-0.5">
          {aap.programme}
          {aap.cluster && <> · {aap.cluster}</>}
          {" · "}TRL {aap.trl_min ?? "?"}–{aap.trl_max ?? "?"}
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {aap.thematiques.slice(0, 2).map((t) => (
            <span key={t} className="px-2 py-0.5 rounded bg-muted text-text text-[11px]">
              {t}
            </span>
          ))}
          {projets &&
            projets.map((p) => (
              <span
                key={p.id}
                className="px-2 py-0.5 rounded bg-[#E6F1FB] text-navy text-[11px] font-medium"
              >
                Projet : {p.nom}
              </span>
            ))}
        </div>
      </div>
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        <TierBadge score={score} />
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#F3E8FF] text-purple">
          {aap.type_action}
        </span>
      </div>
      <div className="shrink-0 text-right w-28">
        <div className="text-xs font-semibold text-navy">{budgetCompact(aap)}</div>
        <div className={`text-[11px] font-medium ${ech.cls}`}>{ech.text}</div>
      </div>
      <ExternalLink className="w-4 h-4 text-muted shrink-0" />
    </a>
  );
}

function ProfilCard({
  entite,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  entite: Entite;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (next: Partial<Entite>) => void;
}) {
  const [desc, setDesc] = useState(entite.description_profil);
  const [secteurs, setSecteurs] = useState<string[]>(entite.secteurs_prioritaires);
  const [motsCles, setMotsCles] = useState(entite.mots_cles_metier.join(", "));

  useEffect(() => {
    setDesc(entite.description_profil);
    setSecteurs(entite.secteurs_prioritaires);
    setMotsCles(entite.mots_cles_metier.join(", "));
  }, [entite]);

  const ALL_SECTEURS = [
    "Construction",
    "Numérique",
    "Énergie",
    "Mobilité",
    "Eau",
    "Environnement",
    "Matériaux",
    "Industrie",
  ];

  return (
    <div className="card-flat p-5 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="label-caps">Profil de l'entité</div>
          <div className="text-lg font-semibold text-navy mt-1">{entite.nom}</div>
        </div>
        {!editing && (
          <button
            onClick={onEdit}
            className="text-sm border border-navy text-navy px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-[var(--color-accent)]"
          >
            <Pencil className="w-3.5 h-3.5" /> Modifier le profil
          </button>
        )}
      </div>

      {!editing && (
        <>
          <p className="text-sm text-text leading-relaxed">{entite.description_profil}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {entite.secteurs_prioritaires.map((s) => (
              <span
                key={s}
                className="px-2 py-1 rounded bg-[#E6F1FB] text-navy text-xs font-medium"
              >
                {s}
              </span>
            ))}
            <span className="px-2 py-1 rounded bg-[#EEF2FF] text-navy text-xs font-medium">
              {entite.trl_habituel}
            </span>
            {entite.mots_cles_metier.map((m) => (
              <span key={m} className="px-2 py-1 rounded bg-gray-100 text-text text-xs">
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      {editing && (
        <div className="space-y-3">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full min-h-[100px] px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-navy"
          />
          <div>
            <div className="label-caps mb-2">Secteurs prioritaires</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SECTEURS.map((s) => {
                const on = secteurs.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() =>
                      setSecteurs(on ? secteurs.filter((x) => x !== s) : [...secteurs, s])
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium ${on ? "bg-navy text-white" : "border border-border bg-white text-text"}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="label-caps mb-2">Mots-clés métier (séparés par des virgules)</div>
            <input
              value={motsCles}
              onChange={(e) => setMotsCles(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-navy"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-bg"
            >
              Annuler
            </button>
            <button
              onClick={() =>
                onSave({
                  description_profil: desc,
                  secteurs_prioritaires: secteurs,
                  mots_cles_metier: motsCles
                    .split(",")
                    .map((m) => m.trim())
                    .filter(Boolean),
                })
              }
              className="px-4 py-2 text-sm bg-navy text-white rounded-md hover:opacity-90"
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
