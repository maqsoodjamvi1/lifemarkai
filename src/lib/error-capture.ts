/**
 * Global server-side error capture (MuseCode-parity, improvement #4).
 *
 * Two jobs:
 *  1. Expand Error-like console.error args into strings that keep the
 *     message, stack, and the FULL cause chain — frameworks and adapters
 *     often serialize errors to `{"status":500}` blobs with the detail
 *     stripped, so a plain console.error(error) loses the failure.
 *  2. Record the last captured error out-of-band so response-layer code can
 *     recover the real stack when a framework has already swallowed the
 *     throw into a generic 500.
 *
 * Import for side effects from the router/server entry. Safe on the client:
 * everything is guarded and the wrap is idempotent.
 */

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;
const CAUSE_DEPTH_LIMIT = 5;
const DESCRIPTION_LENGTH_LIMIT = 8_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH_LIMIT && current != null; depth++) {
    if (!(current instanceof Error)) {
      parts.push(typeof current === "string" ? current : safeStringify(current));
      break;
    }
    const label = depth === 0 ? "" : "caused by: ";
    const status = describeStatus(current);
    parts.push(`${label}${current.stack ?? `${current.name}: ${current.message}`}${status}`);
    current = current.cause;
  }
  return parts.join("\n").slice(0, DESCRIPTION_LENGTH_LIMIT);
}

function describeStatus(error: Error): string {
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = status ?? statusCode;
  return typeof value === "number" ? ` (status ${value})` : "";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}

// ── Install (server only, idempotent) ────────────────────────────────────────

const INSTALLED = Symbol.for("lifemark.errorCaptureInstalled");

export function installErrorCapture(): void {
  if (typeof window !== "undefined") return; // server only
  const g = globalThis as Record<PropertyKey, unknown>;
  if (g[INSTALLED]) return;
  g[INSTALLED] = true;

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const expanded = args.map((arg) => {
      if (!(arg instanceof Error)) return arg;
      record(arg);
      return describeError(arg);
    });
    originalConsoleError(...expanded);
  };

  if (typeof process !== "undefined" && typeof process.on === "function") {
    process.on("uncaughtException", (err) => {
      record(err);
      originalConsoleError("[uncaughtException]", describeError(err));
    });
    process.on("unhandledRejection", (reason) => {
      record(reason);
      originalConsoleError("[unhandledRejection]", describeError(reason));
    });
  }
}

installErrorCapture();
