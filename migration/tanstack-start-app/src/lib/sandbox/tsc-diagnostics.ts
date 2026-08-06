/**
 * Turn `tsc --noEmit` output into something the repair loop can act on.
 *
 * WHY THIS EXISTS. Generated projects are written in TypeScript and, until now,
 * never type-checked — not before the preview, not after, not at deploy. The
 * `tsconfig` the generator writes says `noEmit: true` and the `package.json` it
 * writes has `"build": "tsc && vite build"`, and nothing ever ran either. The
 * only transpile the code saw was `npm run dev`, and Vite dev STRIPS types
 * rather than checking them. So every wrong prop, wrong generic, missing export
 * and misspelled import reached the user as a blank screen or a runtime stack
 * trace, and the auto-fix loop was left guessing from an error string.
 *
 * The container is what makes this cheap. A running sandbox already has the
 * project's full dependency tree installed at the path it runs from, so `npx
 * tsc --noEmit` there is a few seconds and produces real compiler diagnostics —
 * file, line, column, code, message — for the actual installed versions of the
 * actual packages. That last part matters: it is the only check in the system
 * that can know an import does not exist. A root route importing `Body` from
 * `@tanstack/react-router` is valid-looking text to every regex we have, and
 * `TS2305: Module '"@tanstack/react-router"' has no exported member 'Body'` to
 * a compiler.
 *
 * This module is pure and dependency-free so it can be tested directly.
 */

export interface TscDiagnostic {
  /** Project-relative path, or null for a config-level error with no file. */
  file: string | null;
  line: number | null;
  column: number | null;
  /** The numeric part of `TS2305`. */
  code: number;
  category: "error" | "warning";
  message: string;
}

/**
 * `tsc` must be run with `--pretty false`.
 *
 * With pretty output (its default whenever it thinks it has a TTY — and the
 * sandbox exec does allocate one) diagnostics come back colour-escaped and
 * split across several lines with a source excerpt and a caret. That form is
 * for humans. `--pretty false` produces one diagnostic per line in the stable
 * `path(line,col): category TSxxxx: message` shape parsed below.
 */
const DIAGNOSTIC_RE =
  /^(?:(.+?)\((\d+),(\d+)\):\s*)?(error|warning)\s+TS(\d+):\s*(.*)$/;

/** Lines tsc prints that are not diagnostics. */
function isNoise(line: string): boolean {
  return (
    !line.trim() ||
    /^Found \d+ errors?/.test(line) ||
    /^No errors found/.test(line) ||
    /^\s*Version\s/.test(line) ||
    /^npm (warn|notice)/i.test(line)
  );
}

/**
 * A diagnostic inside an installed dependency is not the project's bug.
 *
 * Generated apps pull ~340 packages, and a stray `.d.ts` incompatibility
 * between two of them is both common and not something the model can fix by
 * editing project source. Reporting them would bury the real errors and send
 * the repair loop off editing files that do not belong to the project.
 */
function isProjectFile(file: string | null): boolean {
  if (!file) return true; // config-level errors are the project's problem
  const norm = file.replace(/\\/g, "/");
  return !norm.includes("node_modules/");
}

