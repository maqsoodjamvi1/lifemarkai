import { createFileRoute } from "@tanstack/react-router";
import { redirectResponseWithStatus } from "@/lib/api/redirect";

/**
 * Compatibility route for `/api/integrations/openai/openapi/json`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * TanStack treats a dot in a filename as a PATH SEPARATOR, so `openapi.json.ts`
 * derives the URL `/api/integrations/openai/openapi/json` — NOT `.json`.
 * The real spec therefore lives in `openapi[.]json.ts` (the `[.]` escape yields a
 * literal dot), which serves the canonical `/api/integrations/openai/openapi.json`
 * that ChatGPT Actions fetch.
 *
 * This file was briefly emptied to 0 bytes during the migration, which BROKE THE
 * BUILD: the route generator scans src/routes and injects a `Route` export into
 * every file it finds; on an empty module that produced malformed code and the
 * generator threw, so no route tree was written and the app would not start
 * ("Error transforming route file …: SyntaxError: Missing semicolon").
 *
 * Rather than leave a build-breaking empty file, it now redirects to the
 * canonical URL. Deleting this file entirely is also fine — the generator is
 * happy either way. It is NOT the source of truth for the spec.
 */
export const Route = createFileRoute("/api/integrations/openai/openapi/json")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        redirectResponseWithStatus(
          "/api/integrations/openai/openapi.json",
          308,
          new URL(request.url).origin,
        ),
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
