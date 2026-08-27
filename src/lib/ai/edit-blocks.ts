/**
 * Anchored SEARCH/REPLACE edits — so a repair stops paying for the whole file.
 *
 * Every repair and edit prompt in this repo demands "COMPLETE file content
 * only". That contract is easy to validate but brutally expensive: a one-line
 * fix to a 300-line component bills ~300 lines of output tokens, and output is
 * the dear direction on every model in the ladder (Luna 6x, Sonnet 5x input
 * price). It is also the direct cause of the truncation-corruption class the
 * repair guard exists to catch — models truncate long outputs, never short
 * ones.
 *
 * This module accepts the block format most coding models already emit
 * natively:
 *
 *   src/components/Header.tsx
 *   <<<<<<< SEARCH
 *   const title = "Wrong";
 *   =======
 *   const title = "Right";
 *   >>>>>>> REPLACE
 *
 * The safety story, because a partial apply is worse than a failed one:
 *
 *   - SEARCH must match EXACTLY ONCE in the target file. Zero matches means
 *     the model hallucinated the current code; two means the edit is
 *     ambiguous. Both reject the block. A whitespace-tolerant retry (trailing
 *     whitespace stripped per line) runs before rejecting, because CRLF and
 *     trailing-space drift are noise, not signal.
 *   - Application is ALL-OR-NOTHING per file set. One failed block rejects the
 *     whole batch and the caller falls back to the existing whole-file path,
 *     so the worst case is exactly yesterday's behaviour and cost.
 *   - Deleting a file is not expressible here, deliberately. Destructive
 *     operations keep the heavier whole-file contract and its guards.
 */

export interface EditBlock {
  path: string;
  search: string;
  replace: string;
}

/**
 * Validate a raw edits array from a model response. STRICT: one malformed
 * entry rejects the whole batch. The first integration filtered bad entries
 * and applied the survivors, which quietly violated the all-or-nothing
 * contract this module advertises — three proposed edits, one malformed, two
 * applied is exactly the half-applied repair the design exists to prevent.
 * Caught in external review.
 */
export function validateEditBatch(
  edits: unknown,
): { ok: true; blocks: EditBlock[] } | { ok: false; reason: string } {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, reason: "edits is not a non-empty array" };
  }
  const blocks: EditBlock[] = [];
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i] as Partial<EditBlock> | null;
    if (
      !e || typeof e.path !== "string" || !e.path.trim() ||
      typeof e.search !== "string" || typeof e.replace !== "string"
    ) {
      return { ok: false, reason: `edit ${i} is malformed — rejecting the whole batch` };
    }
    blocks.push({ path: e.path, search: e.search, replace: e.replace });
  }
  return { ok: true, blocks };
}

export interface ApplyResult {
  ok: boolean;
  /** path -> new content, only when ok. */
  files: Map<string, string>;
  /** Human-readable reasons, one per failed block, only when !ok. */
  failures: string[];
}

const BLOCK_RE =
  /^\s*(\S[^\n]*)\n<{7} SEARCH\n([\s\S]*?)\n={7}\n([\s\S]*?)\n>{7} REPLACE\s*$/;

/**
 * Extract SEARCH/REPLACE blocks from a model response. Returns [] when the
 * response contains none — which is the signal to use the whole-file parser,
 * not an error.
 */
