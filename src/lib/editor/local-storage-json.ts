/**
 * chat-panel.tsx has ~20 separate localStorage read/write sites (queue-pause
 * flag, chat density, recent searches, bookmarks, pinned message, composer
 * draft, clarify-mode draft) — each one hand-rolling its own
 * try/JSON.parse/catch-and-fall-back boilerplate. That repetition was flagged
 * in a fragility audit as part of why the file is hard to reason about.
 *
 * These are drop-in, behavior-preserving replacements for that exact
 * boilerplate — same private-browsing/quota-exceeded safety (silently
 * fall back / no-op), same JSON.parse failure handling — just without
 * re-deriving it at every call site. Deliberately NOT a bigger abstraction
 * (no subscription, no React hook): the call sites keep their own state
 * and effect timing exactly as-is, this only removes the duplicated
 * get/parse/catch and stringify/set mechanics underneath them.
 */

/** Read and JSON.parse a localStorage key; `fallback` on missing key, parse failure, or (SSR/private-mode) no localStorage. */
export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Read a raw (non-JSON) localStorage string; `fallback` on missing key or (SSR/private-mode) no localStorage. */
export function readString(key: string, fallback: string | null = null): string | null {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

/** JSON.stringify and write a localStorage key; no-ops (rather than throwing) in private mode or over quota. */
export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / quota exceeded — same silent-ignore behavior every
    // call site already had.
  }
}

/** Write a raw (non-JSON) localStorage string; no-ops in private mode or over quota. */
export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode / quota exceeded
  }
}

/** Remove a localStorage key; no-ops in private mode. */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // private mode
  }
}
