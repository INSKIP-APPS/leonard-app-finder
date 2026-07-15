import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Target,
  Layers,
  Users as UsersIcon,
  MapPin,
  Sparkles,
  Edit3,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { getProjetV3, getProgramme, getProjetAaps, runVeille, marquerAapVu } from "@/services/programmes";
import { getAaps } from "@/services/data-store";
import type { ProjetV3, ProjetStatut, ProgrammeId } from "@/types/programme";
import type { ProjetAap } from "@/services/programmes";
import { STATUT_LABEL, STATUT_TONE } from "@/types/programme";
import { FicheAap } from "@/components/FicheAap";
import { NewProjetModal } from "@/components/NewProjetModal";
import { useProfil } from "@/services/auth";

export const Route = createFileRoute("/projets/$id")({
  head: () => ({ meta: [{ title: "Fiche projet — Leonard Veille AAP" }] }),
  component: FicheProjetPage,
});

function FicheProjetPage() {
  const { id } = Route.useParams();
  const [selectedAapId, setSelectedAapId] = useState<string | null>(null);

  const { data: projet, isLoading } = useQuery({
    queryKey: ["projet-v3", id],
    queryFn: () => getProjetV3(id),
  });
  const { data: programme } = useQuery({
    queryKey: ["programme", projet?.programme_id],
    queryFn: () => (projet?.programme_id ? getProgramme(projet.programme_id) : null),
    enabled: !!projet?.programme_id,
  });
  // Charge tous les AAP en cache (déjà utilisé ailleurs) et sélectionne l'AAP courant
  const { data: allAaps = [] } = useQuery({
    queryKey: ["aaps"],
    queryFn: () => getAaps(),
    staleTime: 10 * 60_000,
  });
  const selectedAap = selectedAapId
    ? allAaps.find((a) => a.id === selectedAapId) ?? null
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    );
  }
  if (!projet) {
    return (
      <div className="max-w-lg mx-auto text-center pt-16">
        <h2 className="text-lg font-semibold text-navy">Projet introuvable</h2>
        <Link to="/" className="mt-6 inline-block text-sm text-sky-ink font-semibold">
          ← Retour au cockpit
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Fil d'Ariane */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/" className="hover:text-navy">
          Cockpit
        </Link>
        <ChevronRight className="w-3 h-3" />
        {programme && (
          <>
            <Link
              to="/programmes/$id"
              params={{ id: programme.id }}
              className="hover:text-navy"
            >
              Programme {programme.nom}
            </Link>
            <ChevronRight className="w-3 h-3" />
          </>
        )}
        <span className="text-text font-semibold">{projet.nom}</span>
      </div>

      {programme && (
        <Link
          to="/programmes/$id"
          params={{ id: programme.id }}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-navy -mt-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Programme {programme.nom}
        </Link>
      )}

      {/* Hero fiche projet */}
      <ProjetHero projet={projet} programme={programme} />

      {/* Grille : résumé (gauche) + veille AAP (droite) */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        <ProjetLeft projet={projet} />
        <VeilleRight projet={projet} onSelectAap={setSelectedAapId} />
      </div>

      <FicheAap aap={selectedAap} onClose={() => setSelectedAapId(null)} />
    </div>
  );
}

function ProjetHero({
  projet,
  programme,
}: {
  projet: ProjetV3;
  programme: { id: ProgrammeId; nom: string; couleur: string | null } | null | undefined;
}) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { profil } = useProfil();
  const canEdit = profil?.role === "admin" || profil?.role === "editeur";

  async function relancer() {
    setRunning(true);
    setMsg(null);
    const r = await runVeille(projet.id);
    setRunning(false);
    if (r.ok) {
      const s = r.stats as { aap_ajoutes?: number; aap_ecartes?: number } | undefined;
      setMsg({
        kind: "ok",
        text: `Veille lancée · ${s?.aap_ajoutes ?? 0} retenus, ${s?.aap_ecartes ?? 0} écartés.`,
      });
      qc.invalidateQueries({ queryKey: ["projet-aaps", projet.id] });
      qc.invalidateQueries({ queryKey: ["projet-v3", projet.id] });
    } else {
      setMsg({ kind: "err", text: r.message ?? "Échec de la veille." });
    }
    setTimeout(() => setMsg(null), 6000);
  }
  return (
    <div className="relative bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{
          background: `linear-gradient(180deg, ${programme?.couleur ?? "#00B7E0"}, #2A1A6E)`,
        }}
      />
      <div className="p-6 md:p-7 pl-8 md:pl-9 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-navy tracking-tight mb-2">
            {projet.nom}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {programme && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{
                  background: `${programme.couleur ?? "#2A1A6E"}18`,
                  color: programme.couleur ?? "#2A1A6E",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: programme.couleur ?? "#2A1A6E" }}
                />
                Programme {programme.nom}
              </span>
            )}
            {projet.statut && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${STATUT_TONE[projet.statut as ProjetStatut]}`}
              >
                {STATUT_LABEL[projet.statut as ProjetStatut]}
              </span>
            )}
            {projet.sponsor && (
              <span className="text-xs text-muted">
                Sponsor : <strong className="text-text">{projet.sponsor}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button
              onClick={relancer}
              disabled={running}
              className="inline-flex items-center gap-1.5 border border-border-strong px-3 py-2 rounded-md text-xs font-semibold text-muted bg-white hover:border-navy hover:text-navy disabled:opacity-50 transition"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {running ? "Veille en cours…" : "Relancer la veille"}
            </button>
            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 border border-border-strong px-3 py-2 rounded-md text-xs font-semibold text-muted bg-white hover:border-navy hover:text-navy transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Éditer
              </button>
            )}
          </div>
          {msg && (
            <div
              className={`text-[11px] px-2 py-1 rounded flex items-center gap-1.5 ${msg.kind === "ok" ? "text-emerald-700 bg-emerald-50" : "text-orange-700 bg-orange-50"}`}
            >
              {msg.kind === "ok" ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              {msg.text}
            </div>
          )}
        </div>
      </div>
      {editOpen && programme && (
        <NewProjetModal
          mode="edit"
          projet={projet}
          programmeId={programme.id}
          programmeNom={programme.nom}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

function ProjetLeft({ projet }: { projet: ProjetV3 }) {
  const secteurs = projet.data?.secteurs ?? [];
  const thematiques = projet.data?.thematiques ?? [];
  const localisation = projet.data?.localisation ?? [];
  const consortium = projet.data?.consortium;
  const trlVise = projet.data?.trl_vise;
  const besoin = projet.data?.besoin_financement;
  const typeActeur = projet.data?.type_acteur;

  return (
    <div className="space-y-4">
      {/* Description */}
      <Card>
        <div className="p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
            Le projet en bref
          </h3>
          <p className="text-sm text-text leading-relaxed">{projet.description}</p>
        </div>
      </Card>

      {/* Porteur */}
      {projet.porteurs?.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 flex items-center gap-1.5">
              <UsersIcon className="w-3.5 h-3.5" /> Porteur{projet.porteurs.length > 1 ? "s" : ""}
            </h3>
            <div className="space-y-2">
              {projet.porteurs.map((p) => (
                <div key={p.nom} className="flex items-center gap-3">
                  <Avatar name={p.nom} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text">{p.nom}</div>
                    <div className="text-[11px] text-muted">
                      {p.role} · {p.entite}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Périmètre de la veille */}
      <Card>
        <div className="p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Périmètre de la veille
          </h3>

          {secteurs.length > 0 && (
            <KV label="Secteurs">
              <PillList items={secteurs} tone="sky" />
            </KV>
          )}
          {thematiques.length > 0 && (
            <KV label="Thématiques">
              <PillList items={thematiques} tone="grey" />
            </KV>
          )}
          {projet.mots_cles?.length > 0 && (
            <KV label="Mots-clés matching">
              <div className="text-xs text-muted leading-relaxed">
                {projet.mots_cles.join(" · ")}
              </div>
            </KV>
          )}
        </div>
      </Card>

      {/* Maturité & besoins */}
      <Card>
        <div className="p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Maturité &amp; besoins
          </h3>

          {projet.trl != null && (
            <KV label="Maturité (TRL)">
              <TrlTrack current={projet.trl} target={trlVise ?? null} />
            </KV>
          )}
          {typeActeur && (
            <KV label="Type d'acteur">
              <div className="text-sm text-text">{typeActeur}</div>
            </KV>
          )}
          {localisation.length > 0 && (
            <KV label="Localisation">
              <div className="flex items-center gap-1.5 text-sm text-text">
                <MapPin className="w-3.5 h-3.5 text-muted" />
                {localisation.join(" · ")}
              </div>
            </KV>
          )}
          {besoin && (
            <KV label="Besoin de financement">
              <div className="text-sm text-text">{besoin}</div>
            </KV>
          )}
          {consortium && (
            <KV label="Consortium">
              <div className="text-sm text-text capitalize">
                {consortium === "ouvert"
                  ? "Ouvert"
                  : consortium === "ferme"
                    ? "Fermé"
                    : "Non applicable"}
                {projet.data?.partenaires && (
                  <span className="text-muted text-xs ml-1">· {projet.data.partenaires}</span>
                )}
              </div>
            </KV>
          )}
        </div>
      </Card>
    </div>
  );
}

function VeilleRight({
  projet,
  onSelectAap,
}: {
  projet: ProjetV3;
  onSelectAap: (id: string) => void;
}) {
  const [tab, setTab] = useState<"recommandes" | "ecartes" | "candidatures">("recommandes");
  const qc = useQueryClient();

  const { data: propositions = [], isLoading } = useQuery({
    queryKey: ["projet-aaps", projet.id],
    queryFn: () => getProjetAaps(projet.id),
    enabled: !!projet.id,
  });

  const recommandes = propositions.filter((p) => p.actif && p.statut_user !== "ecarte");
  const ecartes = propositions.filter((p) => !p.actif || p.statut_user === "ecarte");
  const candidatures = propositions.filter((p) => ["candidate", "obtenu", "refuse"].includes(p.statut_user));
  const nbTotal = propositions.length;

  // « Nouveautés » = recommandations jamais ouvertes (vu=false).
  // Le default DB `vu=false` fait qu'un AAP nouvellement détecté par run-veille
  // apparaît ici automatiquement. Le clic sur la ligne le marque vu.
  const nouveautes = recommandes.filter((p) => !p.vu);
  const enVeille = recommandes.filter((p) => p.vu);

  async function handleSelect(row: ProjetAap) {
    onSelectAap(row.aap!.id);
    if (!row.vu) {
      try {
        await marquerAapVu(row.id);
        // Update en cache local pour éviter un aller-retour full refresh
        qc.setQueryData<ProjetAap[]>(["projet-aaps", projet.id], (prev) =>
          prev ? prev.map((r) => (r.id === row.id ? { ...r, vu: true } : r)) : prev,
        );
      } catch {
        // silencieux — pas critique pour l'UX si ça foire
      }
    }
  }

  return (
    <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="text-base font-semibold text-navy flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan" />
          AAP proposés par la veille
          {projet.derniere_veille_le && (
            <span className="ml-auto text-[11px] font-normal text-muted">
              Dernière veille : {new Date(projet.derniere_veille_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          )}
        </h2>
        <p className="text-xs text-muted mt-1">
          Croisement automatique du projet avec les aides ouvertes — cliquez « Relancer la veille »
          pour actualiser.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 px-5 border-b border-border">
        {[
          { key: "recommandes" as const, label: "Recommandés", count: recommandes.length, badge: nouveautes.length },
          { key: "ecartes" as const, label: "Écartés", count: ecartes.length, badge: 0 },
          { key: "candidatures" as const, label: "Candidatures", count: candidatures.length, badge: 0 },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-3 py-3 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === t.key
                ? "text-navy border-cyan"
                : "text-muted border-transparent hover:text-text"
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${tab === t.key ? "bg-cyan text-white" : "bg-bg border border-border text-muted"}`}>
              {t.count}
            </span>
            {t.badge > 0 && (
              <span
                className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] text-[9px] font-bold rounded-full px-1 bg-pink text-white"
                title={`${t.badge} nouveauté${t.badge > 1 ? "s" : ""}`}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {isLoading ? (
        <div className="p-10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        </div>
      ) : nbTotal === 0 ? (
        <VeilleEmpty projet={projet} />
      ) : tab === "recommandes" ? (
        <RecommandesContent
          nouveautes={nouveautes}
          enVeille={enVeille}
          onSelect={handleSelect}
        />
      ) : tab === "ecartes" ? (
        ecartes.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">Aucun AAP écarté.</div>
        ) : (
          <div>
            {ecartes.slice(0, 30).map((p) => (
              <AapRow key={p.id} p={p} onSelect={() => onSelectAap(p.aap!.id)} />
            ))}
          </div>
        )
      ) : candidatures.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">Aucune candidature en cours.</div>
      ) : (
        <div>
          {candidatures.slice(0, 30).map((p) => (
            <AapRow key={p.id} p={p} onSelect={() => onSelectAap(p.aap!.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecommandesContent({
  nouveautes,
  enVeille,
  onSelect,
}: {
  nouveautes: ProjetAap[];
  enVeille: ProjetAap[];
  onSelect: (row: ProjetAap) => void;
}) {
  if (nouveautes.length === 0 && enVeille.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted">
        Aucune recommandation active — relancez la veille pour rafraîchir.
      </div>
    );
  }
  return (
    <div>
      {nouveautes.length > 0 && (
        <>
          <div className="px-5 py-2.5 bg-[#FFF3F6] border-b border-[#FBD5DE] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-pink live-dot" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-pink">
              Nouveautés depuis la dernière visite
            </span>
            <span className="text-[10px] text-muted ml-auto">
              {nouveautes.length} AAP · cliquez pour consulter
            </span>
          </div>
          {nouveautes.slice(0, 30).map((p) => (
            <AapRow key={p.id} p={p} isNew onSelect={() => onSelect(p)} />
          ))}
        </>
      )}
      {enVeille.length > 0 && (
        <>
          <div className="px-5 py-2.5 bg-bg border-b border-border flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
              En veille
            </span>
            <span className="text-[10px] text-muted ml-auto">
              {enVeille.length} AAP déjà consultés
            </span>
          </div>
          {enVeille.slice(0, 30).map((p) => (
            <AapRow key={p.id} p={p} onSelect={() => onSelect(p)} />
          ))}
        </>
      )}
    </div>
  );
}

function VeilleEmpty({ projet }: { projet: ProjetV3 }) {
  return (
    <div className="p-10 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-cyan-soft flex items-center justify-center mb-4">
        <Sparkles className="w-6 h-6 text-cyan-ink" />
      </div>
      <h3 className="text-sm font-semibold text-navy mb-1">
        La veille n'a pas encore analysé ce projet
      </h3>
      <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
        Cliquez sur <span className="font-semibold">« Relancer la veille »</span> en haut pour
        obtenir les AAP compatibles.
      </p>
      <div className="mt-4 text-[11px] text-muted">
        <span className="font-medium">Périmètre pris en compte :</span>{" "}
        {(projet.data?.secteurs ?? []).join(" · ") || "à compléter"} ·{" "}
        {projet.mots_cles?.length ?? 0} mots-clés
      </div>
    </div>
  );
}

function AapRow({
  p,
  onSelect,
  isNew = false,
}: {
  p: ProjetAap;
  onSelect: () => void;
  isNew?: boolean;
}) {
  const aap = p.aap;
  if (!aap) return null;
  const jours = aap.date_cloture
    ? Math.ceil((new Date(aap.date_cloture).getTime() - Date.now()) / 86400000)
    : null;
  const scoreColor =
    p.score >= 70 ? "bg-emerald-500" : p.score >= 50 ? "bg-amber-500" : "bg-muted";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid grid-cols-[46px_1fr] gap-3 items-start px-5 py-4 border-b border-border w-full text-left hover:bg-[#FBFBFD] transition cursor-pointer ${isNew ? "bg-[#FFF9FB]" : ""}`}
    >
      <div
        className={`w-11 h-11 rounded-lg flex items-center justify-center text-white font-bold text-sm tabular-nums ${scoreColor}`}
      >
        {p.score}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-navy leading-snug">{aap.titre}</div>
        {(isNew || p.tier === "prioritaire" || !p.actif) && (
          <div className="flex items-center gap-1.5 mt-1.5 mb-1 flex-wrap">
            {isNew && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-pink text-white">
                Nouveau
              </span>
            )}
            {p.tier === "prioritaire" && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-emerald-100 text-emerald-700">
                Prioritaire
              </span>
            )}
            {!p.actif && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-bg border border-border text-muted">
                Écarté
              </span>
            )}
          </div>
        )}
        <div className="text-[11px] text-muted flex items-center gap-2 flex-wrap mb-2">
          <span className="font-medium">{aap.source}</span>
          {aap.programme && <span>· {aap.programme}</span>}
          {jours !== null && jours >= 0 && (
            <span className={`${jours < 30 ? "text-pink font-semibold" : ""}`}>· J-{jours}</span>
          )}
        </div>
        {p.raison && (
          <div className="text-xs text-text leading-relaxed flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>{p.raison}</span>
          </div>
        )}
        {p.motif_ecart && !p.actif && (
          <div className="text-xs text-muted italic leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
            <span>{p.motif_ecart}</span>
          </div>
        )}
        <div className="text-[10px] text-muted mt-1">
          Détecté le{" "}
          {new Date(p.detecte_le).toLocaleDateString("fr-FR")} · réévalué le{" "}
          {new Date(p.evalue_le).toLocaleDateString("fr-FR")}
        </div>
      </div>
    </button>
  );
}

// ── Sous-composants ────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      {children}
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-muted mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function PillList({ items, tone }: { items: string[]; tone: "sky" | "grey" }) {
  const cls =
    tone === "sky"
      ? "bg-[#E2F7FC] text-sky-ink"
      : "bg-bg border border-border text-muted";
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className={`text-[11px] font-medium px-2 py-0.5 rounded ${cls}`}>
          {i}
        </span>
      ))}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
  return (
    <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-sky to-navy text-white flex items-center justify-center text-xs font-bold">
      {initials || "?"}
    </div>
  );
}

function TrlTrack({ current, target }: { current: number; target: number | null }) {
  return (
    <div>
      <div className="flex items-center gap-1 mt-1">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
          const done = n < current;
          const cur = n === current;
          const tgt = target != null && n === target && n !== current;
          const cls = cur
            ? "bg-sky text-white border-sky"
            : tgt
              ? "bg-purple text-white border-purple"
              : done
                ? "bg-cyan-soft border-cyan-soft text-sky-ink"
                : "bg-bg border-border text-muted";
          return (
            <span
              key={n}
              className={`w-6 h-6 rounded-md border text-[10.5px] font-bold flex items-center justify-center tabular-nums ${cls}`}
            >
              {n}
            </span>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2 text-[10px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-sky" /> actuel : {current}
        </span>
        {target != null && (
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-purple" /> visé : {target}
          </span>
        )}
      </div>
    </div>
  );
}
