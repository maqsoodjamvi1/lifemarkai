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
    const outHeaders = Object.fromEntries(response.headers);
    delete outHeaders["set-cookie"];
    res.writeHead(response.status, outHeaders);
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) res.setHeader("Set-Cookie", cookies);

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
