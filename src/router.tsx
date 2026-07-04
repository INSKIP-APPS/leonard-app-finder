import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // La base AAP (~2 500 lignes jsonb) change au rythme des crons de scraping
  // (au mieux quotidien) : inutile de la re-télécharger à chaque navigation ou
  // retour d'onglet. 10 min de fraîcheur suffisent largement.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10 * 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

// Enregistrement du type du router pour l'inférence globale (Link, useParams…).
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
