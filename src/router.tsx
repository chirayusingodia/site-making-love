import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Prefetch a route's JS chunk the moment a user shows intent —
    // hovering a link on desktop, touchstart on mobile — so the code for
    // the next page is already parsed before they finish tapping. Turns
    // most in-app navigations (plans → plan detail → checkout) near-
    // instant. Data still flows through React Query with its own caching;
    // staleTime 0 keeps loader data honest, the browser caches the chunk.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
