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

const entryPath = process.argv[2];
if (!entryPath) {
  console.error("[serve-tanstack] usage: serve-tanstack.mjs <server-entry>");
  process.exit(1);
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
 * RUNTIME ENV → BROWSER. The Vite `define:` map bakes public env values into
 * the client bundle at BUILD time — but on Coolify the Docker build received
 * no build-args (even with "Build Variable" checked), so the baked values were
 * empty strings and the browser had no Supabase config at all (Jul 27 outage).
 *
 * The client-side expressions now read `globalThis.__LM_ENV__.<KEY>` first
 * (see vite.config.ts `define`), and this script provides it: every HTML
 * response gets a <script> carrying the PUBLIC env values from the container's
 * runtime environment — which Coolify does reliably supply.
 *
 * Only NEXT_PUBLIC_* / VITE_* keys are exposed. Never widen this list:
 * anything here is world-readable in page source.
 */
const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_APP_URL",
];
function buildEnvScript() {
  const env = {};
  for (const key of PUBLIC_ENV_KEYS) {
    // NEXT_PUBLIC_* and VITE_* are aliases of the same three values; take
    // whichever spelling the deployment actually set.
    const alias = key.startsWith("VITE_")
      ? `NEXT_PUBLIC_${key.slice(5)}`
      : `VITE_${key.replace(/^NEXT_PUBLIC_/, "")}`;
    const value = process.env[key] || process.env[alias];
    if (value) env[key] = value;
  }
  // </script> inside a value would terminate the tag early — escape it.
  const json = JSON.stringify(env).replace(/</g, "\\u003c");
  return `<script>globalThis.__LM_ENV__=${json};</script>`;
}
const ENV_SCRIPT = buildEnvScript();

/** Inject the env script into an HTML string, right after <head> if present. */
function injectEnv(html) {
  const at = html.search(/<head[^>]*>/i);
  if (at === -1) return ENV_SCRIPT + html;
  const end = html.indexOf(">", at) + 1;
  return html.slice(0, end) + ENV_SCRIPT + html.slice(end);
}

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

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html") && response.body) {
      // Buffer HTML to inject __LM_ENV__. Trades streaming for correctness on
      // HTML only — assets/JSON/SSE below still stream untouched.
      const html = injectEnv(await response.text());
      // Body changed; a stale length would truncate the response mid-tag.
      outHeaders["content-length"] = String(Buffer.byteLength(html));
      res.writeHead(response.status, outHeaders);
      res.end(html);
      return;
    }

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
