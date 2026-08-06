/**
 * Collapse a failure into a stable identity, so the same bug is recognisable
 * across projects, sessions and users.
 *
 * WHY THIS IS THE FIRST BRICK. Nothing in this system currently knows whether a
 * repair worked. `ai_eval_log` records whether the HTTP call to the model
 * returned, not whether the code ran. Pre-fix error counts, post-fix error
 * counts, which issue types repair reliably and which never do — all of it is
 * discarded at a couple of `logger.info` calls. That is why the "learned rules"
 * path can only ever emit one of seven paragraphs somebody typed by hand: there
 * is no data for it to learn from.
 *
 * A fingerprint is what makes the data aggregatable. Without one, every
 * occurrence of the same failure looks new — stack traces carry bundle offsets,
 * cache-busting query strings and content hashes that change on every load, and
 * compiler diagnostics carry line and column numbers that move whenever anyone
 * edits the file above them.
 *
 * WHAT IS DELIBERATELY KEPT. Quoted identifiers survive normalisation. In
 * `Module '"@tanstack/react-router"' has no exported member 'Body'` the two
 * quoted strings ARE the bug; strip them and every missing-export error in the
 * system collapses into one meaningless bucket. Positions are noise, names are
 * signal.
 *
 * No imports, so it runs identically on the server (recording), in a test, and
 * in the browser (where `autofix-ledger` already needs this exact notion of
 * sameness and currently keeps its own copy in localStorage).
 */

export type FailureKind = "typecheck" | "runtime" | "validation" | "build";

export interface FailureIdentity {
  /** Short stable hex, safe as a database index key. */
  fingerprint: string;
  /** Human-readable, truncated — what a dashboard row shows. */
  label: string;
  kind: FailureKind;
}

/**
 * FNV-1a, 32-bit, rendered hex.
 *
 * Hand-rolled rather than `node:crypto` so this module stays importable from
 * the browser and from a bare `node --test` run with no resolver configured.
 * Collision risk is irrelevant here: this is a grouping key for error text, not
 * a security primitive, and a collision costs one mislabelled dashboard row.
 */
function hash32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Everything that varies between two occurrences of the same failure. */
function normaliseText(input: string): string {
  return (
    input
      .slice(0, 4_000)
      // URLs, including the sandbox's per-project preview host.
      .replace(/https?:\/\/\S+/g, "«url»")
      // Vite's cache-busting and content hashes: ?v=7daf3511, chunk-UAD7S5IU.js
      .replace(/\?v=[a-f0-9]+/gi, "")
      .replace(/-[A-Za-z0-9_]{8}\.(js|mjs|css)\b/g, ".$1")
      // Positions: :12:34, (12,34)
      .replace(/[:(]\d+[:,]\d+\)?/g, "")
      // Bare long numbers — offsets, timestamps, byte counts.
      .replace(/\b\d{3,}\b/g, "«n»")
      // Absolute paths inside the container leak the sandbox layout.
      .replace(/\/home\/node\/app\//g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * A compiler diagnostic — the highest-quality input this takes.
 *
 * The TS code alone is most of the identity, and unlike a runtime string it is
 * already structured, so the fingerprint is stable without guesswork.
 */
export function fingerprintDiagnostic(d: {
  code: number;
  message: string;
  file?: string | null;
}): FailureIdentity {
  const message = normaliseText(d.message);
  // The file is part of the identity but its directory is not: the same model
  // mistake in `src/routes/index.tsx` and `src/routes/about.tsx` is one bug.
  const basename = (d.file ?? "").split("/").pop() ?? "";
  const ext = basename.includes(".") ? `.${basename.split(".").pop()}` : "";
  return {
    fingerprint: `ts${d.code}-${hash32(`${d.code}|${ext}|${message}`)}`,
    label: `TS${d.code}: ${message}`.slice(0, 300),
    kind: "typecheck",
  };
}

/** A runtime error string from the preview bridge, or any raw failure text. */
export function fingerprintError(
  raw: string,
  kind: FailureKind = "runtime",
): FailureIdentity {
  // Only the first line plus the first stack frame carry identity; the rest of
  // a stack is framework internals that differ by version and bundling.
  const lines = String(raw ?? "").split(/\r?\n/);
  const head = lines[0] ?? "";
  const frame = lines.slice(1).find((l) => /\bat\b/.test(l)) ?? "";
  const norm = normaliseText(`${head} ${frame}`);
  return {
    fingerprint: `${kind.slice(0, 2)}-${hash32(norm)}`,
    label: norm.slice(0, 300),
    kind,
  };
}

/** A `validateGeneratedFiles` issue — already structured, so keep its type. */
export function fingerprintValidation(issue: {
  type: string;
  message: string;
  file?: string | null;
}): FailureIdentity {
  const message = normaliseText(issue.message);
  return {
    fingerprint: `va-${hash32(`${issue.type}|${message}`)}`,
    label: `${issue.type}: ${message}`.slice(0, 300),
    kind: "validation",
  };
}

/**
 * The set of distinct failures in a batch, in first-seen order.
 *
 * Repair rounds are scored on SETS, not counts. A round that fixes one error
 * and introduces another leaves the count unchanged while having made things
 * strictly worse, and a count-based label would record that as neutral —
 * teaching the system nothing, or the wrong thing.
 */
export function distinctFingerprints(identities: FailureIdentity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of identities) {
    if (seen.has(id.fingerprint)) continue;
    seen.add(id.fingerprint);
    out.push(id.fingerprint);
  }
  return out;
}

/**
 * Did a repair round actually help?
 *
 * Returns the fingerprints it cleared and the ones it CAUSED. The second list
 * is the one worth having: a repair that introduces a failure the project did
 * not have is the ratchet that turned one bad write into a dead project, and it
 * is invisible to any measure based on totals.
 */
export function scoreRepair(
  before: FailureIdentity[],
  after: FailureIdentity[],
): { resolved: string[]; introduced: string[]; remaining: string[] } {
  const b = new Set(distinctFingerprints(before));
  const a = new Set(distinctFingerprints(after));
  return {
    resolved: [...b].filter((f) => !a.has(f)),
    introduced: [...a].filter((f) => !b.has(f)),
    remaining: [...b].filter((f) => a.has(f)),
  };
}
