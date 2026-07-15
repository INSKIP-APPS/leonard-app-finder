import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Loader2,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Play,
  Users,
  Database,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import {
  getScrapeLogs,
  getScrapeFrequency,
  setScrapeFrequency,
  runScrapeNow,
  dataSource,
  FREQUENCY_LABELS,
  type ScrapeFrequency,
  adminListUsers,
  adminSetRole,
  adminInviteUser,
  type AdminUser,
  type Role,
} from "@/services/data-store";
import { fmtDateHeure } from "@/utils/format";
import { useProfil, isAuthEnabled } from "@/services/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Leonard Veille AAP" },
      {
        name: "description",
        content: "Piloter la fréquence de scraping et suivre les exécutions de la veille.",
      },
    ],
  }),
  component: Admin,
});

// ── Garde admin : redirige les non-admin vers l'accueil ─────────────
function useAdminGuard() {
  const { profil, loading } = useProfil();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isAuthEnabled) return;
    if (loading) return;
    if (!profil || profil.role !== "admin") navigate({ to: "/" });
  }, [profil, loading, navigate]);
  return { profil, loading };
}

function Admin() {
  const { profil, loading } = useAdminGuard();
  const [tab, setTab] = useState<"sources" | "users">("sources");

  if (dataSource !== "supabase") {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl mb-2">Administration</h1>
        <div className="card-flat p-6 text-sm text-muted">
          Cette page pilote le scraping automatique hébergé sur Supabase. Elle nécessite une
          connexion Supabase active (mode actuel :{" "}
          <span className="font-medium text-text">local</span>).
        </div>
      </div>
    );
  }

  if (isAuthEnabled && (loading || !profil || profil.role !== "admin")) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl">Administration</h1>
        <div className="text-sm text-muted mt-1">
          Pilotez la veille automatique, ses exécutions et les accès à la plateforme.
        </div>
      </header>

      {/* Onglets */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("sources")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === "sources"
                ? "text-navy border-sky"
                : "text-muted border-transparent hover:text-text"
            }`}
          >
            <Database className="w-4 h-4" /> Sources &amp; scraping
          </button>
          <button
            onClick={() => setTab("users")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === "users"
                ? "text-navy border-sky"
                : "text-muted border-transparent hover:text-text"
            }`}
          >
            <Users className="w-4 h-4" /> Utilisateurs
          </button>
        </div>
      </div>

      {tab === "sources" && <ScrapingPanel />}
      {tab === "users" && <UsersPanel />}
    </div>
  );
}

