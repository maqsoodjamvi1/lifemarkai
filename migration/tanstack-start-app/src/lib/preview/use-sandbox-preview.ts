
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
import { useCallback, useEffect, useRef, useState } from "react";

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

  const applyState = useCallback((next: SandboxPreviewState) => {
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
      if (storedId && data.enabled !== false && !(data.ok && data.previewUrl)) {
        try {
          sessionStorage.removeItem(storageKey(projectId));
        } catch { /* private mode */ }
        data = await tryGet("");
      }

      if (!data.enabled) {
        return applyState(emptyState());
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
      return applyState(
        emptyState({
          error: err instanceof Error ? err.message : "Reconnect failed",
        }),
      );
    }
  }, [applyState, emptyState, projectId]);

  const requestPreview = useCallback(async (): Promise<SandboxPreviewState> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const postOnce = async () => {
        const res = await fetch(`/api/projects/${projectId}/sandbox-preview`, { method: "POST" });
        return res.json() as Promise<{
          enabled?: boolean;
          ok?: boolean;
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
      return applyState(
        emptyState({
          error: err instanceof Error ? err.message : "Request failed",
        }),
      );
    }
  }, [applyState, emptyState, projectId]);

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
      const reconnected = await reconnectPreview();
      if (reconnected.previewUrl) return;
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
   *  The sandbox patcher injects the VEB bridge into every app's index.html,
   *  and the bridge posts `lifemark-veb-ready` to the parent as soon as the
   *  app's HTML actually executes. That makes "did the iframe REALLY paint the
   *  app?" observable: if no bridge ping arrives within 6s of ready, force the
   *  iframe to reload via reloadNonce (3 attempts, doubling backoff), which
   *  re-fetches from the now-healthy vite. */
  const paintAttemptsRef = useRef(0);
  const lastPaintPingRef = useRef(0);
  useEffect(() => {
    if (!state.enabled || !state.previewUrl) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; source?: string } | null;
      if (!d || typeof d !== "object") return;
      if (
        d.type === "lifemark-veb-ready" ||
        d.type === "lifemark-preview-location" ||
        d.source === "lifemark-preview"
      ) {
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
    schedule(6000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state.enabled, state.previewUrl, state.phase]);

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
