// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

/**
 * Catch-all for unmatched /api/* paths.
 *
 * Phase 1: previously this ran legacy app/api handlers in the API worker via
 * `adapterHandlers`. All 203 API routes are now native TanStack routes, so the
 * worker (and its dependency on repoRoot/app/api) is gone. Anything reaching
 * here is genuinely an unknown endpoint → honest 404.
 */
const notFound = () =>
  Response.json({ error: "Not found", hint: "No API route matches this path." }, { status: 404 });

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: notFound, POST: notFound, PUT: notFound,
      PATCH: notFound, DELETE: notFound, OPTIONS: notFound, HEAD: notFound,
    },
  },
});
