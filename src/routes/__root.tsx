import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import { Sidebar } from "../components/Sidebar";
import { SidebarProvider, useSidebar } from "../hooks/useSidebar";
import { useSession, isAuthEnabled } from "@/services/auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-navy">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted">Cette page n'existe pas.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-navy px-4 py-2 text-sm font-medium text-white"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Erreur de chargement</h1>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-navy px-4 py-2 text-sm font-medium text-white"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { title: "Leonard — Veille AAP" },
      {
        name: "description",
        content:
          "Plateforme de veille des Appels à Projets de financement public de l'innovation pour Leonard, le hub innovation du Groupe VINCI.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Routes publiques (plein écran, sans sidebar, sans AuthGate)
  const publicRoutes = ["/login", "/auth/callback"];
  const isPublicRoute = publicRoutes.includes(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <HeadContent />
      {isPublicRoute ? (
        <Outlet />
      ) : (
        <AuthGate>
          <SidebarProvider>
            <div className="min-h-screen bg-bg">
              <Sidebar />
              <Main />
            </div>
          </SidebarProvider>
        </AuthGate>
      )}
    </QueryClientProvider>
  );
}

/** Redirige vers /login si aucune session Supabase active. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session, loading } = useSession();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthEnabled) return; // Mode JSON local sans Supabase : pas d'auth
    if (!loading && !session) navigate({ to: "/login" });
  }, [session, loading, navigate]);

  // Invalide les caches react-query quand la session change (login/logout).
  // Sans ça, un cache vide obtenu avant login (RLS bloquait) reste 10 min
  // même après connexion et le cockpit apparaît sans tuiles programmes.
  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;
    if (prevUserId.current !== currentUserId) {
      prevUserId.current = currentUserId;
      if (currentUserId) qc.invalidateQueries();
    }
  }, [session, qc]);

  // Splash pendant que la session se charge
  if (isAuthEnabled && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Loader2 className="w-6 h-6 animate-spin text-navy" />
      </div>
    );
  }
  // Pendant la redirection, on n'affiche rien pour éviter le flash de l'app
  if (isAuthEnabled && !session) return null;

  return <>{children}</>;
}

function Main() {
  const { collapsed } = useSidebar();
  return (
    <main className={`transition-[margin] duration-300 ${collapsed ? "ml-[64px]" : "ml-[240px]"}`}>
      <div className="px-8 py-8">
        <Outlet />
      </div>
    </main>
  );
}
