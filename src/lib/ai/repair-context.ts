import type { ProjectFile } from "../../types/database.ts";

/**
 * How many lines of margin to keep on each side of a windowed excerpt. Wide
 * enough that the model sees genuine surrounding context (the enclosing
 * function, nearby imports it may need to reference), narrow enough that a
 * single error near the middle of a huge file still leaves the excerpt well
 * inside the char budget.
 */
const CONTEXT_WINDOW_MARGIN_LINES = 40;

/**
 * Build the "Relevant files" context sent to the self-verify repair model
 * (see self-verify.ts's runSelfVerification).
 *
 * The previous version always sent bytes 0..maxCharsPerFile of a file's
 * content, unconditionally. For any file bigger than that budget, an error
 * reported past roughly line 150 (6,000 chars / ~40 chars per line) was
 * simply never in the prompt — the file was "sent" to the model but the
 * actual broken line was not, at every repair tier including the escalation
 * model. That made some correctly-diagnosed bugs permanently unfixable by
 * auto-repair, however many rounds or however capable the model.
 *
 * Fix: when a `path:line` can be parsed out of one of the CURRENT errors for
 * a file that is over budget, window the excerpt around that line instead of
 * blindly taking the head of the file. The windowed text is an EXACT
 * substring of the real file — no line-number prefixes or other markup are
 * added inside it — because self-verify.ts's fix prompt instructs the model
 * to copy `search` text "verbatim" from this context for its edit blocks,
 * and anything injected into the text itself would corrupt that copy. The
 * window's bounds are noted only in the `=== path ===` header line, which
 * sits outside the content the model is told to copy from.
 *
 * One deliberate limitation: several errors in the SAME file, far enough
 * apart that their combined [earliest, latest] span (plus margins) still
 * exceeds maxCharsPerFile, get truncated from the start of that span, same
 * as before — a later error's line can still fall outside the excerpt. That
 * was rejected in favor of per-error sub-windows precisely because a second,
 * synthetic boundary marker INSIDE the body (as opposed to the one header
 * line above, which sits outside it) is exactly the kind of text a model
 * copying "verbatim" could sweep into a search block, corrupting the same
 * exact-match contract this function exists to protect. In practice this is
 * rare — errors is capped at a handful of messages total across every file
 * — and it self-corrects: whatever it misses this round remains a reported
 * error next round, driving a fresh, differently-centered window.
 */
export function buildRepairContext(
  contextFiles: ProjectFile[],
  errors: string[],
  maxCharsPerFile = 6_000,
): string {
  const linesByPath = new Map<string, number[]>();
  for (const e of errors) {
    // Matches both gate formats: "src/App.tsx:2:77 — TS2304: …" (typecheck)
    // and "src/App.tsx:4 — imports \"./X\"…" (unresolved import).
    const m = e.match(/^([\w./-]+\.\w+):(\d+)/);
    if (!m) continue;
    const line = Number(m[2]);
    if (!Number.isFinite(line) || line < 1) continue;
    const existing = linesByPath.get(m[1]);
    if (existing) existing.push(line);
    else linesByPath.set(m[1], [line]);
  }

  return contextFiles
    .map((f) => {
      const content = f.content ?? "";
      if (content.length <= maxCharsPerFile) {
        return `=== ${f.path} ===\n${content}`;
      }

      const errorLines = linesByPath.get(f.path);
      if (!errorLines || errorLines.length === 0) {
        // No known error location in this over-budget file — keep the
        // previous head-anchored behavior; it is still the best guess
        // available when nothing better narrows it down (e.g. a file pulled
        // in only by self-verify.ts's heuristic runtime matcher).
        return `=== ${f.path} ===\n${content.slice(0, maxCharsPerFile)}`;
      }

      const lines = content.split("\n");
      const firstLine = Math.max(1, Math.min(...errorLines) - CONTEXT_WINDOW_MARGIN_LINES);
      const lastLine = Math.min(lines.length, Math.max(...errorLines) + CONTEXT_WINDOW_MARGIN_LINES);
      const windowed = lines.slice(firstLine - 1, lastLine).join("\n").slice(0, maxCharsPerFile);
      return `=== ${f.path} (showing lines ${firstLine}-${lastLine} of ${lines.length}, windowed around the reported error) ===\n${windowed}`;
    })
    .join("\n\n");
}
