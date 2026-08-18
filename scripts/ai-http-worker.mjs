/**
 * Isolated Node process for AI HTTP handlers (lib/ai/http/*).
 * Loads esbuild bundles from .tmp/ai-http (built on boot if missing).
 * Start proxies /api/ai/{chat,agent,fix} → http://127.0.0.1:$PORT/ai/*
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startAppRoot = path.resolve(__dirname, "..");
// PHASE 2: standalone — env comes from this app only (verified same 34 keys).
const PORT = Number(process.env.LIFEMARK_AI_WORKER_PORT || 3010);
const HOST = process.env.LIFEMARK_AI_WORKER_HOST || "127.0.0.1";
const bundleDir = path.join(startAppRoot, ".tmp/ai-http");

// Same KEY as src/lib/request-als.ts (must be set before any handler import).
const ALS_KEY = "__lifemark_request_als_store__";
const als = (globalThis[ALS_KEY] ||= new AsyncLocalStorage());

// Same key as src/lib/observability/correlation.ts. The bundled handlers read
// their correlation ids from this store; seeding it here (from the headers the
// Start process stamped) is what makes worker log lines joinable with request
// log lines for the same build.
const CORRELATION_KEY = "__lifemark_correlation_als__";
const correlationAls = (globalThis[CORRELATION_KEY] ||= new AsyncLocalStorage());

const CORRELATION_HEADERS = {
  requestId: "x-lifemark-request-id",
  buildRunId: "x-lifemark-build-run-id",
  sandboxSessionId: "x-lifemark-sandbox-session-id",
  deploymentId: "x-lifemark-deployment-id",
};

function correlationFromHeaders(request, route) {
  const read = (name) => {
    const value = request.headers.get(name);
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 128) return undefined;
    return /^[A-Za-z0-9_.:-]+$/.test(trimmed) ? trimmed : undefined;
  };
  return {
    requestId: read(CORRELATION_HEADERS.requestId) || `req_worker_${Date.now().toString(36)}`,
    buildRunId: read(CORRELATION_HEADERS.buildRunId),
    sandboxSessionId: read(CORRELATION_HEADERS.sandboxSessionId),
    deploymentId: read(CORRELATION_HEADERS.deploymentId),
    route: `ai-worker/${route}`,
  };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(startAppRoot, ".env.local"));

// PHASE 2 FIX: this worker is a SEPARATE Node process — it never runs vite.config.ts,
// so the VITE_* -> NEXT_PUBLIC_* mapping done there does not apply here. The app's
// .env.local carries the public values under VITE_* names only, while worker code
// (src/lib/supabase/request-client.ts) reads process.env.NEXT_PUBLIC_* and THROWS if
// absent — which would break /api/ai/chat and /api/ai/agent on every request.
// Mirror the aliases explicitly.
for (const [vite, next] of [
  ["VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  ["VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  ["VITE_APP_URL", "NEXT_PUBLIC_APP_URL"],
]) {
  if (!process.env[next] && process.env[vite]) process.env[next] = process.env[vite];
  if (!process.env[vite] && process.env[next]) process.env[vite] = process.env[next];
}

/** @type {Record<string, (req: Request) => Promise<Response>>} */
const handlers = {};
let ready = false;
let bootError = null;

function ensureBundles() {
  const needed = ["fix.mjs", "chat.mjs", "agent.mjs"];
  const missing = needed.some((f) => !fs.existsSync(path.join(bundleDir, f)));
  if (!missing && process.env.LIFEMARK_AI_SKIP_REBUILD === "1") return;
  console.log("[ai-worker] building AI HTTP bundles…");
  const buildScript = path.join(__dirname, "build-ai-http.mjs");
  const r = spawnSync(process.execPath, [buildScript], {
    cwd: startAppRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    throw new Error(`build-ai-http failed with status ${r.status}`);
  }
}

function parseCookies(header) {
  const map = new Map();
  if (!header) return map;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) map.set(trimmed, "");
    else {
      map.set(trimmed.slice(0, eq), decodeURIComponent(trimmed.slice(eq + 1)));
    }
  }
  return map;
}

async function runWithRequestContext(request, fn) {
  const ctx = {
    request,
    cookies: parseCookies(request.headers.get("cookie")),
    pendingSetCookies: [],
  };
  const result = await als.run(ctx, fn);
  return { result, pendingSetCookies: ctx.pendingSetCookies };
}

