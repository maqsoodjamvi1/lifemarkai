/**
 * Error reporting to Sentry, with NO SDK dependency.
 *
 * WHY THIS EXISTS AT ALL. The repo carried sentry.client.config.ts,
 * sentry.server.config.ts, sentry.edge.config.ts and an @sentry/nextjs
 * dependency. Those files are a NEXT.JS convention - the Next SDK discovers and
 * loads them automatically. Next.js was removed in the TanStack cutover, so
 * nothing loaded them any more. Verified by grep: nothing imports those files, no
 * @sentry/* reference existed anywhere in src/, and the Start app declared no
 * Sentry package. Error monitoring had been silently dead since the cutover while
 * the config files made it look wired up - worse than having none, because it
 * stops anyone noticing the gap.
 *
 * WHY NO SDK. @sentry/react pulls a large transitive tree and would require
 * regenerating the Start app lockfile. Sentry's ingest endpoint accepts a plain
 * HTTP "envelope", so a few dozen lines of fetch do the job with zero new
 * dependencies, zero lockfile churn, and no bundle cost. What is given up:
 * automatic breadcrumbs, session replay, performance tracing. What is kept: the
 * thing that actually matters - unhandled errors reaching a dashboard.
 *
 * DESIGN RULES, in priority order:
 *
 * 1. NO DSN => COMPLETE NO-OP. Not "init with an empty dsn". Nothing is
 *    installed, no handlers registered, no network. This is what makes it safe to
 *    ship before SENTRY_DSN exists in Coolify - behaviour today is unchanged.
 *
 * 2. NEVER LEAK SECRETS. Query strings are stripped from every URL before
 *    sending. This app puts project ids and preview tokens in URLs; a crash
 *    report must not become a credential leak.
 *
 * 3. NEVER BREAK THE APP. Reporting is fire-and-forget and fully wrapped. A
 *    monitoring failure must never surface to a user or block a render - the same
 *    rule the self-verify loop and parallel subagents follow.
 *
 * 4. NEVER SWALLOW. Global handlers report and then let the default behaviour
 *    proceed. Swallowing an error to "handle" it would hide the very bugs this is
 *    meant to reveal.
 */

/** Read an env var from the Vite client bundle or the server process. */
function readEnv(name: string): string | undefined {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const fromVite = viteEnv?.[`VITE_${name}`];
  if (fromVite) return fromVite;
  if (typeof process !== "undefined" && process.env) {
    return process.env[name] ?? process.env[`VITE_${name}`];
  }
  return undefined;
}

/** Strip query strings so ids and tokens in URLs never reach Sentry (rule 2). */
function scrubUrl(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

interface Target {
  envelopeUrl: string;
}

/**
 * Parse a Sentry DSN into its ingest endpoint.
 * DSN shape: https://<publicKey>@<host>/<projectId>
 */
function parseDsn(dsn: string): Target | null {
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return {
      envelopeUrl:
        `${u.protocol}//${u.host}/api/${projectId}/envelope/` +
        `?sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7`,
    };
  } catch {
    return null;
  }
}

let target: Target | null = null;
let runtime: "client" | "server" = "client";
let started = false;

function uuid(): string {
  // Sentry wants a 32-char hex event_id. crypto.randomUUID is available in
  // modern browsers and Node 19+; the fallback keeps this from throwing anywhere.
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    let s = "";
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
}

/** Send one event. Fire-and-forget; never throws (rule 3). */
function send(level: "error" | "warning", err: unknown, extra?: Record<string, unknown>): void {
  if (!target) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const eventId = uuid();
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level,
      environment: readEnv("SENTRY_ENVIRONMENT") ?? readEnv("NODE_ENV") ?? "production",
      release: readEnv("SENTRY_RELEASE"),
      tags: { runtime },
      extra,
      exception: {
        values: [
          {
            type: e.name || "Error",
            value: e.message,
            stacktrace: e.stack ? { frames: [{ filename: scrubUrl(e.stack.split("\n")[1]?.trim() ?? "") }] } : undefined,
          },
        ],
      },
      request:
        typeof location !== "undefined" ? { url: scrubUrl(location.href) } : undefined,
    };

    const body =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event) +
      "\n";

    void fetch(target.envelopeUrl, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      // Must not hold a page unload open, and must not send cookies.
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      /* rule 3 */
    });
  } catch {
    /* rule 3 */
  }
}

/**
 * Install error reporting. Returns true only if it actually started.
 * Idempotent: both entry points may run in one process during SSR.
 */
export function initSentry(context: "client" | "server"): boolean {
  if (started) return true;

  const dsn = readEnv("SENTRY_DSN");
  if (!dsn) return false; // Rule 1.

  const parsed = parseDsn(dsn);
  if (!parsed) return false; // Malformed DSN is the same as none - never guess.

  target = parsed;
  runtime = context;
  started = true;

  try {
    if (context === "client" && typeof window !== "undefined") {
      window.addEventListener("error", (ev) => {
        send("error", ev.error ?? ev.message);
        // Rule 4: do not preventDefault - the console still gets it.
      });
      window.addEventListener("unhandledrejection", (ev) => {
        send("error", ev.reason);
      });
    }
  } catch {
    /* rule 3 */
  }

  return true;
}

/** Report a caught error explicitly. No-ops when reporting never started. */
export function reportError(err: unknown, extra?: Record<string, unknown>): void {
  send("error", err, extra);
}

/** True when reporting is actually running - for honest status in the UI. */
export function sentryActive(): boolean {
  return started;
}
