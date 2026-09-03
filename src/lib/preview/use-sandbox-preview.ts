
/**
 * Client hook that requests a Modal sandbox preview (Lovable parity) and returns
 * the live tunnel URL. When Modal isn't configured the API returns
 * `{ enabled: false }` and the editor shows "Modal preview required"
 * (not WebContainer / srcdoc / esbuild).
 *
 * Draft E2B is only used when ENABLE_E2B_SANDBOX=1 / SANDBOX_PROVIDER=e2b.
 *
 * Lovable parity: GET reconnect before cold POST; persist sandboxId and
 * last preview URL in sessionStorage so reloads paint immediately.
 */
import { useCallback,useEffect,useRef,useState } from "react";
import { announcePreviewSettled } from "@/lib/preview/wait-for-preview-success";
import { reportPreviewSlo } from "@/lib/preview/preview-slo";
import {
  announcePreviewLifecycle,
  deriveSandboxLifecycle,
  isAppBuildFailure,
  isDeadSandboxPhase,
  isIdleReclaimText,
  planResumeAfterPause,
  type SandboxLifecycle,
} from "@/lib/preview/sandbox-lifecycle";

export interface SandboxPreviewState {
  enabled: boolean;
  previewUrl: string | null;
  sandboxId: string | null;
  provider: string | null;
  loading: boolean;
  error: string | null;
  logs: string | null;
  /** Modal boot phase: creating | writing | installing | starting | ready */
  phase: string | null;
  phaseDetail: string | null;
  /** Idle reclaim — keep sandbox id for warm resume. */
  paused?: boolean;
  resuming?: boolean;
}

type SandboxStatusResponse = {
  enabled?: boolean;
  provider?: string | null;
  configured?: boolean;
  reachable?: boolean;
  hint?: string | null;
};

function storageKey(projectId: string) {
  return `lifemark-sandbox-${projectId}`;
}

function urlStorageKey(projectId: string) {
  return `lifemark-sandbox-url-${projectId}`;
}

function readStoredPreview(projectId: string): { sandboxId: string | null; previewUrl: string | null } {
  try {
    return {
      sandboxId: sessionStorage.getItem(storageKey(projectId)),
      previewUrl: sessionStorage.getItem(urlStorageKey(projectId)),
    };
  } catch {
    return { sandboxId: null, previewUrl: null };
  }
}