function applySetCookies(response, pending) {
  if (!pending.length) return response;
  const headers = new Headers(response.headers);
  for (const { name, value, options } of pending) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (options?.maxAge != null) parts.push(`Max-Age=${Number(options.maxAge)}`);
    if (options?.path) parts.push(`Path=${String(options.path)}`);
    if (options?.httpOnly) parts.push("HttpOnly");
    if (options?.secure) parts.push("Secure");
    if (options?.sameSite) {
      const ss = String(options.sameSite);
      parts.push(`SameSite=${ss.charAt(0).toUpperCase()}${ss.slice(1)}`);
    }
    headers.append("set-cookie", parts.join("; "));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function loadHandler(name) {
  if (handlers[name]) return handlers[name];
  const file = path.join(bundleDir, `${name}.mjs`);
  console.log(`[ai-worker] import ${name}…`);
  const mod = await import(pathToFileURL(file).href);
  const fn =
    name === "fix"
      ? mod.handleAiFix
      : name === "chat"
        ? mod.handleAiChat
        : mod.handleAiAgent;
  if (typeof fn !== "function") {
    throw new Error(`Bundle ${name} missing handler export`);
  }
  handlers[name] = fn;
  console.log(`[ai-worker] import ${name} ok`);
  return fn;
}

async function boot() {
  const t0 = Date.now();
  try {
    ensureBundles();
    // Eager-load fix only (small). Chat/agent lazy on first request so the
    // event loop stays responsive for /health.
    await loadHandler("fix");
    ready = true;
    console.log(`[ai-worker] ready in ${Date.now() - t0}ms (fix eager; chat/agent lazy)`);
  } catch (err) {
    bootError = err;
    console.error("[ai-worker] boot failed", err);
  }
}

async function toWebRequest(req) {
  const host = req.headers.host || `${HOST}:${PORT}`;
  const url = `http://${host}${req.url || "/"}`;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || key === "host") continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method || "GET";
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD" && body.length) {
    init.body = body;
  }
  return new Request(url, init);
}

async function sendWebResponse(res, webRes) {
  res.statusCode = webRes.status;
  const setCookies = [];
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      setCookies.push(value);
      return;
    }
    res.setHeader(key, value);
  });
  if (setCookies.length) {
    res.setHeader("set-cookie", setCookies);
  }
  if (!webRes.body) {
    res.end();
    return;
  }
  Readable.fromWeb(webRes.body).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  console.log(`[ai-worker] req ${req.method} ${req.url}`);
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    if (url.pathname === "/health") {
      res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: ready,
          error: bootError ? String(bootError?.message || bootError) : null,
          loaded: Object.keys(handlers),
        }),
      );
      return;
    }

    const match = url.pathname.match(/^\/ai\/(fix|chat|agent)$/);
    if (!match || (req.method !== "POST" && req.method !== "OPTIONS")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!ready) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: bootError
            ? `AI worker failed to load: ${bootError.message || bootError}`
            : "AI worker still starting",
        }),
      );
      return;
    }

    const name = match[1];
    const handler = await loadHandler(name);
    const webReq = await toWebRequest(req);
    console.log(`[ai-worker] → ${name} body ${Date.now() - t0}ms`);
    // Handlers use createClientFromRequest (Cookie header) — no next/headers ALS.
    const correlation = correlationFromHeaders(webReq, name);
    console.log(
      `[ai-worker] ctx ${name} requestId=${correlation.requestId} buildRunId=${correlation.buildRunId || "-"}`,
    );
    const result = await correlationAls.run(correlation, () => handler(webReq));
    const pending =
      webReq[Symbol.for("lifemark.pendingSetCookies")] || [];
    console.log(`[ai-worker] ← ${name} ${Date.now() - t0}ms status=${result.status}`);
    await sendWebResponse(res, applySetCookies(result, pending));
  } catch (err) {
    console.error("[ai-worker]", err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : "AI worker error",
        }),
      );
    } else {
      res.end();
    }
  }
});

// Accept connections before loading heavy bundles.
server.listen(PORT, HOST, () => {
  console.log(`[ai-worker] listening on http://${HOST}:${PORT}`);
  void boot();
});
