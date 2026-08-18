/**
 * Client telemetry — Phase 2 of the Vercel adoption plan.
 *
 * Two concerns, one privacy model, zero dependencies:
 *
 *   Web vitals  (flag: vercelSpeedInsights)  — LCP / CLS / INP / FCP / TTFB via
 *     PerformanceObserver, plus app-specific timings (editor interactive,
 *     Monaco loaded, first stream token, preview iframe ready, sandbox ready)
 *     via `markAppTiming()`. Grouped by SURFACE, not raw URL: the plan requires
 *     comparing marketing vs dashboard vs editor vs preview vs billing, and a
 *     raw path would leak project slugs into analytics.
 *
 *   Product events (flag: vercelWebAnalytics) — the fixed funnel vocabulary
 *     from the plan (signup_completed … subscription_completed). A fixed
 *     union, not free strings, so nobody can invent an event that smuggles a
 *     prompt into the payload.
 *
 * Privacy rules (Phase 2 acceptance criteria, enforced here, not by review):
 *   - No prompt text, no filenames, no generated content: props accept only
 *     numbers/booleans and short enum-ish strings; anything else is dropped.
 *   - Project/user identifiers are FNV-hashed before leaving the browser.
 *   - Preview surface is sampled (default 10%) so iframe traffic cannot drown
 *     product traffic.
 *
 * Transport is sendBeacon (fetch keepalive fallback) to /api/telemetry/client.
 * Everything is fire-and-forget and throw-proof: analytics must never break —
 * or measurably slow — the editor. Init is deferred to idle time.
 */

export type Surface =
  | "marketing"
  | "dashboard"
  | "editor"
  | "preview"
  | "billing"
  | "onboarding"
  | "auth"
  | "other";

export type ProductEvent =
  | "signup_completed"
  | "project_created"
  | "prompt_submitted"
  | "build_started"
  | "build_succeeded"
  | "build_failed"
  | "preview_ready"
  | "backend_enabled"
  | "deployment_completed"
  | "upgrade_started"
  | "subscription_completed";

export type AppTiming =
  | "editor_interactive"
  | "monaco_loaded"
  | "project_files_loaded"
  | "first_stream_token_rendered"
  | "preview_iframe_ready"
  | "sandbox_ready";

const ENDPOINT = "/api/telemetry/client";
const PREVIEW_SAMPLE_RATE = 0.1;

/** Route → surface. Prefix-based so project slugs and ids never leave the page. */
export function classifySurface(pathname: string): Surface {
  const p = pathname.toLowerCase();
  if (p.startsWith("/editor")) return "editor";
  if (p.startsWith("/preview") || p.startsWith("/preview-by-slug") || p.startsWith("/app/")) return "preview";
  if (p.startsWith("/dashboard")) return "dashboard";
  if (p.startsWith("/billing") || p.startsWith("/pricing")) return "billing";
  if (p.startsWith("/onboarding") || p.startsWith("/accept-invite") || p.startsWith("/invite")) return "onboarding";
  if (p.startsWith("/login") || p.startsWith("/signup") || p.startsWith("/auth") || p.startsWith("/forgot-password") || p.startsWith("/reset-password") || p.startsWith("/mfa-challenge")) return "auth";
  if (p === "/" || p.startsWith("/templates") || p.startsWith("/explore") || p.startsWith("/docs") || p.startsWith("/changelog") || p.startsWith("/connectors")) return "marketing";
  return "other";
}

/** FNV-1a hex — identifiers are hashed BEFORE they leave the browser. */
export function hashIdentifier(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Keep only telemetry-shaped props: numbers, booleans, and short strings with
 * no whitespace (enum values like "agent" / "vite"). Prompt text, filenames
 * and error messages all contain spaces, dots or slashes — they don't pass.
 */
export function sanitizeProps(
  props: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= 40 &&
      /^[a-z0-9_-]+$/i.test(value)
    ) {
      out[key] = value;
    }
  }
  return out;
}

type Payload = {
  kind: "vital" | "timing" | "event";
  name: string;
  surface: Surface;
  value?: number;
  props?: Record<string, string | number | boolean>;
  sessionSample: number;
};

