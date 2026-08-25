/**
 * Word-level diff for Plan-mode inline revision (Lovable parity, Aug 3 2026).
 *
 * When a user highlights part of a plan and asks for a revision, showing the
 * whole paragraph replaced tells them nothing about what actually changed.
 * This produces the struck-through-removal / highlighted-addition rendering
 * they need to approve a revision at a glance.
 *
 * Word-level rather than character-level on purpose: character diffs of prose
 * shred words into unreadable fragments ("compo~~nent~~*sition*").
 *
 * Words and the whitespace between them are SEPARATE tokens, so
 * `tokens.join("")` reproduces the input byte-for-byte while a word still
 * compares equal to itself regardless of what follows it. Attaching trailing
 * whitespace to each word instead (the obvious first cut) breaks exactly one
 * common case and breaks it invisibly: appending to "a b" makes the final
 * "b" become "b ", so the diff reports the last word deleted and re-inserted
 * rather than a clean append.
 *
 * Algorithm is a standard LCS over tokens. Plans are short (a highlighted
 * excerpt, not a novel), so the O(n·m) table is fine; MAX_TOKENS caps the
 * pathological case rather than letting a paste lock the tab.
 */

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/** Above this token count per side, fall back to a whole-block replace. */
const MAX_TOKENS = 2000;

/**
 * Split into alternating word / whitespace tokens. `tokens.join("")`
 * reconstructs the input exactly.
 */
export function tokenizeWords(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [];
}

/** Longest-common-subsequence table over two token arrays. */
function lcsTable(a: string[], b: string[]): Uint32Array {
  const w = b.length + 1;
  const table = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * w + j] =
        a[i] === b[j]
          ? table[(i + 1) * w + (j + 1)] + 1
          : Math.max(table[(i + 1) * w + j], table[i * w + (j + 1)]);
    }
  }
  return table;
}

/**
 * Diff two strings at word granularity.
 *
 * Adjacent segments with the same op are merged, so a run of changed words
 * renders as one strike-through span instead of several.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return before ? [{ op: "equal", text: before }] : [];
  }
  const a = tokenizeWords(before);
  const b = tokenizeWords(after);

  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    const out: DiffSegment[] = [];
    if (before) out.push({ op: "delete", text: before });
    if (after) out.push({ op: "insert", text: after });
    return out;
  }

  const w = b.length + 1;
  const table = lcsTable(a, b);
  const raw: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      raw.push({ op: "equal", text: a[i] });
      i++;
      j++;
    } else if (table[(i + 1) * w + j] >= table[i * w + (j + 1)]) {
      raw.push({ op: "delete", text: a[i] });
      i++;
    } else {
      raw.push({ op: "insert", text: b[j] });
      j++;
    }
  }
  while (i < a.length) raw.push({ op: "delete", text: a[i++] });
  while (j < b.length) raw.push({ op: "insert", text: b[j++] });

  const merged: DiffSegment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.op === seg.op) last.text += seg.text;
    else merged.push({ ...seg });
  }
  return merged;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

/** Word counts per op — drives the "+N / −M words" summary line. */
export function diffStats(segments: DiffSegment[]): DiffStats {
  const count = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0 };
  for (const s of segments) {
    if (s.op === "insert") stats.added += count(s.text);
    else if (s.op === "delete") stats.removed += count(s.text);
    else stats.unchanged += count(s.text);
  }
  return stats;
}

/**
 * Replace `original` with `revised` inside `full`, at the first exact
 * occurrence. Returns null when the excerpt is absent (the plan changed
 * underneath the user, or the selection spanned rendered markdown that does
 * not appear verbatim in the source) — callers must treat null as "do not
 * apply" rather than falling back to a fuzzy match, since a wrong-position
 * splice silently corrupts the plan.
 */
export function applyExcerptRevision(
  full: string,
  original: string,
  revised: string,
): string | null {
  if (!original) return null;
  const idx = full.indexOf(original);
  if (idx < 0) return null;
  return full.slice(0, idx) + revised + full.slice(idx + original.length);
}

/**
 * Normalize a browser selection for matching against markdown source.
 *
 * A DOM selection carries rendered whitespace (collapsed runs, injected
 * newlines from block elements). Trimming the ends and collapsing interior
 * whitespace to single spaces is what makes `indexOf` land, for the common
 * case of selecting inside one paragraph or list item.
 */
export function normalizeSelection(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Locate a normalized selection inside the raw markdown, tolerating
 * whitespace differences. Returns the VERBATIM source slice (so
 * {@link applyExcerptRevision} can splice it back exactly), or null.
 */
export function findExcerptInSource(source: string, selection: string): string | null {
  const needle = normalizeSelection(selection);
  if (!needle) return null;

  const direct = source.indexOf(needle);
  if (direct >= 0) return source.slice(direct, direct + needle.length);

  // Whitespace-insensitive scan: build a regex from the needle's words so a
  // selection spanning a wrapped line still matches its source form.
  const pattern = needle
    .split(" ")
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern).exec(source);
  return match ? match[0] : null;
}
