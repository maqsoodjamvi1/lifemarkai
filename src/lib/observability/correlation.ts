/**
 * Correlation IDs — Phase 0 of the Vercel adoption plan.
 *
 * One build in this app crosses at least four process boundaries: the Start
 * request, the AI HTTP worker (a separate Node process reached over localhost),
 * the sandbox, and the deploy call. Until now a failed build left four
 * unrelated log streams with no shared key, so "which stage failed?" was a
 * manual reconstruction. This module gives every one of them the same ids.
 *
 *   requestId        one inbound HTTP request
 *   buildRunId       one user-visible build, stable across chat -> verify -> repair
 *   sandboxSessionId one sandbox lifetime (create ... terminate)
 *   deploymentId     one deploy attempt
 *
 * Propagation is AsyncLocalStorage in-process and `x-lifemark-*` headers across
 * processes. The ALS instance is pinned to a globalThis key for the same reason
 * request-als.ts does it: lib/ai/http is esbuild-bundled into the worker, so a
 * module-level `new AsyncLocalStorage()` would produce TWO stores that cannot
 * see each other. One key, one store.
 *
 * Server-only (imports node:async_hooks).
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface CorrelationContext {
  requestId: string;
  buildRunId?: string;
  sandboxSessionId?: string;
  deploymentId?: string;
  projectId?: string;
  userId?: string;
  /** Logical route/handler name, e.g. "api/ai/chat". */
  route?: string;
}

export const CORRELATION_HEADERS = {
  requestId: "x-lifemark-request-id",
  buildRunId: "x-lifemark-build-run-id",
  sandboxSessionId: "x-lifemark-sandbox-session-id",
  deploymentId: "x-lifemark-deployment-id",
} as const;

type Als = AsyncLocalStorage<CorrelationContext>;

/** Literal key — must stay inlined so esbuild lazy-init cannot leave it undefined. */
function getAls(): Als {
  const g = globalThis as typeof globalThis & {
    __lifemark_correlation_als__?: Als;
  };
  if (!g.__lifemark_correlation_als__) {
    g.__lifemark_correlation_als__ = new AsyncLocalStorage<CorrelationContext>();
  }
  return g.__lifemark_correlation_als__;
}

function randomId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoRef?.randomUUID === "function") {
    return cryptoRef.randomUUID().replace(/-/g, "");
  }
  let out = "";
  while (out.length < 32) out += Math.random().toString(16).slice(2);
  return out.slice(0, 32);
}

export function newCorrelationId(prefix: string): string {
  return `${prefix}_${randomId()}`;
}

export const newRequestId = () => newCorrelationId("req");
export const newBuildRunId = () => newCorrelationId("run");
export const newSandboxSessionId = () => newCorrelationId("sbx");
export const newDeploymentId = () => newCorrelationId("dep");

/** Reject junk/oversized inbound header values before they reach a log line. */
function sanitizeId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  return /^[A-Za-z0-9_.:-]+$/.test(trimmed) ? trimmed : undefined;
}

export function getCorrelation(): CorrelationContext | undefined {
  return getAls().getStore();
}

/** Only the ids that are actually set — spread straight into a log line. */
export function correlationFields(): Partial<CorrelationContext> {
  const ctx = getCorrelation();
  if (!ctx) return {};
  const out: Partial<CorrelationContext> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (value !== undefined && value !== null && value !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** Attach ids discovered mid-request (userId after auth, buildRunId at build start). */
export function setCorrelation(patch: Partial<CorrelationContext>): void {
  const ctx = getCorrelation();
  if (!ctx) return;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    (ctx as unknown as Record<string, unknown>)[key] = value;
  }
}

export function runWithCorrelation<T>(
  seed: Partial<CorrelationContext>,
  fn: () => T,
): T {
  const existing = getCorrelation();
  const ctx: CorrelationContext = {
    ...existing,
    ...seed,
    requestId: seed.requestId ?? existing?.requestId ?? newRequestId(),
  };
  return getAls().run(ctx, fn);
}

/**
 * Mint the build id once and reuse it for the whole build. Chat, self-verify,
 * repair rounds and the deploy that follows all report the same run.
 */
export function ensureBuildRunId(): string {
  const ctx = getCorrelation();
  if (ctx?.buildRunId) return ctx.buildRunId;
  const id = newBuildRunId();
  setCorrelation({ buildRunId: id });
  return id;
}

/** Read ids an upstream process already assigned; unset/invalid ones are dropped. */
export function correlationFromRequest(request: {
  headers: { get(name: string): string | null };
}): Partial<CorrelationContext> {
  return {
    requestId: sanitizeId(request.headers.get(CORRELATION_HEADERS.requestId)),
    buildRunId: sanitizeId(request.headers.get(CORRELATION_HEADERS.buildRunId)),
    sandboxSessionId: sanitizeId(request.headers.get(CORRELATION_HEADERS.sandboxSessionId)),
    deploymentId: sanitizeId(request.headers.get(CORRELATION_HEADERS.deploymentId)),
  };
}

/** Stamp the current ids onto outbound headers (worker proxy, gateway, deploy). */
export function applyCorrelationHeaders(headers: Headers): Headers {
  const ctx = getCorrelation();
  if (!ctx) return headers;
  const pairs: Array<[string, string | undefined]> = [
    [CORRELATION_HEADERS.requestId, ctx.requestId],
    [CORRELATION_HEADERS.buildRunId, ctx.buildRunId],
    [CORRELATION_HEADERS.sandboxSessionId, ctx.sandboxSessionId],
    [CORRELATION_HEADERS.deploymentId, ctx.deploymentId],
  ];
  for (const [name, value] of pairs) {
    if (value) headers.set(name, value);
    else headers.delete(name);
  }
  return headers;
}

/**
 * Echo the ids back to the browser so a user-reported failure can be looked up
 * by the id in their network tab. Returns a new Response (headers are frozen on
 * a streamed one) and preserves the body stream.
 */
export function withCorrelationHeaders(response: Response): Response {
  const ctx = getCorrelation();
  if (!ctx) return response;
  const headers = new Headers(response.headers);
  applyCorrelationHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
