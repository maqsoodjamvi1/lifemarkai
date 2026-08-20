
/**
 * Client hook that requests a Modal sandbox preview (Lovable parity) and returns
 * the live tunnel URL. When Modal isn't configured the API returns
 * `{ enabled: false }` and the editor shows "Modal preview required"
 * (not WebContainer / srcdoc / esbuild).
 *
 * Draft E2B is only used when ENABLE_E2B_SANDBOX=1 / SANDBOX_PROVIDER=e2b.
 *
 * Lovable parity: GET reconnect before cold POST; persist sandboxId in
 * sessionStorage so reloads can reconnect quickly.
 */
import { useCallback,useEffect,useRef,useState } from "react";

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
}

function storageKey(projectId: string) {
  return `lifemark-sandbox-${projectId}`;
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
  });
  const sandboxIdRef = useRef<string | null>(null);
  /** Bumped when a zombie tunnel is healed in place, to force the iframe (which
   *  is stuck on a stale connection-reset page) to reload the recovered URL. */
  const [reloadNonce, setReloadNonce] = useState(0);
  /** One-shot guard for mid-session dead-sandbox auto-recovery (cold re-boot). */
  const coldRetryRef = useRef(false);
  const bootedRef = useRef(false);
  const statusCheckedRef = useRef(false);

  /**
   * The latest state, readable from a callback without becoming a dependency.
   *
   * Needed by the catch blocks below, which must preserve `enabled` rather than
   * reset it — and cannot close over `state` without re-creating every callback
   * on each render.
   */
  const stateRef = useRef(state);

  const applyState = useCallback((next: SandboxPreviewState) => {
    stateRef.current = next;
    sandboxIdRef.current = next.sandboxId;
    if (projectId) {
      try {
        if (next.sandboxId) {
          sessionStorage.setItem(storageKey(projectId), next.sandboxId);
        } else {
          sessionStorage.removeItem(storageKey(projectId));
        }
      } catch { /* private mode */ }
    }
    setState(next);
    return next;
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
      ...partial,
    }),
    [],
  );

  const reconnectPreview = useCallback(async (): Promise<SandboxPreviewState> => {
    setState((s) => ({ ...s, loading: true, error: null }));
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
          previewUrl: null,
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
          phase: typeof data.phase === "string" ? data.phase : "ready",
          phaseDetail: typeof data.phaseDetail === "string" ? data.phaseDetail : null,
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
          previewUrl: null,
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
  }, [applyState, projectId]);

  /** Preflight: know Modal is configured before boot (skip WebContainer). */
  const [statusResolved, setStatusResolved] = useState(false);
  useEffect(() => {
    if (statusCheckedRef.current) return;
    statusCheckedRef.current = true;
    void fetch("/api/sandbox/status")
      .then((r) => r.json())
      .then((data: { enabled?: boolean; provider?: string }) => {
        if (!data.enabled) return;
        setState((s) => ({
          ...s,
          enabled: true,
          provider: typeof data.provider === "string" ? data.provider : s.provider,
          loading: true,
          phase: s.phase ?? "creating",
        }));
      })
      .catch(() => {})
      // Resolved either way — until this flips, the panel must show a neutral
      // loading state, never the "backend not configured" setup pane (it used
      // to flash setup instructions at every editor open).
      .finally(() => setStatusResolved(true));
  }, []);

  /** Lovable parity: reconnect warm sandbox first, cold-provision only if needed. */
  useEffect(() => {
    if (!projectId || bootedRef.current) return;
    bootedRef.current = true;
    void (async () => {
      setState((s) => ({ ...s, loading: true, phase: "creating", phaseDetail: "Connecting…" }));

      // Only try to reconnect when there is something to reconnect TO.
      //
      // On a first-ever preview sessionStorage is empty, so this reconnect was
      // a GET that could not possibly succeed — and it was not cheap. The
      // route pays the full auth stack (getSession then getUser, sequential),
      // the project-access lookup and a projects read before it reaches the
      // line that says "no sandbox id" and gives up: four sequential database
      // round trips blocking the cold boot, to learn what an empty
      // sessionStorage key already said.
      //
      // The warm path is untouched — a stored id still reconnects first, and
      // "starting" still short-circuits the cold boot.
      let storedId: string | null = null;
      try {
        storedId = sessionStorage.getItem(storageKey(projectId));
      } catch { /* private mode */ }

      if (storedId) {
        const reconnected = await reconnectPreview();
        if (reconnected.previewUrl) return;
        // "starting" means reconnect found a live sandbox whose app hasn't
        // answered yet. Cold-booting on top of that would delete the container
        // it just found and restart a boot that is already nearly done.
        if (reconnected.phase === "starting") return;
      }

      setState((s) => ({ ...s, phase: "creating", phaseDetail: "Cold start…" }));
      await requestPreview();
    })();
  }, [projectId, reconnectPreview, requestPreview]);

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
          if (d.alive === false || d.tunnelHealthy === false) {
            sandboxIdRef.current = null;
            try { sessionStorage.removeItem(storageKey(projectId)); } catch { /* private */ }
            // Drop the dead tunnel URL immediately so the iframe stops showing a
            // blank/connection-reset page while the cold boot runs.
            setState((s) => ({
              ...s,
              previewUrl: null,
              sandboxId: null,
              loading: true,
              error: null,
              phase: "creating",
              phaseDetail: "Sandbox expired — restarting…",
            }));
            void requestPreview();
          } else if (d.restarted && d.tunnelHealthy) {
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
  }, [projectId, state.enabled, state.previewUrl, requestPreview]);

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
            setState((s) => ({
              ...s,
              phase: data.phase ?? s.phase,
              phaseDetail:
                typeof data.phaseDetail === "string" ? data.phaseDetail : s.phaseDetail,
            }));
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
            data.phase === "error" ||
            data.phase === "unreachable" ||
            /already finished|already completed|FAILED_PRECONDITION|terminated|Container no longer exists|no longer responding/i.test(
              `${data.phaseDetail ?? ""} ${data.error ?? ""}`,
            );
          if (deadPhase && !coldRetryRef.current) {
            coldRetryRef.current = true;
            sandboxIdRef.current = null;
            try { sessionStorage.removeItem(storageKey(projectId)); } catch { /* private */ }
            setState((s) => ({
              ...s,
              previewUrl: null,
              sandboxId: null,
              loading: true,
              error: null,
              phase: "creating",
              phaseDetail: "Sandbox expired — restarting…",
            }));
            void requestPreview().then((next) => {
              // Allow another recovery on the NEXT death only after success.
              if (next.previewUrl) coldRetryRef.current = false;
            });
          }
        })
        .catch(() => {});
    }, 1200);
    return () => window.clearInterval(timer);
  }, [projectId, state.enabled, state.previewUrl, state.loading, state.error, state.phase, state.provider, applyState, requestPreview]);

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

  return { ...state, reloadNonce, statusResolved, requestPreview, reconnectPreview, stopPreview, syncFiles };
}
