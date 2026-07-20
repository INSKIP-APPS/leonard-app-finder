import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, LogIn, ArrowLeft, CheckCircle2 } from "lucide-react";
import { signIn, resetPassword, useSession } from "@/services/auth";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

// Adresse de contact pour les demandes d'accès (UX-011).
const CONTACT_EMAIL = "paul.desaintecroix@inskip.fr";

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { session, loading: sessionLoading } = useSession();
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Si déjà connecté, on repart vers la destination demandée (ou le cockpit).
  useEffect(() => {
    if (!sessionLoading && session) navigate({ to: redirect || "/" });
  }, [session, sessionLoading, navigate, redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    setPending(false);
    if (error) setError(error);
    else navigate({ to: redirect || "/" });
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Saisissez d'abord votre adresse email.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await resetPassword(email.trim());
    setPending(false);
    if (error) setError(error);
    else setResetSent(true);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-gradient-to-br from-[#ece8fb] to-[#e2f7fc] px-4">
      <div className="w-full max-w-md">
        {/* Marque */}
        <div className="mb-6 flex items-center justify-center gap-2 text-navy">
          <div className="w-10 h-10 rounded-lg bg-navy text-white flex items-center justify-center font-bold text-lg">
            L
          </div>
          <div className="text-lg font-bold tracking-tight">Leonard · Veille financements</div>
        </div>

        <div className="rounded-2xl border border-border bg-white shadow-lg p-8">
          {mode === "reset" ? (
            resetSent ? (
              <div className="text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <h1 className="text-lg font-semibold text-navy mb-1">Email envoyé</h1>
                <p className="text-sm text-muted">
                  Si un compte existe pour <strong className="text-text">{email.trim()}</strong>,
                  un lien de réinitialisation vient de vous être envoyé.
                </p>
                <button
                  onClick={() => {
                    setMode("login");
                    setResetSent(false);
                    setError(null);
                  }}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-ink hover:text-navy"
                >
                  <ArrowLeft className="w-4 h-4" /> Retour à la connexion
                </button>
              </div>
            ) : (
              <form onSubmit={onReset} className="space-y-4">
                <div>
                  <h1 className="text-xl font-semibold text-navy mb-1">Mot de passe oublié</h1>
                  <p className="text-sm text-muted mb-4">
                    Saisissez votre email : nous vous enverrons un lien de réinitialisation.
                  </p>
                  <label htmlFor="reset-email" className="block text-xs font-semibold text-text mb-1.5">
                    Adresse email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom.nom@entreprise.fr"
                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg bg-[#fbfbfd] text-sm focus:outline-none focus:border-sky focus-visible:ring-2 focus-visible:ring-sky/40 focus:bg-white"
                  />
                </div>
                {error && (
                  <div
                    role="alert"
                    className="rounded-lg bg-[var(--color-destructive)]/10 border border-[var(--color-destructive)]/30 text-sm text-[var(--color-destructive)] px-3 py-2.5"
                  >
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Envoyer le lien
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-muted hover:text-navy"
                >
                  <ArrowLeft className="w-4 h-4" /> Retour à la connexion
                </button>
              </form>
            )
          ) : (
            <>
              <h1 className="text-xl font-semibold text-navy mb-1">Connexion</h1>
              <p className="text-sm text-muted mb-6">
                Accès réservé aux comptes autorisés par INSKIP et Leonard.
              </p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-text mb-1.5">
                    Adresse email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom.nom@entreprise.fr"
                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg bg-[#fbfbfd] text-sm focus:outline-none focus:border-sky focus-visible:ring-2 focus-visible:ring-sky/40 focus:bg-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="block text-xs font-semibold text-text">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("reset");
                        setError(null);
                      }}
                      className="text-[11px] font-medium text-sky-ink hover:text-navy"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg bg-[#fbfbfd] text-sm focus:outline-none focus:border-sky focus-visible:ring-2 focus-visible:ring-sky/40 focus:bg-white"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-lg bg-[var(--color-destructive)]/10 border border-[var(--color-destructive)]/30 text-sm text-[var(--color-destructive)] px-3 py-2.5"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pending || !email || !password}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {pending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Connexion…
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" /> Se connecter
                    </>
                  )}
                </button>
              </form>

              <p className="text-xs text-muted mt-6 text-center">
                Pas de compte ?{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=Demande d'accès Leonard Veille AAP`}
                  className="font-medium text-sky-ink hover:text-navy"
                >
                  Demandez une invitation
                </a>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
