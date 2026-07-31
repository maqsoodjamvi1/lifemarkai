import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { initSentry } from "./lib/monitoring/sentry";

// Sentry starts here because getRouter() is the one entry point the TanStack
// Start plugin calls on BOTH sides - client hydration and each SSR render - so a
// single call site covers both without a separate server bootstrap file. It
// no-ops entirely when SENTRY_DSN is unset, and is idempotent, so calling it per
// render costs one boolean check.
initSentry(typeof document === "undefined" ? "server" : "client");

// The TanStack Start Vite plugin calls getRouter() to build the app router.
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
  });
}
