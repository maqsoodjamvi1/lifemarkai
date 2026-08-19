// Vercel entrypoint for the TanStack Start server bundle.
//
// dist/server/server.js (created by vite build during Vercel's build step)
// exports a Web-standard fetch handler - the same artifact
// scripts/serve-tanstack.mjs hosts on the VPS. vercel.json rewrites every
// non-static path here; static assets win first because outputDirectory
// (dist/client) is checked before rewrites.
//
// Vercel's Node runtime may hand this function a Request whose url is
// RELATIVE ("/path"). The Start server's srvx layer calls new URL(req.url)
// and throws Invalid URL on relative input, so we rebuild an absolute-URL
// Request from the forwarded host headers before calling the handler.
//
// Scope: /api/ai/chat + /api/ai/agent (local AI worker process) and Docker
// sandbox previews depend on VPS-local processes and degrade here. Production
// remains the Coolify deployment; this is the Vercel evaluation target.

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

export const config = { maxDuration: 60, supportsResponseStreaming: true };

export default function handler(request) {
    let url = request.url;
    if (url.startsWith("/")) {
          const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
          const proto = request.headers.get("x-forwarded-proto") ?? "https";
          url = proto + "://" + host + url;
    }
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const absolute = new Request(url, {
          method: request.method,
          headers: request.headers,
          body: hasBody ? request.body : undefined,
          duplex: hasBody ? "half" : undefined,
          redirect: "manual",
    });
    return entry.fetch(absolute);
}
