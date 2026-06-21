"use client";

/**
 * Client hook that requests a real sandbox preview (E2B) for a project and
 * returns the live URL. Falls back transparently: when the sandbox backend
 * isn't configured the API returns { enabled: false } and `enabled` is false,
 * so the caller should keep using the WebContainer / srcdoc engine
 * (see lib/preview/resolve-preview-engine.ts — pass `sandboxUrl` to prefer it).
 *
 * Usage:
 *   const { requestPreview, previewUrl, enabled, loading, error } = useSandboxPreview(projectId);
 *   // call requestPreview() after a build; then:
 *   const engine = resolvePreviewEngine(files, { sandboxUrl: previewUrl, ... });
 *   // if engine === "sandbox", render <iframe src={previewUrl} />
 */
import { useCallback, useRef, useState } from "react";

export interface SandboxPreviewState {
  enabled: boolean;
  previewUrl: string | null;
  sandboxId: string | null;
  loading: boolean;
  error: string | null;
  logs: string | null;
}

export function useSandboxPreview(projectId: string) {
  const [state, setState] = useState<SandboxPreviewState>({
    enabled: false,
    previewUrl: null,
    sandboxId: null,
    loading: false,
    error: null,
    logs: null,
  });
  // Mirror the live sandboxId in a ref so teardown works from unmount cleanup
  // without re-subscribing effects on every state change.
  const sandboxIdRef = useRef<string | null>(null);

  const requestPreview = useCallback(async (): Promise<SandboxPreviewState> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/projects/${projectId}/sandbox-preview`, { method: "POST" });
      const data = await res.json();

      // Backend not configured → caller should use the in-browser engine.
      if (!data.enabled) {
        const next: SandboxPreviewState = {
          enabled: false,
          previewUrl: null,
          sandboxId: null,
          loading: false,
          error: null,
          logs: null,
        };
        setState(next);
        return next;
      }

      sandboxIdRef.current = data.sandboxId ?? null;
      const next: SandboxPreviewState = {
        enabled: true,
        previewUrl: data.previewUrl ?? null,
        sandboxId: data.sandboxId ?? null,
        loading: false,
        error: data.ok ? null : (data.error ?? "Sandbox failed"),
        logs: data.logs ?? null,
      };
      setState(next);
      return next;
    } catch (err) {
      const next: SandboxPreviewState = {
        enabled: false,
        previewUrl: null,
        sandboxId: null,
        loading: false,
        error: err instanceof Error ? err.message : "Request failed",
        logs: null,
      };
      setState(next);
      return next;
    }
  }, [projectId]);

  /**
   * Tear down the running sandbox. Safe to call on unmount — uses sendBeacon so
   * the request survives the page/panel teardown, with a fetch fallback.
   */
  const stopPreview = useCallback(() => {
    const sandboxId = sandboxIdRef.current;
    if (!projectId || !sandboxId) return;
    sandboxIdRef.current = null;
    const url = `/api/projects/${projectId}/sandbox-preview/stop`;
    const payload = JSON.stringify({ sandboxId });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        return;
      }
    } catch {
      /* fall through to fetch */
    }
    void fetch(url, {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  }, [projectId]);

  return { ...state, requestPreview, stopPreview };
}
