import type { SandboxFile } from "./index";

export const DEFAULT_SANDBOX_PORT = 5173;

// Preview sandbox lifetime. Modal caps a sandbox's wall-clock at 24h, so we
// default to that max — an actively-open preview effectively "never" expires
// mid-session (the client heartbeat keeps pushing this deadline forward too).
// Override with MODAL_SANDBOX_TIMEOUT_MS (milliseconds) to shorten it if the
// resource cost of long-lived sandboxes matters.
const MAX_MODAL_LIFETIME_MS = 24 * 60 * 60 * 1000; // Modal's hard ceiling
export const DEFAULT_TIMEOUT_MS = (() => {
  const override = Number(process.env.MODAL_SANDBOX_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) {
    return Math.min(override, MAX_MODAL_LIFETIME_MS);
  }
  return MAX_MODAL_LIFETIME_MS;
})();

// Idle reclaim window. Modal frees a sandbox after this much inactivity even
// before the wall-clock deadline. Default it to the full lifetime so an idle
// (e.g. backgrounded) preview isn't reclaimed out from under the user; the
// heartbeat still resets it on every interaction. Override with
// MODAL_SANDBOX_IDLE_TIMEOUT_MS.
export const DEFAULT_IDLE_TIMEOUT_MS = (() => {
  const override = Number(process.env.MODAL_SANDBOX_IDLE_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) {
    return Math.min(override, MAX_MODAL_LIFETIME_MS);
  }
  return DEFAULT_TIMEOUT_MS;
})();

