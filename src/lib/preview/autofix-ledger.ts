/**
 * Persistent auto-fix ledger.
 *
 * The preview auto-fix loop is guarded by `autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS`,
 * but that counter is React state — it resets to 0 on every mount. So for a project
 * whose preview error the fixer CANNOT repair (e.g. a component imports a file that
 * was never created), the loop reran on every editor open: 3 more `/api/ai/fix`
 * calls, 3 more failures, every single time the user opened the project. The user
 * paid, repeatedly, for a fix attempt that had already been proven to fail.
 *
 * This records "we already tried error E on project P, N times" in localStorage, so
 * attempts survive a reload. The ledger is keyed by a NORMALISED error signature
 * (line numbers, URLs and timestamps stripped) so the same underlying error is
 * recognised across reloads even though its stack text shifts slightly.
 *
 * The ledger is cleared whenever the code changes (see `clearAutoFixLedger`) —
 * a failure only tells us the fixer couldn't repair THAT code, so once the code
 * moves on, retrying is fair again.
 */

const KEY_PREFIX = "lm:autofix:";
/** Stale entries are dropped so an old failure can't suppress fixes forever. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Ledger = Record<string, { n: number; ts: number }>;

/**
 * Collapse an error into a stable identity.
 *
 * Stack traces embed bundle offsets, CDN URLs and timestamps that change between
 * loads; without normalising, the "same" error looks new every time and the guard
 * never trips.
 */
export function autoFixSignature(error: string): string {
  return error
    .slice(0, 2_000)
    .replace(/https?:\/\/\S+/g, "")       // CDN/bundle URLs
    .replace(/:\d+:\d+/g, "")              // :line:col
    .replace(/\b\d{3,}\b/g, "")            // offsets, timestamps
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // private mode / blocked storage — degrade to in-memory behaviour
  }
}

function read(projectId: string): Ledger {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(KEY_PREFIX + projectId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Ledger;
    const now = Date.now();
    const fresh: Ledger = {};
    for (const [sig, rec] of Object.entries(parsed)) {
      if (rec && typeof rec.n === "number" && now - (rec.ts ?? 0) < TTL_MS) fresh[sig] = rec;
    }
    return fresh;
  } catch {
    return {};
  }
}

function write(projectId: string, ledger: Ledger): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY_PREFIX + projectId, JSON.stringify(ledger));
  } catch {
    /* quota / blocked — non-critical */
  }
}

/** How many times we've already tried (and failed) to auto-fix this exact error. */
export function getAutoFixAttempts(projectId: string, error: string): number {
  return read(projectId)[autoFixSignature(error)]?.n ?? 0;
}

/** Record one more attempt against this error. Returns the new count. */
export function recordAutoFixAttempt(projectId: string, error: string): number {
  const ledger = read(projectId);
  const sig = autoFixSignature(error);
  const n = (ledger[sig]?.n ?? 0) + 1;
  ledger[sig] = { n, ts: Date.now() };
  write(projectId, ledger);
  return n;
}

/**
 * Forget past failures for this project.
 *
 * Call when the code changes (a build/edit/manual fix landed) or when the user
 * explicitly asks to retry — the previous failures were about the OLD code.
 */
export function clearAutoFixLedger(projectId: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY_PREFIX + projectId);
  } catch {
    /* non-critical */
  }
}
