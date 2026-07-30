
/**
 * usePreviewToken — fetches a short-lived signed preview URL for a project from
 * /api/preview/token and keeps it fresh. Falls back gracefully to the plain
 * same-origin preview path when tokens aren't configured on the server (501),
 * so the editor keeps working in local/dev.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { buildPreviewUrl, withLoadId, newLoadId } from "@/lib/preview/preview-url";

interface PreviewTokenState {
  url: string;
  token: string | null;
  loading: boolean;
  error: string | null;
  /** Force a re-mint. */
  refresh: () => void;
}

export function usePreviewToken(projectId: string | undefined, sha?: string): PreviewTokenState {
  // Stable per-mount correlation id (parity with Lovable's __lovable_load_id).
  const loadIdRef = useRef<string>(newLoadId());
  const loadId = loadIdRef.current;
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string>(
    projectId ? buildPreviewUrl({ projectId, sha, loadId }) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mint = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/preview/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sha }),
      });
      if (res.status === 501) {
        // Tokens not configured — use the unsigned same-origin URL.
        setToken(null);
        setUrl(buildPreviewUrl({ projectId, sha, loadId }));
        return;
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { token: string; url: string; expiresAt: number };
      setToken(data.token);
      setUrl(withLoadId(data.url, loadId));
      // Re-mint at 80% of the token lifetime.
      const msUntilRefresh = Math.max(30_000, (data.expiresAt * 1000 - Date.now()) * 0.8);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void mint(), msUntilRefresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mint preview token");
      if (projectId) setUrl(buildPreviewUrl({ projectId, sha, loadId }));
    } finally {
      setLoading(false);
    }
  }, [projectId, sha, loadId]);

  useEffect(() => {
    void mint();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [mint]);

  return { url, token, loading, error, refresh: mint };
}
