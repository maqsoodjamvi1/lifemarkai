/**
 * Last-known-good HTML snapshot cache for the sandbox preview.
 *
 * Purpose: when a generated app's dev server becomes unhealthy or crashes
 * after having served at least one good response, the preview layer should
 * degrade to the last successfully-rendered HTML instead of showing a raw
 * connection error or a blank iframe. This module is the in-memory store
 * for that "last known good" snapshot, keyed by project/session id.
 *
 * Deliberately simple and dependency-free: an in-memory Map is sufficient
 * because a snapshot only needs to survive for the lifetime of this server
 * process, and losing it on a process restart is fine (the next successful
 * live fetch repopulates it). Do not add persistence here without a clear
 * need - the goal is a lightweight fallback, not a durable cache.
 */

interface SnapshotEntry {
  html: string;
  capturedAt: number;
  status: number;
}

const MAX_ENTRIES = 200;
const MAX_HTML_BYTES = 2_000_000;

const snapshots = new Map<string, SnapshotEntry>();

/**
 * Record a successfully-served HTML response as the last known good
 * snapshot for `key` (typically a projectId or sandboxId). Oversized
 * bodies are ignored so a pathological page cannot balloon memory.
 */
export function setSnapshot(key: string, html: string, status = 200): void {
  if (!key || !html) return;
  if (html.length > MAX_HTML_BYTES) return;

  // Simple bound on total entries: evict the oldest when full.
  if (!snapshots.has(key) && snapshots.size >= MAX_ENTRIES) {
    const oldestKey = [...snapshots.entries()].sort(
      (a, b) => a[1].capturedAt - b[1].capturedAt,
    )[0]?.[0];
    if (oldestKey) snapshots.delete(oldestKey);
  }

  snapshots.set(key, { html, capturedAt: Date.now(), status });
}

/** Fetch the last known good snapshot for `key`, if any. */
export function getSnapshot(
  key: string,
): { html: string; capturedAt: number; status: number } | undefined {
  return snapshots.get(key);
}

export function hasSnapshot(key: string): boolean {
  return snapshots.has(key);
}

export function clearSnapshot(key: string): void {
  snapshots.delete(key);
}
