import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, LogIn } from "lucide-react";
import { signIn, useSession } from "@/services/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si déjà connecté, on repart vers le tableau de bord
  useEffect(() => {
    if (!sessionLoading && session) navigate({ to: "/" });
  }, [session, sessionLoading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    setPending(false);
    if (error) setError(error);
    else navigate({ to: "/" });
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
          <h1 className="text-xl font-semibold text-navy mb-1">Connexion</h1>
          <p className="text-sm text-muted mb-6">
            Accès réservé aux comptes autorisés par INSKIP et Leonard.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">
                Adresse email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@entreprise.fr"
                className="w-full px-3 py-2.5 border border-border-strong rounded-lg bg-[#fbfbfd] text-sm focus:outline-none focus:border-sky focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">
                Mot de passe
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-border-strong rounded-lg bg-[#fbfbfd] text-sm focus:outline-none focus:border-sky focus:bg-white"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-[var(--color-destructive)]/10 border border-[var(--color-destructive)]/30 text-sm text-[var(--color-destructive)] px-3 py-2.5">
                {error === "Invalid login credentials"
                  ? "Email ou mot de passe incorrect."
                  : error}
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
            Pas de compte ? Contactez un administrateur pour recevoir une invitation.
          </p>
        </div>
      </div>
    </div>
  );
}