function flagEnabled(name: string): boolean {
  try {
    const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const value = (meta?.[name] ?? "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
  } catch {
    return false;
  }
}

const state: {
  sessionSample: number;
  identity?: { userHash?: string; projectHash?: string };
  vitalsStarted: boolean;
  pending: Payload[];
  flushTimer: ReturnType<typeof setTimeout> | null;
} = { sessionSample: -1, vitalsStarted: false, pending: [], flushTimer: null };

function sessionSample(): number {
  if (state.sessionSample < 0) state.sessionSample = Math.random();
  return state.sessionSample;
}

function surfaceNow(): Surface {
  if (typeof location === "undefined") return "other";
  return classifySurface(location.pathname);
}

function sampledOut(surface: Surface): boolean {
  return surface === "preview" && sessionSample() > PREVIEW_SAMPLE_RATE;
}

function enqueue(payload: Payload): void {
  state.pending.push(payload);
  if (state.pending.length >= 20) {
    flush();
    return;
  }
  if (!state.flushTimer) {
    state.flushTimer = setTimeout(flush, 5_000);
  }
}

function flush(): void {
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  if (!state.pending.length) return;
  const batch = state.pending.splice(0, state.pending.length);
  const body = JSON.stringify({ batch, identity: state.identity ?? {} });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    /* telemetry must never break the page */
  }
}

/** Hash and remember who/what this session is about. Raw ids never leave here. */
export function setTelemetryIdentity(ids: { userId?: string | null; projectId?: string | null }): void {
  state.identity = {
    userHash: ids.userId ? hashIdentifier(ids.userId) : state.identity?.userHash,
    projectHash: ids.projectId ? hashIdentifier(ids.projectId) : state.identity?.projectHash,
  };
}

/** Emit one product/funnel event. No-op unless VITE_VERCEL_WEB_ANALYTICS_ENABLED. */
export function trackProductEvent(name: ProductEvent, props: Record<string, unknown> = {}): void {
  try {
    if (!flagEnabled("VITE_VERCEL_WEB_ANALYTICS_ENABLED")) return;
    const surface = surfaceNow();
    if (sampledOut(surface)) return;
    enqueue({ kind: "event", name, surface, props: sanitizeProps(props), sessionSample: sessionSample() });
  } catch {
    /* never throw */
  }
}

/** Record one app-specific timing in ms since navigation start. */
export function markAppTiming(name: AppTiming, valueMs?: number): void {
  try {
    if (!flagEnabled("VITE_VERCEL_SPEED_INSIGHTS_ENABLED")) return;
    const surface = surfaceNow();
    if (sampledOut(surface)) return;
    const value = typeof valueMs === "number" ? valueMs : typeof performance !== "undefined" ? performance.now() : 0;
    enqueue({ kind: "timing", name, surface, value: Math.round(value), sessionSample: sessionSample() });
  } catch {
    /* never throw */
  }
}

/**
 * Start Core Web Vitals observers. Values are reported on pagehide/hidden so
 * CLS and INP reflect the whole page life, not the first paint. Safe to call
 * more than once; only the first call installs observers.
 */
export function startWebVitals(): void {
  try {
    if (state.vitalsStarted) return;
    if (!flagEnabled("VITE_VERCEL_SPEED_INSIGHTS_ENABLED")) return;
    if (typeof PerformanceObserver === "undefined" || typeof document === "undefined") return;
    const surface = surfaceNow();
    if (sampledOut(surface)) return;
    state.vitalsStarted = true;

    const vitals: Record<string, number> = {};

    const observe = (type: string, handler: (entries: PerformanceEntry[]) => void) => {
      try {
        const observer = new PerformanceObserver((list) => handler(list.getEntries()));
        observer.observe({ type, buffered: true } as PerformanceObserverInit);
      } catch {
        /* entry type unsupported in this browser — skip it */
      }
    };

    observe("largest-contentful-paint", (entries) => {
      const last = entries[entries.length - 1];
      if (last) vitals.LCP = Math.round(last.startTime);
    });
    observe("layout-shift", (entries) => {
      for (const entry of entries) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) vitals.CLS = Math.round(((vitals.CLS ?? 0) + shift.value) * 1000) / 1000;
      }
    });
    observe("event", (entries) => {
      for (const entry of entries) {
        const ev = entry as PerformanceEntry & { interactionId?: number };
        if (ev.interactionId) vitals.INP = Math.max(vitals.INP ?? 0, Math.round(entry.duration));
      }
    });
    observe("paint", (entries) => {
      for (const entry of entries) {
        if (entry.name === "first-contentful-paint") vitals.FCP = Math.round(entry.startTime);
      }
    });
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav) vitals.TTFB = Math.round(nav.responseStart);
    } catch {
      /* fine without TTFB */
    }

    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      for (const [name, value] of Object.entries(vitals)) {
        enqueue({ kind: "vital", name, surface, value, sessionSample: sessionSample() });
      }
      flush();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") report();
    });
    addEventListener("pagehide", report);
  } catch {
    /* never throw */
  }
}

/** Deferred init: nothing runs until the main thread is idle. */
export function initClientTelemetry(): void {
  try {
    if (typeof window === "undefined") return;
    const start = () => startWebVitals();
    if ("requestIdleCallback" in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
    } else {
      setTimeout(start, 2_000);
    }
  } catch {
    /* never throw */
  }
}
