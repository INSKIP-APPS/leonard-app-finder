import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/services/supabase";
import { authErrorFr } from "@/services/auth";

// Route d'atterrissage après un lien Supabase Auth (invitation, reset password,
// magic link). Le SDK Supabase parse automatiquement le hash `#access_token=...`
// et crée la session ; ici on propose de définir un mot de passe et on redirige.

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [ctxType, setCtxType] = useState<"invite" | "recovery" | "signin" | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // UX-003 : lien invalide/expiré ou absence de session → écran explicatif
  // (pas le formulaire de mot de passe, qui échouerait avec « session missing »).
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setError("Supabase non configuré.");
      setReady(true);
      return;
    }
    // Le SDK Supabase lit automatiquement le hash à l'initialisation.
    // On lit le type d'action depuis le hash pour adapter le message.
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const type = params.get("type");
    if (type === "invite") setCtxType("invite");
    else if (type === "recovery") setCtxType("recovery");
    else setCtxType("signin");

    // Erreur explicite renvoyée par Supabase (lien expiré, token invalide…)
    const err = params.get("error_description") || params.get("error");
    if (err) {
      const decoded = decodeURIComponent(err.replace(/\+/g, " "));
      setError(authErrorFr(decoded) ?? "Ce lien est invalide ou a expiré.");
      setLinkInvalid(true);
    }

    // Attend que la session soit résolue (SDK asynchrone)
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session && !err) {
        // Pas de session ET pas de token valide dans le lien → écran explicatif
        // (au lieu d'une redirection muette ou d'un formulaire qui échouera).
        setError("Ce lien est invalide ou a expiré. Demandez un nouveau lien pour continuer.");
        setLinkInvalid(true);
      }
      setReady(true);
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await supabase!.auth.updateUser({ password });
    setPending(false);
    if (error) setError(authErrorFr(error.message));
    else {
      setDone(true);
      setTimeout(() => navigate({ to: "/" }), 1200);
    }
  }

  if (!ready) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-gradient-to-br from-[#ece8fb] to-[#e2f7fc]">
        <Loader2 className="w-6 h-6 animate-spin text-navy" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-gradient-to-br from-[#ece8fb] to-[#e2f7fc] px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-navy">
          <div className="w-10 h-10 rounded-lg bg-navy text-white flex items-center justify-center font-bold text-lg">
            L
          </div>
          <div className="text-lg font-bold tracking-tight">Leonard · Veille financements</div>
        </div>

        <div className="rounded-2xl border border-border bg-white shadow-lg p-8">
          {linkInvalid ? (
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] mx-auto flex items-center justify-center">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-semibold text-navy">Lien invalide ou expiré</h1>
              <p className="text-sm text-muted">
                {error ?? "Ce lien n'est plus valable."} Les liens d'invitation et de
                réinitialisation expirent après un délai — demandez-en un nouveau.
              </p>
              <Link
                to="/login"
                className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 transition"
              >
                Retour à la connexion
              </Link>
            </div>
          ) : done ? (
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-semibold text-navy">Mot de passe défini</h1>
              <p className="text-sm text-muted">Redirection vers l'application…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1 text-navy">
                <KeyRound className="w-5 h-5" />
                <h1 className="text-xl font-semibold">
                  {ctxType === "invite"
                    ? "Bienvenue sur Leonard"
                    : ctxType === "recovery"
                      ? "Réinitialiser votre mot de passe"
                      : "Finaliser la connexion"}
                </h1>
              </div>
              <p className="text-sm text-muted mb-6">
                {ctxType === "invite"
                  ? "Choisissez un mot de passe pour finaliser la création de votre compte."
                  : "Définissez un nouveau mot de passe pour votre compte."}
              </p>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1.5">
                    Nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="8 caractères minimum"
                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg bg-[#fbfbfd] text-sm focus:outline-none focus:border-sky focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text mb-1.5">
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg bg-[#fbfbfd] text-sm focus:outline-none focus:border-sky focus:bg-white"
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
                  disabled={pending || !password || !password2}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {pending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" /> Définir le mot de passe
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
