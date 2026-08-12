/**
 * Node HTTP host for the TanStack Start server bundle.
 *
 * WHY THIS EXISTS
 * ---------------
 * `.output/server/server.js` is NOT a standalone server. Confirmed against a
 * real build artifact: it contains zero `listen(` calls and ends with
 *
 *     const server = createServerEntry({ fetch });
 *     export { server as default, ... }
 *
 * i.e. it exports a Web-standard *fetch handler* for a host adapter to import.
 * Running it with `node server.js` evaluates the module, nothing holds the event
 * loop open, and the process exits 0 — which looks like a clean shutdown, not a
 * failure. The supervisor then restarts it forever while nothing ever listens,
 * so the orchestrator reports "Running" and the site is down. That combination
 * is why this took three deploys to pin down.
 *
 * This module supplies the missing half: it imports the handler and bridges
 * Node's req/res to the Fetch API.
 *
 * Usage:  node scripts/serve-tanstack.mjs <path-to-server-entry>
 */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const entryPath = process.argv[2];
if (!entryPath) {
  console.error("[serve-tanstack] usage: serve-tanstack.mjs <server-entry>");
  process.exit(1);
}

// NEXT_PUBLIC_* ↔ VITE_* are aliases of the same three values, but Coolify
// only sets the NEXT_PUBLIC_* spellings. The server bundle's define map points
// every read at globalThis.process.env.<NEXT_PUBLIC_name> (vite.config.ts), and
// this mirroring makes either spelling work regardless. MUST run before the
// entry import below: src/lib/supabase/server.ts reads env at module top level.
for (const base of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "APP_URL"]) {
  const next = `NEXT_PUBLIC_${base}`;
  const vite = `VITE_${base}`;
  if (process.env[next] && !process.env[vite]) process.env[vite] = process.env[next];
  if (process.env[vite] && !process.env[next]) process.env[next] = process.env[vite];
}

const mod = await import(pathToFileURL(entryPath).href);
const handler = mod.default ?? mod.server;
if (!handler || typeof handler.fetch !== "function") {
  console.error(
    `[serve-tanstack] ${entryPath} does not export a fetch handler.\n` +
      `Exports seen: ${Object.keys(mod).join(", ") || "(none)"}`,
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

/**
 * STATIC CLIENT ASSETS. The build's fetch handler does SSR only — it does NOT
 * serve `.output/client/**`. Without this block every `/assets/*.js|css`
 * request falls through to the router's HTML catch-all and 404s, so the whole
 * site renders server-side but never hydrates: pages LOOK alive (SSR HTML,
 * inline __LM_ENV__ script) while every button is dead and the editor hangs on
 * its unstyled pending state forever. That combination shipped once — the
 * landing page masked it for hours.
 */
const CLIENT_DIR = path.resolve(path.dirname(entryPath), "../client");
const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
};

/** Serve a file from .output/client if the URL maps to one; false otherwise. */
function tryServeStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    return false;
  }
  if (pathname === "/" || pathname.includes("\0")) return false;
  // Safe join — resolve and require the result to stay inside CLIENT_DIR.
  const abs = path.resolve(CLIENT_DIR, "." + pathname);
  if (abs !== CLIENT_DIR && !abs.startsWith(CLIENT_DIR + path.sep)) return false;
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const type = MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": String(st.size),
    // Vite content-hashes everything under /assets/, so those are immutable;
    // other public files (favicons etc.) get a short cache.
    "cache-control": pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(abs).pipe(res);
  return true;
}

// Runtime public configuration is rendered by RuntimeEnvScript in the root
// React document. Keeping it there preserves hydration and HTML streaming.

/**
 * Node lowercases header names but may hand back arrays for repeated headers
 * (set-cookie, etc.). The Headers constructor rejects arrays, so flatten by
 * appending each value rather than assigning once.
 */
function toWebHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  return headers;
}

const server = createServer(async (req, res) => {
  try {
    if (tryServeStatic(req, res)) return;
    const host = req.headers.host || `${HOST}:${PORT}`;
    // Trust the proxy's scheme so absolute URLs / redirects stay https behind Traefik.
    const proto = req.headers["x-forwarded-proto"] || "http";
    const url = `${proto}://${host}${req.url}`;

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers: toWebHeaders(req.headers),
      body: hasBody ? Readable.toWeb(req) : undefined,
      // Required by undici whenever a streaming body is supplied.
      ...(hasBody ? { duplex: "half" } : {}),
    });

    const response = await handler.fetch(request);

    // getSetCookie() preserves multiple Set-Cookie headers, which a plain
    // Object.fromEntries(headers) would collapse into one and break auth.
    // They go into outHeaders as an array BEFORE writeHead — res.setHeader()
    // after writeHead() throws ERR_HTTP_HEADERS_SENT. (The original code did
    // exactly that and only survived because cookieless pages never hit it.)
    const outHeaders = Object.fromEntries(response.headers);
    delete outHeaders["set-cookie"];
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) outHeaders["set-cookie"] = cookies;

    res.writeHead(response.status, outHeaders);
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (err) {
    console.error("[serve-tanstack] request failed:", err);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve-tanstack] listening on http://${HOST}:${PORT}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
