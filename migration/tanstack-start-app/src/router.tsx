import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// The TanStack Start Vite plugin calls getRouter() to build the app router.
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
  });
}
