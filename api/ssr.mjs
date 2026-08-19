// Vercel entrypoint for the TanStack Start server bundle.
//
// dist/server/server.js (created by vite build during Vercel's build step)
// exports a Web-standard fetch handler - the same artifact
// scripts/serve-tanstack.mjs hosts on the VPS. Vercel's Node runtime invokes
// this function with NODE req/res objects (headers is a plain object, url is
// relative), so this file is the same req/res-to-Fetch bridge serve-tanstack
// uses: absolute URL from forwarded headers, Headers conversion, streamed
// bodies both ways, and getSetCookie so multiple Set-Cookie headers survive.
//
// Scope: /api/ai/chat + /api/ai/agent (local AI worker process) and Docker
// sandbox previews depend on VPS-local processes and degrade here. Production
// remains the Coolify deployment; this is the Vercel evaluation target.
import { Readable } from "node:stream";

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

export default async function handler(req, res) {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
      const url = proto + "://" + host + (req.url || "/");

  const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
              if (value === undefined) continue;
              if (Array.isArray(value)) {
                        for (const item of value) headers.append(key, item);
              } else {
                        headers.set(key, value);
              }
      }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const request = new Request(url, {
              method: req.method,
              headers,
              body: hasBody ? Readable.toWeb(req) : undefined,
              duplex: hasBody ? "half" : undefined,
              redirect: "manual",
      });

  const response = await entry.fetch(request);

  const outHeaders = {};
      response.headers.forEach(function (value, key) {
              if (key !== "set-cookie") outHeaders[key] = value;
      });
      const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
      if (cookies.length) outHeaders["set-cookie"] = cookies;

  res.writeHead(response.status, outHeaders);
      if (response.body) {
              Readable.fromWeb(response.body).pipe(res);
      } else {
              res.end();
      }
}