// ── Onglet Sources & scraping ─────────────────────────────────────────
function ScrapingPanel() {
  const qc = useQueryClient();
  const { data: freq } = useQuery({ queryKey: ["scrapeFrequency"], queryFn: getScrapeFrequency });
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["scrapeLogs"],
    queryFn: () => getScrapeLogs(30),
  });

  const [selected, setSelected] = useState<ScrapeFrequency | "">("");
  const [savingFreq, setSavingFreq] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const currentFreq = freq?.frequency ?? null;
  const effectiveSelected = selected || currentFreq || "hebdo_lundi";

  const saveFreq = async () => {
    setSavingFreq(true);
    setMsg(null);
    try {
      await setScrapeFrequency(effectiveSelected as ScrapeFrequency);
      await qc.invalidateQueries({ queryKey: ["scrapeFrequency"] });
      setMsg({
        kind: "ok",
        text: `Fréquence mise à jour : ${FREQUENCY_LABELS[effectiveSelected as ScrapeFrequency]}.`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingFreq(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setMsg(null);
    try {
      const r = await runScrapeNow();
      if (r.ok) {
        setMsg({ kind: "ok", text: "Scraping lancé — la base et l'historique se mettent à jour." });
        setTimeout(() => qc.invalidateQueries({ queryKey: ["scrapeLogs"] }), 6000);
      } else {
        setMsg({ kind: "err", text: r.message ?? "Échec du scraping." });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`flex items-start gap-2 text-sm px-3 py-2 rounded-md ${msg.kind === "ok" ? "bg-[#E8F5F0] text-emerald-800" : "bg-[#FFF4E6] text-orange-700"}`}
        >
          {msg.kind === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-flat p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="w-4 h-4 text-navy" />
            <h2 className="text-base font-semibold text-navy">Fréquence du scraping</h2>
          </div>
          <p className="text-xs text-muted mb-4">
            Le robot interroge les portails de veille et met la base à jour automatiquement.
            {freq?.cron && (
              <>
                {" "}
                Expression cron actuelle : <code className="text-[11px]">{freq.cron}</code> (UTC).
              </>
            )}
          </p>
          <label className="block text-xs font-medium text-text mb-1.5">Périodicité</label>
          <select
            value={effectiveSelected}
            onChange={(e) => setSelected(e.target.value as ScrapeFrequency)}
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-navy"
          >
            {(Object.keys(FREQUENCY_LABELS) as ScrapeFrequency[]).map((k) => (
              <option key={k} value={k}>
                {FREQUENCY_LABELS[k]}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted mt-1.5">
            Heures en UTC (~8 h Paris l'été, ~7 h l'hiver). Actuel :{" "}
            <span className="font-medium text-text">
              {currentFreq ? FREQUENCY_LABELS[currentFreq] : "non planifié"}
            </span>
            .
          </p>
          <button
            onClick={saveFreq}
            disabled={savingFreq}
            className="mt-4 inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {savingFreq ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CalendarClock className="w-4 h-4" />
            )}
            Enregistrer la fréquence
          </button>
        </div>

        <div className="card-flat p-5">
          <div className="flex items-center gap-2 mb-1">
            <Play className="w-4 h-4 text-navy" />
            <h2 className="text-base font-semibold text-navy">Scraping manuel</h2>
          </div>
          <p className="text-xs text-muted mb-4">
            Lance immédiatement une récupération des appels à projets, sans attendre la prochaine
            exécution planifiée.
          </p>
          <button
            onClick={runNow}
            disabled={running}
            className="inline-flex items-center gap-2 bg-purple text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {running ? "Scraping en cours…" : "Lancer un scraping maintenant"}
          </button>
        </div>
      </div>

      <div className="card-flat p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-navy">Historique des exécutions</h2>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["scrapeLogs"] })}
            className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
          </button>
        </div>
        {loadingLogs ? (
          <div className="text-sm text-muted py-6 text-center">Chargement…</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">
            Aucune exécution enregistrée pour l'instant.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium">Statut</th>
                  <th className="py-2 px-3 font-medium text-right">Récupérés</th>
                  <th className="py-2 px-3 font-medium text-right">Nouveaux</th>
                  <th className="py-2 px-3 font-medium text-right">Mis à jour</th>
                  <th className="py-2 px-3 font-medium text-right">Clôturés</th>
                  <th className="py-2 pl-3 font-medium text-right">Durée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id} className="text-text">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDateHeure(l.run_at)}</td>
                    <td className="py-2 px-3">
                      {l.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> OK
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-orange-700"
                          title={l.error ?? ""}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Échec
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{l.fetched}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium text-navy">
                      {l.nouveaux}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{l.mis_a_jour}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{l.fermes}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-muted">
                      {l.duration_ms != null ? `${(l.duration_ms / 1000).toFixed(1)} s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Onglet Utilisateurs ───────────────────────────────────────────────
const ROLE_LABEL: Record<Role, string> = { admin: "Administrateur", editeur: "Éditeur", lecture: "Lecture" };
const ROLE_TONE: Record<Role, string> = {
  admin: "bg-[#ECE8FB] text-purple",
  editeur: "bg-[#E2F7FC] text-sky-ink",
  lecture: "bg-[#F0F0F5] text-muted",
};

function UsersPanel() {
  const qc = useQueryClient();
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: adminListUsers,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onRoleChange(user: AdminUser, role: Role) {
    if (role === user.role) return;
    try {
      await adminSetRole(user.id, role);
      await qc.invalidateQueries({ queryKey: ["adminUsers"] });
      setMsg({ kind: "ok", text: `${user.email} → ${ROLE_LABEL[role]}` });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`flex items-start gap-2 text-sm px-3 py-2 rounded-md ${msg.kind === "ok" ? "bg-[#E8F5F0] text-emerald-800" : "bg-[#FFF4E6] text-orange-700"}`}
        >
          {msg.kind === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="card-flat overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-navy flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Utilisateurs &amp; rôles
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {users.length} compte{users.length > 1 ? "s" : ""} · seuls les admins peuvent inviter et
              modifier les rôles.
            </p>
          </div>
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            <UserPlus className="w-4 h-4" /> Inviter un utilisateur
          </button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted py-8 text-center">Chargement…</div>
        ) : error ? (
          <div className="text-sm text-orange-700 py-8 text-center">
            Erreur : {error instanceof Error ? error.message : String(error)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border bg-[#FBFBFD]">
                  <th className="py-3 px-5 font-medium">Utilisateur</th>
                  <th className="py-3 px-3 font-medium">Entité</th>
                  <th className="py-3 px-3 font-medium">Rôle</th>
                  <th className="py-3 px-3 font-medium">Dernière connexion</th>
                  <th className="py-3 px-5 font-medium text-right">Créé le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#FBFBFD]">
                    <td className="py-3 px-5">
                      <div className="font-medium text-text">{u.nom || u.email.split("@")[0]}</div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </td>
                    <td className="py-3 px-3 text-text">{u.entite || "—"}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${ROLE_TONE[u.role]}`}
                        >
                          {ROLE_LABEL[u.role]}
                        </span>
                        <select
                          value={u.role}
                          onChange={(e) => onRoleChange(u, e.target.value as Role)}
                          className="text-xs border border-border-strong rounded px-2 py-1 bg-white focus:outline-none focus:border-navy"
                          title="Changer le rôle"
                        >
                          <option value="admin">Administrateur</option>
                          <option value="editeur">Éditeur</option>
                          <option value="lecture">Lecture</option>
                        </select>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-muted whitespace-nowrap">
                      {u.last_sign_in_at ? fmtDateHeure(u.last_sign_in_at) : "Jamais"}
                    </td>
                    <td className="py-3 px-5 text-right text-muted whitespace-nowrap">
                      {fmtDateHeure(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onInvited={(email) => {
            setMsg({ kind: "ok", text: `Invitation envoyée à ${email}` });
            qc.invalidateQueries({ queryKey: ["adminUsers"] });
          }}
        />
      )}
    </div>
  );
}

function InviteModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [entite, setEntite] = useState("");
  const [role, setRole] = useState<Role>("lecture");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErr(null);
    const r = await adminInviteUser({
      email: email.trim(),
      nom: nom.trim() || undefined,
      entite: entite.trim() || undefined,
      role,
    });
    setPending(false);
    if (!r.ok) setErr(r.message ?? "Échec de l'invitation.");
    else {
      onInvited(email.trim());
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-lg my-8 shadow-xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-border bg-gradient-to-br from-[#ECE8FB] to-[#E2F7FC]">
          <h2 className="text-lg font-semibold text-navy">Inviter un utilisateur</h2>
          <p className="text-xs text-muted mt-1">
            Un email d'invitation lui sera envoyé pour définir son mot de passe.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Adresse email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="prenom.nom@entreprise.fr"
              className="w-full px-3 py-2 border border-border-strong rounded-md text-sm bg-[#FBFBFD] focus:outline-none focus:border-sky focus:bg-white"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom">
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm bg-[#FBFBFD] focus:outline-none focus:border-sky focus:bg-white"
              />
            </Field>
            <Field label="Entité">
              <input
                value={entite}
                onChange={(e) => setEntite(e.target.value)}
                placeholder="Leonard, INSKIP…"
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm bg-[#FBFBFD] focus:outline-none focus:border-sky focus:bg-white"
              />
            </Field>
          </div>
          <Field label="Rôle initial">
            <div className="flex gap-2">
              {(["lecture", "editeur", "admin"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold border transition ${
                    role === r
                      ? "bg-navy text-white border-navy"
                      : "bg-white border-border-strong text-muted hover:border-sky hover:text-sky-ink"
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </Field>

          {err && (
            <div className="text-sm text-orange-700 bg-[#FFF4E6] px-3 py-2 rounded-md">{err}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-[#FBFBFD] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted hover:text-text"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={pending || !email}
            className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Envoyer l'invitation
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text mb-1.5">
        {label} {required && <span className="text-pink">*</span>}
      </label>
      {children}
    </div>
  );
}