export function useSandboxPreview(projectId: string) {
  const [state, setState] = useState<SandboxPreviewState>({
    enabled: false,
    previewUrl: null,
    sandboxId: null,
    provider: null,
    loading: false,
    error: null,
    logs: null,
    phase: null,
    phaseDetail: null,
    paused: false,
    resuming: false,
  });
  const sandboxIdRef = useRef<string | null>(null);
  /**
   * The CURRENT projectId, readable from a long-lived async callback (the
   * phase-poll interval below) without that callback closing over a stale
   * one. The editor route does not remount this hook on a project switch
   * (see bootedForProjectRef above), so a `setInterval` tick's in-flight
   * `fetch` from the PREVIOUS project can still resolve after the switch --
   * clearing the interval on cleanup does not cancel a request already in
   * flight. Kept in sync every render (a plain assignment, not an effect --
   * safe because reading/writing a ref never affects what gets rendered).
   */
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  /** Bumped when a zombie tunnel is healed in place, to force the iframe (which
   *  is stuck on a stale connection-reset page) to reload the recovered URL. */
  const [reloadNonce, setReloadNonce] = useState(0);
  /** One-shot guard for mid-session dead-sandbox auto-recovery (cold re-boot). */
  /** Cold POSTs used while recovering from a pause (cap = 1). */
  const resumeColdBootsRef = useRef(0);
  const bootStartedAtRef = useRef<number | null>(null);
  const resumeStartedAtRef = useRef<number | null>(null);
  const lastLifecycleRef = useRef<SandboxLifecycle | null>(null);
  /**
   * Tracks which projectId the boot effect has already run for — NOT just
   * whether it has ever run. The editor route (`/editor/$projectId`) does not
   * remount its component tree on a client-side navigation between two
   * projects (no `key` on the route/panel component keyed by projectId), so
   * a plain "booted once" boolean latched true forever and silently starved
   * every project switch of its own boot: the hook kept returning the
   * PREVIOUS project's sandboxId/previewUrl, the preview pane rendered the
   * old project's app under the new project's UI, and the keepalive/poll
   * effects kept hitting `/api/projects/<newId>/...` using state that
   * actually belonged to the old sandbox.
   */
  const bootedForProjectRef = useRef<string | null>(null);

  /**
   * The phase-poll effect below fires a `fetch` every 1200ms with no
   * AbortController and applied its response unconditionally. Two in-flight
   * polls can resolve out of order under ordinary network jitter — an older
   * request's response arriving after a newer one's already updated state
   * would silently re-apply stale data, including UNDOING a just-completed
   * cold-reboot recovery (resetting a freshly-healthy previewUrl back to
   * null and re-triggering a redundant reboot). Each poll gets an
   * incrementing sequence number; a response older than the last one already
   * applied is dropped rather than acted on.
   */
  const pollSeqRef = useRef(0);
  const appliedPollSeqRef = useRef(0);

  /**
   * The latest state, readable from a callback without becoming a dependency.
   *
   * Needed by the catch blocks below, which must preserve `enabled` rather than
   * reset it — and cannot close over `state` without re-creating every callback
   * on each render.
   */
  const stateRef = useRef(state);

  const applyState = useCallback((next: SandboxPreviewState) => {
    const merged: SandboxPreviewState = {
      ...next,
      paused: next.paused ?? false,
      resuming: next.resuming ?? false,
    };
    stateRef.current = merged;
    sandboxIdRef.current = merged.sandboxId;
    if (projectId) {
      try {
        if (merged.sandboxId) {
          sessionStorage.setItem(storageKey(projectId), merged.sandboxId);
        } else {
          sessionStorage.removeItem(storageKey(projectId));
        }
        if (merged.previewUrl) {
          sessionStorage.setItem(urlStorageKey(projectId), merged.previewUrl);
        } else {
          sessionStorage.removeItem(urlStorageKey(projectId));
        }
      } catch { /* private mode */ }
    }
    setState(merged);
    return merged;
  }, [projectId]);

  const emptyState = useCallback(
    (partial: Partial<SandboxPreviewState> = {}): SandboxPreviewState => ({
      enabled: false,
      previewUrl: null,
      sandboxId: null,
      provider: null,
      loading: false,
      error: null,
      logs: null,
      phase: null,
      phaseDetail: null,
      paused: false,
      resuming: false,
      ...partial,
    }),
    [],
  );

  const applyStatus = useCallback(
    (data: SandboxStatusResponse): boolean => {
      if (!data.enabled) {
        applyState(emptyState({
          provider: typeof data.provider === "string" ? data.provider : null,
          error:
            data.provider === "docker" && data.configured && data.reachable === false
              ? data.hint ||
                "Docker is configured but the daemon is not reachable. On Coolify, mount /var/run/docker.sock into this app."
              : null,
        }));
        return false;
      }
      applyState({
        ...stateRef.current,
        enabled: true,
        provider: typeof data.provider === "string" ? data.provider : stateRef.current.provider,
        // A warm origin is already paintable — don't flip back to a spinner
        // just because Docker status said "yes, the daemon is up".
        loading: stateRef.current.previewUrl ? false : true,
        phase: stateRef.current.previewUrl
          ? (stateRef.current.phase ?? "ready")
          : (stateRef.current.phase ?? "creating"),
      });
      return true;
    },
    [applyState, emptyState],
  );

  const reconnectPreview = useCallback(async (): Promise<SandboxPreviewState> => {
    setState((s) => ({ ...s, loading: s.previewUrl ? s.loading : true, error: null }));
    try {
      let storedId: string | null = null;
      try {
        storedId = sessionStorage.getItem(storageKey(projectId));
      } catch { /* private mode */ }

      const tryGet = async (qs: string) => {
        const res = await fetch(`/api/projects/${projectId}/sandbox-preview${qs}`, {
          method: "GET",
        });
        return res.json() as Promise<{
          enabled?: boolean;
          ok?: boolean;
          waking?: boolean;
          previewUrl?: string | null;
          sandboxId?: string | null;
          provider?: string;
          reconnected?: boolean;
          phase?: string | null;
          phaseDetail?: string | null;
          error?: string;
        }>;
      };

      // 1) Prefer stored sandboxId (fast path).
      let data = await tryGet(
        storedId ? `?sandboxId=${encodeURIComponent(storedId)}` : "",
      );

      // 2) Stale ID → clear + project-named reconnect (no sandboxId query).
      //    `waking` is explicitly NOT stale: the id resolved to a live container
      //    whose app is still coming up. Re-querying without the id would throw
      //    away a good sandbox and lose the flag that says so.
      if (storedId && data.enabled !== false && !data.waking && !(data.ok && data.previewUrl)) {
        try {
          sessionStorage.removeItem(storageKey(projectId));
        } catch { /* private mode */ }
        data = await tryGet("");
      }

      if (!data.enabled) {
        return applyState(emptyState());
      }

      // Warm container, app not serving yet. Hold the spinner and let the phase
      // poll promote it — cold-booting here would destroy a container that is
      // very likely seconds away from answering.
      if (data.waking) {
        return applyState({
          enabled: true,
          previewUrl: typeof data.previewUrl === "string" ? data.previewUrl : null,
          sandboxId: data.sandboxId ?? null,
          provider: typeof data.provider === "string" ? data.provider : null,
          loading: true,
          error: null,
          logs: null,
          phase: "starting",
          phaseDetail:
            typeof data.phaseDetail === "string" ? data.phaseDetail : "Waking your app…",
        });
      }

      if (data.ok && data.previewUrl) {
        return applyState({
          enabled: true,
          previewUrl: data.previewUrl,
          sandboxId: data.sandboxId ?? null,
          provider: typeof data.provider === "string" ? data.provider : null,
          loading: false,
          error: null,
          logs: data.reconnected ? "Reconnected to warm sandbox" : null,
          // A serving tunnel is ready even if project metadata still says
          // "installing" from a previous boot. Echoing that phase made project
          // switches show "Installing dependencies…" over an already-live app.
          phase: data.phase === "app_error" ? "app_error" : "ready",
          phaseDetail: null,
        });
      }

      return applyState({
        enabled: true,
        previewUrl: null,
        sandboxId: null,
        provider: typeof data.provider === "string" ? data.provider : null,
        loading: true, // keep spinner until cold POST finishes — avoid empty white pane
        error: null,
        logs: null,
        phase: typeof data.phase === "string" ? data.phase : "creating",
        phaseDetail: typeof data.phaseDetail === "string" ? data.phaseDetail : "Cold start…",
      });
    } catch (err) {
      // Keep `enabled`. See the note on the requestPreview catch below: routing
      // a transient network error through emptyState() turns "one fetch failed"
      // into "this project has no preview backend", and every recovery effect
      // in this hook is gated on `enabled`.
      return applyState({
        ...stateRef.current,
        loading: false,
        error: err instanceof Error ? err.message : "Reconnect failed",
      });
    }
  }, [applyState, projectId]);

  const requestPreview = useCallback(async (): Promise<SandboxPreviewState> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const status = (await fetch("/api/sandbox/status").then((r) => r.json())) as SandboxStatusResponse;
      if (!applyStatus(status)) {
        return stateRef.current;
      }

      const postOnce = async () => {
        const res = await fetch(`/api/projects/${projectId}/sandbox-preview`, { method: "POST" });
        return res.json() as Promise<{
          enabled?: boolean;
          ok?: boolean;
          ready?: boolean;
          retryable?: boolean;
          previewUrl?: string | null;
          sandboxId?: string | null;
          provider?: string;
          error?: string;
          logs?: string | null;
          phase?: string | null;
          phaseDetail?: string | null;
        }>;
      };

      let data = await postOnce();

      // Server clears an expired Modal id and asks for one more POST. Do that
      // automatically — showing "Preview could not start" here left users stuck
      // on a self-healable failure (observed: Retry / first boot both stopped
      // after the retryable response).
      if (data.enabled !== false && !data.ok && data.retryable) {
        try {
          sessionStorage.removeItem(storageKey(projectId));
        } catch { /* private mode */ }
        sandboxIdRef.current = null;
        setState((s) => ({
          ...s,
          loading: true,
          error: null,
          previewUrl: null,
          sandboxId: null,
          phase: "creating",
          phaseDetail: "Sandbox expired — starting a fresh one…",
        }));
        data = await postOnce();
      }

      if (!data.enabled) {
        return applyState(emptyState());
      }

      // The sandbox exists but its dev server hadn't answered yet. This is a
      // normal cold boot, not a failure — keep the spinner up and stay in the
      // polling state so the phase poll can adopt the URL the instant a probe
      // confirms it. Settling here (loading:false, no URL) would stop the poll
      // effect dead and leave the pane blank forever.
      if (data.ok && data.ready === false) {
        return applyState({
          enabled: true,
          previewUrl: data.previewUrl ?? null,
          sandboxId: data.sandboxId ?? null,
          provider: typeof data.provider === "string" ? data.provider : null,
          loading: true,
          error: null,
          logs: data.logs ?? null,
          phase: typeof data.phase === "string" ? data.phase : "starting",
          phaseDetail:
            typeof data.phaseDetail === "string"
              ? data.phaseDetail
              : "Starting your app…",
        });
      }

      return applyState({
        enabled: true,
        previewUrl: data.previewUrl ?? null,
        sandboxId: data.sandboxId ?? null,
        provider: typeof data.provider === "string" ? data.provider : null,
        loading: false,
        error: data.ok ? null : (data.error ?? "Sandbox failed"),
        logs: data.logs ?? null,
        phase: typeof data.phase === "string" ? data.phase : data.ok ? "ready" : "error",
        phaseDetail: typeof data.phaseDetail === "string" ? data.phaseDetail : null,
      });
    } catch (err) {
      // `enabled` MUST survive a failed request.
      //
      // emptyState() hardcodes `enabled: false`, and every self-healing path in
      // this hook — the phase poll, the keepalive heartbeat, the paint watchdog
      // — is gated on it. So a single DNS wobble against Supabase during a cold
      // boot (getProjectAccess throws by design on a transient error, the POST
      // route has no try/catch, res.json() then throws here) permanently
      // disabled every recovery mechanism for the rest of the session. The
      // preview could not come back even after the network did, and the pane it
      // lands on has no Retry button.
      //
      // A failed fetch means "this attempt failed", not "this project has no
      // preview backend". Report the error, keep the capability.
      return applyState({
        ...stateRef.current,
        loading: false,
        error: err instanceof Error ? err.message : "Request failed",
      });
    }
  }, [applyState, applyStatus, projectId]);

  const enterPaused = useCallback((reason: string) => {
    const sid = sandboxIdRef.current;
    applyState({
      ...stateRef.current,
      // Keep framing the last origin. Clearing it was the blank-pane failure:
      // a slow host probe paused a sandbox whose Vite was still serving.
      previewUrl: stateRef.current.previewUrl,
      sandboxId: sid,
      loading: false,
      error: reason,
      logs: stateRef.current.logs,
      phase: "paused",
      phaseDetail: "Still building?",
      paused: true,
      resuming: false,
    });
  }, [applyState]);

  const resumePreview = useCallback(async (): Promise<SandboxPreviewState> => {
    resumeStartedAtRef.current = Date.now();
    applyState({
      ...stateRef.current,
      loading: true,
      error: null,
      paused: false,
      resuming: true,
      phase: "starting",
      phaseDetail: "Resuming live preview…",
    });

    const reconnected = await reconnectPreview();
    if (reconnected.previewUrl) {
      resumeColdBootsRef.current = 0;
      reportPreviewSlo("preview.reconnect_ok", { projectId });
      return applyState({ ...reconnected, paused: false, resuming: false, phase: reconnected.phase ?? "ready" });
    }
    if (reconnected.phase === "starting") {
      return applyState({ ...reconnected, paused: false, resuming: true });
    }

    const plan = planResumeAfterPause({
      reconnectHasUrl: false,
      reconnectWaking: reconnected.phase === "starting",
      coldBootsUsed: resumeColdBootsRef.current,
    });
    if (plan === "cold") {
      resumeColdBootsRef.current += 1;
      const cold = await requestPreview();
      if (cold.previewUrl) {
        resumeColdBootsRef.current = 0;
        return applyState({ ...cold, paused: false, resuming: false });
      }
      if (cold.phase === "starting" || cold.loading) {
        return applyState({ ...cold, paused: false, resuming: true });
      }
    }

    return applyState({
      ...stateRef.current,
      loading: false,
      resuming: false,
      paused: false,
      phase: "error",
      error:
        "The live preview could not resume. Retry once more, or ask chat to check the app boot.",
    });
  }, [applyState, projectId, reconnectPreview, requestPreview]);

  /** Preflight: know the Docker daemon is up before boot. Keep probing while it is down. */
  const [statusResolved, setStatusResolved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const check = async () => {
      try {
        const res = await fetch("/api/sandbox/status");
        const data = (await res.json()) as SandboxStatusResponse;
        if (cancelled) return;
        const ok = applyStatus(data);
        setStatusResolved(true);
        if (!ok) timer = window.setTimeout(check, 2500);
      } catch {
        if (cancelled) return;
        setStatusResolved(true);
        timer = window.setTimeout(check, 2500);
      }
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [applyStatus]);

  /** Lovable parity: reconnect warm sandbox first, cold-provision only if needed. */
  useEffect(() => {
    if (!projectId || bootedForProjectRef.current === projectId) return;
    if (!statusResolved) return;
    if (!stateRef.current.enabled) return;
    bootedForProjectRef.current = projectId;
    resumeColdBootsRef.current = 0;
    void (async () => {
      // Prefer this project's last known origin immediately so a remount or
      // switch back does not flash Connecting over an app that is still up.
      // A different project's URL is never in this key, so we cannot paint
      // the previous app under the new chrome.
      const stored = readStoredPreview(projectId);
      if (stored.previewUrl) {
        sandboxIdRef.current = stored.sandboxId;
        const painted: SandboxPreviewState = {
          ...stateRef.current,
          enabled: stateRef.current.enabled,
          previewUrl: stored.previewUrl,
          sandboxId: stored.sandboxId,
          loading: false,
          error: null,
          logs: null,
          phase: "ready",
          phaseDetail: null,
          paused: false,
          resuming: false,
        };
        stateRef.current = painted;
        setState(painted);
      } else {
        const next = emptyState({
          enabled: stateRef.current.enabled,
          loading: true,
          phase: "creating",
          phaseDetail: "Connecting…",
        });
        stateRef.current = next;
        sandboxIdRef.current = null;
        setState(next);
      }

      // Always try a warm reconnect first. Docker keeps one container per
      // project across reloads; skipping GET when sessionStorage was empty
      // started a cold POST that sat on "Syncing changed files" while Vite
      // was already serving — the editor showed a blank starting pane.
      const reconnected = await reconnectPreview();
      if (reconnected.previewUrl) return;
      // "starting" means reconnect found a live sandbox whose app hasn't
      // answered yet. Cold-booting on top of that would delete the container
      // it just found and restart a boot that is already nearly done.
      if (reconnected.phase === "starting") return;

      setState((s) => ({ ...s, phase: "creating", phaseDetail: "Cold start…" }));
      await requestPreview();
    })();
  }, [projectId, reconnectPreview, requestPreview, statusResolved, state.enabled]);

  /** Keep-alive heartbeat: while a live preview is up AND the tab is visible,
   *  ping the sandbox so Modal's idle timer never fires (sandboxes were expiring
   *  every ~10 min mid-edit). If the heartbeat reports the sandbox died, boot a
   *  fresh one immediately instead of waiting for the user to hit an error. */
  useEffect(() => {
    if (!projectId || !state.enabled || !state.previewUrl) return;
    let stopped = false;
    const beat = () => {
      if (stopped || typeof document !== "undefined" && document.hidden) return;
      const sid = sandboxIdRef.current;
      if (!sid) return;
      void fetch(`/api/projects/${projectId}/sandbox-preview/keep-alive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the tunnel URL so the server can probe it (zombie detection):
        // a Modal container can outlive its Vite dev server, leaving the tunnel
        // resetting connections while `alive` is still true.
        body: JSON.stringify({ sandboxId: sid, previewUrl: state.previewUrl }),
        keepalive: true,
      })
        .then((r) => r.json())
        .then((d: { alive?: boolean; enabled?: boolean; tunnelHealthy?: boolean; restarted?: boolean }) => {
          if (stopped || d.enabled === false) return;
          // (1) Compute gone — reboot a fresh sandbox before the user sees a dead
          // tunnel. (2) Tunnel dead and the in-place Vite restart didn't recover
          // it — also reboot. Either way, get a working preview automatically.
          if (d.alive === false) {
            // Idle reclaim: pause (keep sandbox id for warm resume). Do not
            // cold-POST in a loop — that was the install spinner death spiral.
            // tunnelHealthy:false is not a pause: on Coolify the app container
            // often cannot hairpin to the public preview host, and treating
            // that as dead forced a 2–3 minute cold boot of a live sandbox.
            enterPaused("Preview session expired");
          } else if (d.restarted) {
            // Zombie healed in place: Vite was restarted and the tunnel serves
            // again, but the iframe is still showing the stale connection-reset
            // page (browsers don't auto-retry those). Bump the nonce to reload it.
            setReloadNonce((n) => n + 1);
          }
        })
        .catch(() => {});
    };
    // Probe immediately on mount/URL change — observed live: terminated Modal
    // sandboxes left a blank iframe for minutes because the first beat waited 90s.
    beat();
    // Heartbeat every 15s (well under Modal's idle window) + when tab is visible.
    const timer = window.setInterval(beat, 15_000);
    const onVisible = () => { if (!document.hidden) beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId, state.enabled, state.previewUrl, enterPaused]);

  /** PAINT WATCHDOG — the last blank-preview class standing after server-side
   *  hardening. Observed live: sandbox healthy, tunnel probe "verified", phase
   *  "ready" — yet the iframe showed a blank page, because it had loaded during
   *  a transient (vite restart / rolling deploy) and browsers never re-fetch a
   *  failed/blank document on their own. Every health signal was green, so no
   *  recovery path fired and the user had to click reload manually.
   *
   *  WHAT COUNTS AS A PAINT. This used to accept any bridge message —
   *  `lifemark-veb-ready`, a location update, any `lifemark-preview` log. All
   *  of those fire when the document EXECUTES, which is before React has
   *  rendered a single element, so the watchdog was satisfied by a page that
   *  was still white and never fired once. Reproduced live: a cold sandbox
   *  painted blank, the bridge reported ready and then success, the editor sat
   *  on a white pane for over a minute, and only a manual reload fixed it —
   *  the exact failure this watchdog was written to catch, walking straight
   *  past it.
   *
   *  So the guest now measures the app instead of itself and posts
   *  `lifemark-preview-painted` with the root's element count, text length and
   *  rendered height. Only real content clears the watchdog; anything else is
   *  proof of life, not proof of paint. When nothing paints, reload via
   *  reloadNonce (3 attempts, doubling backoff) against the now-warm vite. */
  const paintAttemptsRef = useRef(0);
  const lastPaintPingRef = useRef(0);
  useEffect(() => {
    if (!state.enabled || !state.previewUrl) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as
        | { type?: string; source?: string; nodes?: number; textLen?: number; height?: number }
        | null;
      if (!d || typeof d !== "object") return;
      if (d.type !== "lifemark-preview-painted") return;
      // A mounted-but-empty shell satisfies "root.innerHTML is non-empty", so
      // that is not enough. Require actual elements AND either visible text or
      // real height — the difference between a rendered app and a wrapper div.
      const nodes = typeof d.nodes === "number" ? d.nodes : 0;
      const textLen = typeof d.textLen === "number" ? d.textLen : 0;
      const height = typeof d.height === "number" ? d.height : 0;
      if (nodes >= 3 && (textLen > 0 || height > 40)) {
        lastPaintPingRef.current = Date.now();
        paintAttemptsRef.current = 0;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [state.enabled, state.previewUrl]);

  useEffect(() => {
    if (!state.enabled || !state.previewUrl || state.phase !== "ready") return;
    lastPaintPingRef.current = 0;
    paintAttemptsRef.current = 0;
    let cancelled = false;
    let timer = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (cancelled || lastPaintPingRef.current > 0) return;
        if (paintAttemptsRef.current >= 3) return;
        paintAttemptsRef.current += 1;
        setReloadNonce((n) => n + 1);
        schedule(delay * 2);
      }, delay);
    };
    // 6s was too tight and caused reload churn that read as flakiness. A dev
    // server that has just booted still has to run Vite's dependency
    // pre-bundling pass on the first request, and on a large generated app
    // that alone can outlast 6s — so the watchdog was reloading iframes that
    // were mid-first-paint, throwing away the optimizer's progress and making
    // the preview slower in exactly the case it was meant to rescue.
    schedule(12_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state.enabled, state.previewUrl, state.phase]);

  /** A boot parked at "starting" must not spin forever.
   *
   *  Withholding the URL until a probe confirms it is what keeps Bad Gateway
   *  out of the pane, but it moves the failure mode: an app that genuinely
   *  cannot start now shows a spinner instead of an error. The dev-log tail,
   *  OOM status and process table are already attached to the boot response, so
   *  after a grace window surface them rather than leaving the user guessing. */
  const stallRecoveryRef = useRef(0);
  useEffect(() => {
    if (state.phase !== "starting" || state.previewUrl) return;
    const timer = window.setTimeout(() => {
      // First stall gets one cold boot. The container may be wedged in a way
      // the in-container supervisor can't fix (a poisoned node_modules, a port
      // already bound by a zombie), and a fresh one is the standard cure.
      if (stallRecoveryRef.current === 0) {
        stallRecoveryRef.current = 1;
        try { sessionStorage.removeItem(storageKey(projectId)); } catch { /* private */ }
        sandboxIdRef.current = null;
        setState((s) => ({
          ...s,
          previewUrl: null,
          sandboxId: null,
          loading: true,
          error: null,
          phase: "creating",
          phaseDetail: "Taking longer than usual — starting fresh…",
        }));
        void requestPreview();
        return;
      }
      // Second stall: a fresh sandbox didn't help, so this is the app, not the
      // infrastructure. Say so and show the boot log rather than spinning.
      setState((s) => {
        if (s.phase !== "starting" || s.previewUrl) return s;
        return {
          ...s,
          loading: false,
          phase: "error",
          error:
            "Your app did not finish starting. The log below usually says why — " +
            "a dependency that failed to install, a syntax error in an entry file, " +
            "or the app running out of memory.",
        };
      });
    }, 90_000);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.previewUrl, projectId, requestPreview]);

  /** Poll Modal boot phase while cold-starting (metadata updates from POST).
   *  ALSO keeps polling in the error state: a failed boot used to freeze the
   *  "could not start" pane forever even after a later boot succeeded — the
   *  poll now adopts the ready sandbox and the pane self-recovers.
   *
   *  ALSO polls when a previewUrl is already set: Modal can terminate the
   *  sandbox mid-session while the client still frames the dead tunnel URL.
   *  Previously `state.previewUrl` short-circuited this effect, so cold-retry
   *  never ran and the editor stayed blank until a manual refresh. */
  useEffect(() => {
    const bootPending = state.loading || !!state.error || state.phase === "error";
    const hasStaleUrlRisk = !!state.previewUrl;
    if (!projectId || !state.enabled || (!bootPending && !hasStaleUrlRisk)) return;
    const timer = window.setInterval(() => {
      const seq = ++pollSeqRef.current;
      void fetch(`/api/projects/${projectId}/sandbox-preview?phaseOnly=1`)
        .then((r) => r.json())
        .then((data: {
          ok?: boolean;
          previewUrl?: string | null;
          sandboxId?: string | null;
          phase?: string | null;
          phaseDetail?: string | null;
          provider?: string;
          // The route returns this on several failure branches (expired
          // sandbox, rate limit, 500). The dead-phase check below has always
          // read it; the type just never admitted it existed.
          error?: string | null;
        }) => {
          // This fetch was issued for `projectId` as it was when this poll
          // interval was set up. If the user has since switched projects,
          // clearing the interval (the effect's cleanup) does NOT cancel a
          // request already in flight — an old project's late response must
          // never touch state that now belongs to a different project's
          // editor. The sequence check below is not enough on its own: it
          // only orders responses WITHIN one project's polling, and a fresh
          // interval for the new project starts its sequence counter from
          // wherever the shared ref already was, so an old-project response
          // can still look "not stale" to it.
          if (projectId !== projectIdRef.current) return;
          // A response older than one we've already acted on is stale —
          // applying it now would overwrite whatever a later, faster
          // response already resolved. Drop it.
          if (seq < appliedPollSeqRef.current) return;
          appliedPollSeqRef.current = seq;

          // Only adopt URL once boot reports ready — never a stale preview_url
          // left over from a timed-out Modal sandbox.
          if (data.ok && data.previewUrl && data.phase === "ready") {
            applyState({
              enabled: true,
              previewUrl: data.previewUrl,
              sandboxId: data.sandboxId ?? null,
              provider: typeof data.provider === "string" ? data.provider : state.provider,
              loading: false,
              error: null,
              logs: null,
              phase: "ready",
              phaseDetail: null,
            });
            return;
          }
          // "app_error": the container is serving, but the app answers 5xx —
          // its build failed. This is NOT a dead sandbox and must never reach
          // the cold-reboot path below: rebooting re-runs the same broken
          // build and the pane loops forever on "Sandbox expired — restarting".
          // Stop the spinner and surface the reason so the user (or the repair
          // loop) acts on the actual error instead of waiting on a boot that
          // already finished.
          if (data.phase === "app_error") {
            setState((s) => ({
              ...s,
              loading: false,
              previewUrl: null,
              phase: "app_error",
              phaseDetail: typeof data.phaseDetail === "string" ? data.phaseDetail : s.phaseDetail,
              error:
                (typeof data.phaseDetail === "string" ? data.phaseDetail : null) ??
                "Your app failed to build.",
            }));
            return;
          }
          if (typeof data.phase === "string") {
            setState((s) => {
              if (
                s.previewUrl &&
                !s.loading &&
                (data.phase === "installing" || data.phase === "creating" || data.phase === "writing")
              ) {
                return s;
              }
              return {
                ...s,
                phase: data.phase ?? s.phase,
                phaseDetail:
                  typeof data.phaseDetail === "string" ? data.phaseDetail : s.phaseDetail,
              };
            });
          }
          // Dead-sandbox auto-recovery: when Modal reclaims the sandbox
          // MID-SESSION, phase sticks at "error" ("Sandbox has already finished
          // with status timeout") and nothing ever issues a cold POST — the
          // spinner pane polls forever (observed live). Boot a fresh sandbox
          // once per death instead of waiting for the user to intervene.
          // "unreachable" is reported by phaseOnly when the stored sandbox
          // claims ready but its tunnel never answers the server-side probe
          // (container reaped/crashed while the client still frames the URL).
          // It was NOT in this list, so a client without a live sandboxId (the
          // heartbeat needs one) had NO recovery path — the pane stayed blank
          // polling forever. Treat it as dead so the cold-reboot fires.
          const deadPhase =
            !isAppBuildFailure(data.phase) &&
            isDeadSandboxPhase(data.phase, `${data.phaseDetail ?? ""} ${data.error ?? ""}`);
          if (deadPhase && !stateRef.current.paused && !stateRef.current.resuming) {
            enterPaused(
              isIdleReclaimText(`${data.phaseDetail ?? ""} ${data.error ?? ""}`)
                ? (typeof data.error === "string" && data.error ? data.error : "Preview session expired")
                : "Preview session expired",
            );
          }
        })
        .catch(() => {});
    }, 1200);
    return () => window.clearInterval(timer);
  }, [projectId, state.enabled, state.previewUrl, state.loading, state.error, state.phase, state.provider, applyState, enterPaused]);

  const stopPreview = useCallback(() => {
    const sandboxId = sandboxIdRef.current;
    if (!projectId || !sandboxId) return;
    sandboxIdRef.current = null;
    try {
      sessionStorage.removeItem(storageKey(projectId));
    } catch { /* private mode */ }
    const url = `/api/projects/${projectId}/sandbox-preview/stop`;
    const payload = JSON.stringify({ sandboxId });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        return;
      }
    } catch {
      /* fall through */
    }
    void fetch(url, {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  }, [projectId]);

  const syncFiles = useCallback(
    async (
      files: Array<{ path: string; content: string }>,
    ): Promise<{ ok: boolean; installing?: boolean; error?: string; recovered?: boolean }> => {
      if (!projectId || files.length === 0) {
        return { ok: false, error: "No sandbox" };
      }
      const doSync = async (
        sandboxId: string,
      ): Promise<{ ok: boolean; installing?: boolean; error?: string }> => {
        try {
          const res = await fetch(`/api/projects/${projectId}/sandbox-preview/sync`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sandboxId, files }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            installing?: boolean;
            error?: string;
          };
          if (!res.ok || data.ok === false) {
            return { ok: false, error: data.error ?? `Sync failed (${res.status})` };
          }
          return { ok: true, installing: !!data.installing };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Sync failed" };
        }
      };

      const sandboxId = sandboxIdRef.current;
      if (!sandboxId) return { ok: false, error: "No sandbox" };
      let result = await doSync(sandboxId);

      // Self-heal: Modal reclaims idle sandboxes, and a cold-start recovery can
      // leave the client holding the DEAD sandbox's id while the iframe shows a
      // fresh one. Observed live: sync returned "Sandbox … has already completed"
      // silently forever, so AI edits never reached the preview. Drop the stale
      // id, reconnect (project-name lookup finds the live sandbox), retry once.
      const dead =
        !result.ok &&
        /already completed|invalid sandbox|not found|not responding|no such sandbox/i.test(
          result.error ?? "",
        );
      if (dead) {
        sandboxIdRef.current = null;
        try {
          sessionStorage.removeItem(storageKey(projectId));
        } catch { /* private mode */ }
        const fresh = await reconnectPreview();
        if (fresh.sandboxId && fresh.sandboxId !== sandboxId) {
          result = await doSync(fresh.sandboxId);
          return { ...result, recovered: result.ok };
        }
      }
      return result;
    },
    [projectId, reconnectPreview],
  );

  useEffect(() => {
    const life = deriveSandboxLifecycle({
      enabled: state.enabled,
      loading: state.loading,
      previewUrl: state.previewUrl,
      phase: state.phase,
      error: state.error,
      phaseDetail: state.phaseDetail,
      paused: state.paused,
      resuming: state.resuming,
    });
    if (life === "booting" && bootStartedAtRef.current == null) {
      bootStartedAtRef.current = Date.now();
    }
    if (lastLifecycleRef.current === life) return;
    const prev = lastLifecycleRef.current;
    lastLifecycleRef.current = life;
    announcePreviewLifecycle(life);
    if (life === "ready") {
      announcePreviewSettled(true);
      resumeColdBootsRef.current = 0;
      const now = Date.now();
      if (bootStartedAtRef.current != null) {
        const ms = now - bootStartedAtRef.current;
        reportPreviewSlo("preview.boot_ms", { ms, projectId });
        reportPreviewSlo("preview.settle_ms", { ms, projectId });
        bootStartedAtRef.current = null;
      }
      if (resumeStartedAtRef.current != null) {
        reportPreviewSlo("preview.resume_ms", { ms: now - resumeStartedAtRef.current, projectId });
        resumeStartedAtRef.current = null;
      }
    }
    if (life === "paused" && prev !== "paused") {
      reportPreviewSlo("preview.pause", { projectId });
    }
  }, [state, projectId]);

  return {
    ...state,
    lifecycle: deriveSandboxLifecycle(state),
    reloadNonce,
    statusResolved,
    requestPreview,
    reconnectPreview,
    resumePreview,
    stopPreview,
    syncFiles,
  };
}
