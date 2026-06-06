// @ts-nocheck
/**
 * Structured logger for LifemarkAI server-side code.
 *
 * Features:
 * - JSON output in production (compatible with Datadog, Logtail, CloudWatch)
 * - Coloured human-readable output in development
 * - Auto-captures to Sentry at error level
 * - Child loggers with pre-bound context fields
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("deploy.started", { projectId, userId });
 *   logger.error("ai.failed", error, { projectId });
 */

// Dynamic import avoids bundling Sentry into edge runtimes that don't need it
let _sentry: typeof import("@sentry/nextjs") | null = null;
async function getSentry() {
  if (_sentry) return _sentry;
  try {
    _sentry = await import("@sentry/nextjs");
  } catch {
    _sentry = null;
  }
  return _sentry;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

// ── Config ────────────────────────────────────────────────────────────────────

const IS_PROD   = process.env.NODE_ENV === "production";
const IS_TEST   = process.env.NODE_ENV === "test";
const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel | undefined) ?? (IS_PROD ? "info" : "debug");

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const COLOUR: Record<LogLevel, string> = {
  debug: "\x1b[90m", // grey
  info:  "\x1b[36m", // cyan
  warn:  "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

// ── Core ──────────────────────────────────────────────────────────────────────

function shouldLog(level: LogLevel): boolean {
  return !IS_TEST && RANK[level] >= RANK[MIN_LEVEL];
}

function emit(level: LogLevel, event: string, ctx: LogContext): void {
  const ts = new Date().toISOString();

  if (IS_PROD) {
    process.stdout.write(
      JSON.stringify({ level, event, ts, env: process.env.NODE_ENV, ...ctx }) + "\n"
    );
  } else {
    const col  = COLOUR[level];
    const tag  = `${col}[${level.toUpperCase().padEnd(5)}]${RESET}`;
    const rest = Object.keys(ctx).length ? "  " + JSON.stringify(ctx) : "";
    console.log(`${ts.slice(11, 23)} ${tag} ${event}${rest}`);
  }
}

function log(
  level: LogLevel,
  event: string,
  errOrCtx?: Error | LogContext | unknown,
  extra?: LogContext
): void {
  if (!shouldLog(level)) return;

  let ctx: LogContext = {};
  let err: Error | undefined;

  if (errOrCtx instanceof Error) {
    err = errOrCtx;
    ctx = extra ?? {};
  } else if (errOrCtx && typeof errOrCtx === "object") {
    ctx = errOrCtx as LogContext;
  }

  const fullCtx: LogContext = {
    ...ctx,
    ...(err
      ? {
          error: err.message,
          stack: IS_PROD ? undefined : err.stack?.split("\n").slice(0, 4).join(" | "),
        }
      : {}),
  };

  emit(level, event, fullCtx);

  // Sentry integration (fire-and-forget, never throws)
  void getSentry().then((Sentry) => {
    if (!Sentry) return;
    if (level === "error") {
      Sentry.withScope((scope) => {
        scope.setTag("event", event);
        scope.setExtras(ctx);
        if (err) Sentry.captureException(err);
        else Sentry.captureMessage(`[${event}]`, "error");
      });
    } else {
      Sentry.addBreadcrumb({
        category: event,
        level: level === "warn" ? "warning" : "info",
        data: ctx,
      });
    }
  }).catch(() => {/* swallow */});
}

// ── Public API ────────────────────────────────────────────────────────────────

export const logger = {
  debug: (event: string, ctx?: LogContext) => log("debug", event, ctx),
  info:  (event: string, ctx?: LogContext) => log("info",  event, ctx),
  warn:  (event: string, ctx?: LogContext) => log("warn",  event, ctx),
  error: (event: string, errOrCtx?: Error | LogContext, ctx?: LogContext) =>
    log("error", event, errOrCtx, ctx),

  /** Create a child logger with pre-bound context (e.g. per-request userId) */
  child(defaults: LogContext) {
    return {
      debug: (event: string, ctx?: LogContext) => log("debug", event, { ...defaults, ...ctx }),
      info:  (event: string, ctx?: LogContext) => log("info",  event, { ...defaults, ...ctx }),
      warn:  (event: string, ctx?: LogContext) => log("warn",  event, { ...defaults, ...ctx }),
      error: (event: string, errOrCtx?: Error | LogContext, ctx?: LogContext) =>
        log("error", event, errOrCtx instanceof Error ? errOrCtx : { ...defaults, ...errOrCtx }, ctx),
    };
  },
};

// ── Route wrapper ─────────────────────────────────────────────────────────────

type Handler = (req: Request, ctx?: unknown) => Promise<Response>;

/**
 * Wrap a Next.js route handler with automatic request/response logging.
 *
 * @example
 * export const POST = withLogging("ai.chat", async (req) => { ... });
 */
export function withLogging(eventPrefix: string, handler: Handler): Handler {
  return async (req: Request, ctx?: unknown): Promise<Response> => {
    const start = Date.now();
    const url   = new URL(req.url);
    const base  = { method: req.method, path: url.pathname };

    try {
      const res = await handler(req, ctx);
      const ms  = Date.now() - start;
      const level: LogLevel = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
      log(level, `${eventPrefix}.response`, { ...base, status: res.status, ms });
      return res;
    } catch (err) {
      logger.error(`${eventPrefix}.unhandled`, err instanceof Error ? err : new Error(String(err)), {
        ...base,
        ms: Date.now() - start,
      });
      throw err;
    }
  };
}
