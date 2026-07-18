"use client";

/**
 * Client hook that requests a real cloud sandbox preview (Modal — Lovable parity;
 * E2B fallback) for a project and returns the live tunnel URL. When the sandbox
 * backend isn't configured the API returns { enabled: false } and `enabled` is false,
 * so the caller should keep using the WebContainer / srcdoc engine
 * (see lib/preview/resolve-preview-engine.ts — pass `sandboxUrl` to prefer it).
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
  });
  const sandboxIdRef = useRef<string | null>(null);
  const bootedRef = useRef(false);
  const statusCheckedRef = useRef(false);

  const applyState = useCallback((next: SandboxPreviewState) => {
    sandboxIdRef.current = next.sandboxId;
    if (next.sandboxId && projectId) {
      try {
        sessionStorage.setItem(storageKey(projectId), next.sandboxId);
      } catch { /* private mode */ }
    }
    setState(next);
    return next;
  }, [projectId]);

  const reconnectPreview = useCallback(async (): Promise<SandboxPreviewState> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      let storedId: string | null = null;
      try {
        storedId = sessionStorage.getItem(storageKey(projectId));
      } catch { /* private mode */ }
      const qs = storedId ? `?sandboxId=${encodeURIComponent(storedId)}` : "";
      const res = await fetch(`/api/projects/${projectId}/sandbox-preview${qs}`, { method: "GET" });
      const data = await res.json();

      if (!data.enabled) {
        return applyState({
          enabled: false,
          previewUrl: null,
          sandboxId: null,
          provider: null,
          loading: false,
          error: null,
          logs: null,
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
        });
      }

      return applyState({
        enabled: true,
        previewUrl: null,
        sandboxId: null,
        provider: typeof data.provider === "string" ? data.provider : null,
        loading: false,
        error: null,
        logs: null,
      });
    } catch (err) {
      return applyState({
        enabled: false,
        previewUrl: null,
        sandboxId: null,
        provider: null,
        loading: false,
        error: err instanceof Error ? err.message : "Reconnect failed",
        logs: null,
      });
    }
  }, [applyState, projectId]);

  const requestPreview = useCallback(async (): Promise<SandboxPreviewState> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/projects/${projectId}/sandbox-preview`, { method: "POST" });
      const data = await res.json();

      if (!data.enabled) {
        return applyState({
          enabled: false,
          previewUrl: null,
          sandboxId: null,
          provider: null,
          loading: false,
          error: null,
          logs: null,
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
      });
    } catch (err) {
      return applyState({
        enabled: false,
        previewUrl: null,
        sandboxId: null,
        provider: null,
        loading: false,
        error: err instanceof Error ? err.message : "Request failed",
        logs: null,
      });
    }
  }, [applyState, projectId]);

  /** Preflight: know cloud sandbox is configured before boot (skip WebContainer). */
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
        }));
      })
      .catch(() => {});
  }, []);

  /** Lovable parity: reconnect warm sandbox first, cold-provision only if needed. */
  useEffect(() => {
    if (!projectId || bootedRef.current) return;
    bootedRef.current = true;
    void (async () => {
      const reconnected = await reconnectPreview();
      if (reconnected.previewUrl) return;
      await requestPreview();
    })();
  }, [projectId, reconnectPreview, requestPreview]);

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
    async (files: Array<{ path: string; content: string }>): Promise<void> => {
      const sandboxId = sandboxIdRef.current;
      if (!projectId || !sandboxId || files.length === 0) return;
      try {
        await fetch(`/api/projects/${projectId}/sandbox-preview/sync`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId, files }),
        });
      } catch {
        /* best-effort */
      }
    },
    [projectId],
  );

  return { ...state, requestPreview, reconnectPreview, stopPreview, syncFiles };
}