/** Strip the container's absolute prefix so paths match the project's own. */
function relativise(file: string, appDir: string): string {
  const norm = file.replace(/\\/g, "/");
  const base = appDir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (base) {
    // `indexOf`, not `startsWith`. tsc reports paths relative to ITS cwd, so
    // the same file can come back as `/home/node/app/src/App.tsx` or as
    // `../../../tmp/proj/src/App.tsx` depending on where it was invoked from.
    // Anchoring on the app directory wherever it appears handles both.
    const at = norm.indexOf(`${base}/`);
    if (at >= 0) return norm.slice(at + base.length + 1);
  }
  return norm.replace(/^\.\//, "");
}

/**
 * Parse raw `tsc --noEmit --pretty false` output.
 *
 * Continuation lines — the indented elaborations under a diagnostic, such as
 * the "Type 'X' is not assignable to type 'Y'" chain — are folded into the
 * preceding message rather than dropped, because that chain is usually where
 * the actual fix is described.
 */
export function parseTscOutput(
  raw: string,
  opts: { appDir?: string } = {},
): TscDiagnostic[] {
  const appDir = opts.appDir ?? "";
  const out: TscDiagnostic[] = [];

  for (const rawLine of String(raw ?? "").split(/\r?\n/)) {
    const line = rawLine.replace(/\[[0-9;]*m/g, ""); // stray colour codes
    if (isNoise(line)) continue;

    const m = DIAGNOSTIC_RE.exec(line.trim());
    if (!m) {
      // Indented elaboration belonging to the diagnostic above it.
      if (out.length > 0 && /^\s+\S/.test(line)) {
        out[out.length - 1].message += ` ${line.trim()}`;
      }
      continue;
    }

    const [, file, lineNo, colNo, category, code, message] = m;
    const rel = file ? relativise(file, appDir) : null;
    if (!isProjectFile(rel)) continue;

    out.push({
      file: rel,
      line: lineNo ? Number(lineNo) : null,
      column: colNo ? Number(colNo) : null,
      code: Number(code),
      category: category === "warning" ? "warning" : "error",
      message: message.trim(),
    });
  }

  return out;
}

/**
 * Diagnostics that mean "this cannot possibly run", separated from the rest.
 *
 * Not every type error stops an app. A wrong generic or an implicit `any` is a
 * real defect and worth showing, but the app still boots. These codes mean a
 * module or a binding genuinely is not there, which is the class that produces
 * a blank preview or a 500 — and the class no regex check in this codebase can
 * detect, because it needs the installed packages to know.
 */
const FATAL_CODES = new Set([
  2304, // Cannot find name 'X'
  2305, // Module '"X"' has no exported member 'Y'
  2306, // File 'X' is not a module
  2307, // Cannot find module 'X' or its corresponding type declarations
  2323, // Cannot redeclare exported variable
  2339, // Property 'X' does not exist on type 'Y'
  2551, // Property 'X' does not exist ... did you mean 'Y'?
  2552, // Cannot find name 'X'. Did you mean 'Y'?
  2614, // Module has no exported member (did you mean default?)
  2724, // Module has no exported member named 'X'
  1005, // syntax: 'X' expected
  1109, // syntax: expression expected
  1128, // syntax: declaration or statement expected
  1381, // syntax: unexpected token
]);

export function isFatal(d: TscDiagnostic): boolean {
  return d.category === "error" && FATAL_CODES.has(d.code);
}

/** Fatal first, then by file and line, so the most actionable is at the top. */
export function rankDiagnostics(diags: TscDiagnostic[]): TscDiagnostic[] {
  return [...diags].sort((a, b) => {
    const fa = isFatal(a) ? 0 : 1;
    const fb = isFatal(b) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const pa = a.file ?? "";
    const pb = b.file ?? "";
    if (pa !== pb) return pa.localeCompare(pb);
    return (a.line ?? 0) - (b.line ?? 0);
  });
}

/**
 * A compact block for a repair prompt.
 *
 * Capped, because a single missing module can cascade into hundreds of
 * downstream errors and a prompt full of consequences buries the cause. Ranked
 * so the cap keeps the ones worth fixing.
 */
export function formatDiagnostics(
  diags: TscDiagnostic[],
  opts: { limit?: number } = {},
): string {
  const limit = opts.limit ?? 20;
  const ranked = rankDiagnostics(diags);
  if (ranked.length === 0) return "";

  const lines = ranked.slice(0, limit).map((d) => {
    const where = d.file
      ? `${d.file}${d.line ? `:${d.line}${d.column ? `:${d.column}` : ""}` : ""}`
      : "(project config)";
    return `- ${where} — TS${d.code}: ${d.message}`;
  });

  const hidden = ranked.length - lines.length;
  if (hidden > 0) lines.push(`- …and ${hidden} more`);
  return lines.join("\n");
}

/** One-line headline for a phase message or a log. */
export function summariseDiagnostics(diags: TscDiagnostic[]): string {
  const errors = diags.filter((d) => d.category === "error");
  if (errors.length === 0) return "No type errors";
  const fatal = errors.filter(isFatal).length;
  const plural = errors.length === 1 ? "" : "s";
  return fatal > 0
    ? `${errors.length} type error${plural} (${fatal} that stop the app from running)`
    : `${errors.length} type error${plural}`;
}