export function trunc(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Poll until the dev server inside the sandbox responds (any HTTP status counts). */
export async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
      if (res.status > 0) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/**
 * Is a preview tunnel actually serving right now?
 *
 * WHY THIS EXISTS: readiness used to be derived purely from the stored
 * `sandbox_phase` + stored `preview_url`. Modal sandboxes expire (~24h), so a
 * project could report `phase: "ready"` while its tunnel no longer resolved —
 * the iframe rendered a broken-document icon, no error was surfaced, and the
 * dead-sandbox self-heal never fired because nothing detected the failure.
 *
 * This is called from a hot polling path, so it is deliberately cheap:
 *   - result cached for PROBE_TTL_MS (a dead tunnel stays dead; a live one
 *     doesn't need re-checking every poll)
 *   - concurrent callers share ONE in-flight request (the client can have a
 *     dozen polls outstanding at once)
 *   - short timeout — we want a verdict, not a wait
 *
 * Any HTTP status counts as alive: a 404 from the dev server still proves the
 * tunnel is up, which is the only thing being asserted here.
 */
const PREVIEW_PROBE_TTL_MS = 10_000;

/**
 * Consecutive failures required before we declare a tunnel dead.
 *
 * THIS MUST NOT BE 1. The first version of this probe flipped to "unreachable"
 * on a single failed request, which BLANKED PREVIEWS THAT WERE RENDERING FINE —
 * strictly worse than the stale-"ready" bug it was written to fix. A cold Modal
 * tunnel can be slow or refuse one request and be perfectly healthy on the next.
 *
 * The asymmetry is deliberate: one success marks alive immediately, several
 * failures are needed to mark dead. When in doubt, keep showing the preview.
 */
const PREVIEW_PROBE_FAILURES_BEFORE_DEAD = 3;

type ProbeEntry = {
  ok: boolean;
  at: number;
  fails: number;
  everOk: boolean;
  inflight: Promise<boolean> | null;
};
const previewProbeCache = new Map<string, ProbeEntry>();

export async function isPreviewReachable(url: string, timeoutMs = 8000): Promise<boolean> {
  const now = Date.now();
  const hit = previewProbeCache.get(url);
  if (hit && now - hit.at < PREVIEW_PROBE_TTL_MS) return hit.ok;
  if (hit?.inflight) return hit.inflight;

  const prev: ProbeEntry = hit ?? {
    ok: true, // fail OPEN on first look: never blank a preview we haven't checked
    at: 0,
    fails: 0,
    everOk: false,
    inflight: null,
  };

  const run = (async () => {
    let reached = false;
    try {
      // Follow redirects (default). `redirect: "manual"` was a bug here — a
      // tunnel that 30x's could surface a status we'd misread as dead.
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Any HTTP status proves the tunnel is up; even a 404 from the dev server
      // means something is listening, which is all we assert here.
      reached = res.status > 0;
    } catch {
      reached = false;
    }

    const fails = reached ? 0 : prev.fails + 1;
    // Alive on any success. Dead only after repeated failures — and if we've
    // never once seen it up, trust the caller's stored phase rather than
    // asserting death from a probe that may simply be blocked.
    const ok = reached
      ? true
      : prev.everOk
        ? fails < PREVIEW_PROBE_FAILURES_BEFORE_DEAD
        : true;

    previewProbeCache.set(url, {
      ok,
      at: Date.now(),
      fails,
      everOk: prev.everOk || reached,
      inflight: null,
    });
    return ok;
  })();

  previewProbeCache.set(url, { ...prev, inflight: run });
  return run;
}

/**
 * NON-BLOCKING reachability check — use this on hot paths.
 *
 * isPreviewReachable() AWAITS the network. Putting that on the sandbox-preview
 * poll (which the editor hits continuously) meant every poll could sit for the
 * full timeout whenever the tunnel was unreachable; requests piled up and the
 * editor page froze outright. A status endpoint must never block on a third
 * party.
 *
 * This answers INSTANTLY from cache and refreshes in the background, so a dead
 * tunnel costs nothing per request. Same fail-open bias: unknown reads as
 * reachable so we never blank a preview we simply haven't checked yet.
 */
export function peekPreviewReachable(url: string, timeoutMs = 8000): boolean {
  const hit = previewProbeCache.get(url);
  const fresh = hit && Date.now() - hit.at < PREVIEW_PROBE_TTL_MS;
  if (!fresh && !hit?.inflight) {
    // Fire and forget; a later poll picks up the result.
    void isPreviewReachable(url, timeoutMs).catch(() => {});
  }
  return hit ? hit.ok : true;
}

/**
 * What do we actually KNOW about this tunnel?
 *
 * isPreviewReachable() deliberately fails OPEN — a tunnel it has never managed
 * to reach still reports `true`, so that a probe which is itself blocked can
 * never blank a preview that works in the user's browser. The cost of that
 * choice is that `true` is ambiguous: it means "verified reachable" OR "never
 * successfully checked", and those are very different situations to debug.
 *
 * This exposes the distinction so callers can log or display it honestly
 * instead of implying a verification that never happened.
 *
 *   "verified"    – reached it at least once (trustworthy)
 *   "unverified"  – never once reached; the `true` verdict is an assumption
 *   "failing"     – reached before, currently failing (fails counted)
 *   "unknown"     – never probed at all
 */
export function getPreviewProbeState(
  url: string,
): { state: "verified" | "unverified" | "failing" | "unknown"; fails: number } {
  const hit = previewProbeCache.get(url);
  if (!hit) return { state: "unknown", fails: 0 };
  if (!hit.everOk) return { state: "unverified", fails: hit.fails };
  return { state: hit.fails > 0 ? "failing" : "verified", fails: hit.fails };
}

/** Drop a cached probe verdict — call after (re)starting a sandbox. */
export function forgetPreviewProbe(url?: string | null): void {
  if (url) previewProbeCache.delete(url);
  else previewProbeCache.clear();
}

export function sandboxNameForProject(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 48);
  return `preview-${safe || "project"}`;
}

export function detectSandboxStart(files: SandboxFile[]): { port: number; startCommand: string } {
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));
  const isNext = paths.some((p) => /next\.config\.(t|j|m)s$/.test(p));
  if (isNext) {
    const port = 3000;
    return { port, startCommand: `npx next dev -p ${port}` };
  }
  const port = Number(process.env.MODAL_PREVIEW_PORT ?? process.env.SANDBOX_PREVIEW_PORT ?? DEFAULT_SANDBOX_PORT);
  return {
    port,
    startCommand: `npm run dev -- --host 0.0.0.0 --port ${port}`,
  };
}