export function parseEditBlocks(response: string): EditBlock[] {
  if (!response || !response.includes("<<<<<<< SEARCH")) return [];
  const out: EditBlock[] = [];
  // Split on block ends so one malformed block cannot swallow its neighbours.
  const chunks = response.split(/(?<=>{7} REPLACE)/);
  for (const chunk of chunks) {
    const start = chunk.lastIndexOf("<<<<<<< SEARCH");
    if (start === -1) continue;
    // Walk back from the marker to the nearest preceding non-empty line — the
    // file path. Models put ``` fences and prose around blocks; tolerate both.
    const before = chunk.slice(0, start).split("\n").map((l) => l.trim()).filter(
      (l) => l && !/^`{3}|^(typescript|tsx|jsx|javascript)$/i.test(l),
    );
    const path = before[before.length - 1]?.replace(/^["'`]|["'`:]+$/g, "");
    const body = chunk.slice(start);
    const m = `${path}\n${body}`.match(BLOCK_RE);
    if (!m || !path || !/[\w./-]+\.\w+$/.test(path)) continue;
    out.push({ path, search: m[2], replace: m[3] });
  }
  return out;
}

const stripTrail = (s: string) =>
  s.split("\n").map((l) => l.replace(/[ \t\r]+$/, "")).join("\n");

/**
 * Whitespace-tolerant match that PRESERVES the original file.
 *
 * The first version of this fallback normalised the whole source and saved the
 * normalised text — so a one-line repair silently rewrote every line ending
 * and trailing space in the file. In a repo that genuinely contains CRLF files
 * (this one), that is a full-file rewrite wearing a one-line disguise, and it
 * would have re-created the exact line-ending churn this session spent hours
 * digging out of. Caught in external review before it shipped.
 *
 * Instead: compare line-by-line under normalisation to FIND the unique match,
 * then splice the replacement into the ORIGINAL lines. Every byte outside the
 * matched span survives untouched, including its whitespace sins.
 */
function spliceNormalized(
  source: string,
  search: string,
  replace: string,
): string | "absent" | "ambiguous" {
  const srcLines = source.split("\n");
  const needle = stripTrail(search).split("\n");
  if (needle.length === 0) return "absent";
  const matches: number[] = [];
  for (let i = 0; i + needle.length <= srcLines.length; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (srcLines[i + j].replace(/[ \t\r]+$/, "") !== needle[j]) { hit = false; break; }
    }
    if (hit) matches.push(i);
  }
  if (matches.length === 0) return "absent";
  if (matches.length > 1) return "ambiguous";
  const at = matches[0];
  return [
    ...srcLines.slice(0, at),
    ...replace.split("\n"),
    ...srcLines.slice(at + needle.length),
  ].join("\n");
}

/** Count non-overlapping occurrences of needle in haystack. */
function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * Apply blocks to a file set. All-or-nothing: any failure returns the reasons
 * and NO modified content, so a caller can never half-apply a repair.
 */
export function applyEditBlocks(
  blocks: readonly EditBlock[],
  files: ReadonlyMap<string, string>,
): ApplyResult {
  const failures: string[] = [];
  // Work on copies so multiple blocks against one file compose.
  const working = new Map<string, string>();

  for (const b of blocks) {
    if (!b.search.trim()) {
      failures.push(`${b.path}: empty SEARCH — refusing a blind replacement`);
      continue;
    }
    const original = working.get(b.path) ?? files.get(b.path);
    if (original === undefined) {
      failures.push(`${b.path}: file not in the project`);
      continue;
    }
    const count = occurrences(original, b.search);
    if (count > 1) {
      failures.push(`${b.path}: SEARCH text appears ${count} times — ambiguous, widen the anchor`);
      continue;
    }
    if (count === 1) {
      working.set(b.path, original.replace(b.search, b.replace));
      continue;
    }
    // Whitespace-tolerant second pass: trailing space/CR drift is noise. The
    // splice preserves every untouched byte of the original — see
    // spliceNormalized for why that property is non-negotiable here.
    const spliced = spliceNormalized(original, b.search, b.replace);
    if (spliced === "absent") {
      failures.push(`${b.path}: SEARCH text not found — the file does not contain that code`);
      continue;
    }
    if (spliced === "ambiguous") {
      failures.push(`${b.path}: SEARCH text appears more than once — ambiguous, widen the anchor`);
      continue;
    }
    working.set(b.path, spliced);
  }

  if (failures.length > 0) return { ok: false, files: new Map(), failures };
  return { ok: true, files: working, failures: [] };
}

/** The contract paragraph repair prompts append. One place, both call sites. */
export const EDIT_BLOCKS_INSTRUCTION = `
PREFERRED OUTPUT — targeted edits. For each change, emit:

<file path>
<<<<<<< SEARCH
<the exact current lines, copied verbatim — enough surrounding lines to be unique>
=======
<the replacement lines>
>>>>>>> REPLACE

Rules: SEARCH must be copied exactly from the file shown above and must be unique within it. Use several small blocks rather than one large one. Only fall back to returning complete files as JSON when a file must be created from scratch or rewritten almost entirely.`;
