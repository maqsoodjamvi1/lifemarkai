const CHUNK_RELOAD_KEY = "lifemark-chunk-reload";
const MAX_CHUNK_RELOADS = 2;

/** True when a dynamic import failed because a webpack/turbopack chunk is missing (stale deploy or dev HMR). */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Failed to load chunk") ||
    msg.includes("Loading chunk") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Failed to fetch dynamically imported module")
  );
}

/** Clear reload counter after a successful editor boot. */
export function clearChunkReloadFlag(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}

/** Reload with cache-bust after a stale chunk 404; returns true if a reload was triggered. */
export function reloadOnceOnChunkError(): boolean {
  if (typeof window === "undefined") return false;
  const attempts = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
  if (attempts >= MAX_CHUNK_RELOADS) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    return false;
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(attempts + 1));
  const url = new URL(window.location.href);
  url.searchParams.set("_cb", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

/** Listen for uncaught chunk-load failures and auto-reload once. */
export function installChunkErrorRecovery(): () => void {
  if (typeof window === "undefined") return () => {};

  function handle(err: unknown) {
    if (!isChunkLoadError(err)) return;
    reloadOnceOnChunkError();
  }

  const onError = (e: ErrorEvent) => handle(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => handle(e.reason);

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/**
 * Wrap a dynamic import so transient chunk 404s (after rebuild/restart) retry once,
 * then force a full page reload to pick up the new asset manifest.
 */
export function importWithRetry<T>(
  importFn: () => Promise<T>,
  opts?: { retries?: number; reloadOnFinalFailure?: boolean }
): () => Promise<T> {
  const retries = opts?.retries ?? 2;
  const reloadOnFinalFailure = opts?.reloadOnFinalFailure ?? true;

  return async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await importFn();
      } catch (err) {
        lastError = err;
        const chunkErr = isChunkLoadError(err);
        if (!chunkErr || attempt >= retries) break;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }

    if (
      reloadOnFinalFailure &&
      typeof window !== "undefined" &&
      isChunkLoadError(lastError)
    ) {
      if (reloadOnceOnChunkError()) {
        return new Promise(() => {});
      }
    }

    throw lastError;
  };
}
