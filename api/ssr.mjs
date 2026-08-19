// Vercel entrypoint for the TanStack Start server bundle.
//
// dist/server/server.js (created by vite build during Vercel's build step)
// exports a Web-standard fetch handler, not a listening server - the same
// artifact scripts/serve-tanstack.mjs hosts on the VPS. Vercel's Node runtime
// accepts a Web-API handler (Request in, Response out), so this file is just
// env mirroring plus a re-export. vercel.json rewrites every non-static path
// here; static assets win first because outputDirectory (dist/client) is
// checked before rewrites.
//
// Scope: /api/ai/chat + /api/ai/agent (local AI worker process) and Docker
// sandbox previews depend on VPS-local processes and degrade here. Production
// remains the Coolify deployment; this is the Vercel evaluation target from
// the adoption plan.

// NEXT_PUBLIC_* <-> VITE_* mirroring, same as serve-tanstack.mjs. Must happen
// before the entry import: src/lib/supabase/server.ts reads env at module top.
for (const base of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "APP_URL"]) {
  const next = "NEXT_PUBLIC_" + base;
    const vite = "VITE_" + base;
      if (process.env[next] && !process.env[vite]) process.env[vite] = process.env[next];
        if (process.env[vite] && !process.env[next]) process.env[next] = process.env[vite];
        }

        const mod = await import("../dist/server/server.js");
        const entry = mod.default ?? mod.server;
        if (!entry || typeof entry.fetch !== "function") {
          throw new Error("dist/server/server.js does not export a fetch handler");
          }

          // 60s is valid on every Vercel plan; streaming keeps SSE responses flowing.
          export const config = { maxDuration: 60, supportsResponseStreaming: true };

          export default function handler(request) {
            return entry.fetch(request);
            }
