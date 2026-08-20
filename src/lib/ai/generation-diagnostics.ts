/**
 * Explains WHY a generation was rejected by the contract gate.
 *
 * WHY THIS EXISTS: when the final gate refuses a build, the files are thrown
 * away before they are ever written to project_files — the save happens after
 * the throw. So the only trace left is one sentence naming a file that "is too
 * sparse", with no way to tell whether the model really produced a thin page or
 * whether the check graded the wrong file. A core-loop run failed exactly that
 * way and could not be diagnosed at all: the evidence no longer existed.
 *
 * The distinction that matters most is delegation. A route that renders
 * `<LandingPage />` is a legitimate, well-factored page, but every content
 * heuristic reads it as empty — the same trap the sparse check already sidesteps
 * for a router-only App.tsx. Recording the offending file's local imports makes
 * that case obvious instead of speculative.
 *
 * Deliberately records SHAPE, NEVER CONTENT: paths, byte counts, tag counts and
 * import specifiers. This output lands in server logs and in an error message
 * that reaches the client, and neither is a place to spill a user's generated
 * source. Numbers answer the question; the source would only leak.
 */

export interface RejectedFileSummary {
  path: string;
  bytes: number;
  /** Opening JSX-ish tags — the crude "is there markup here" signal. */
  jsxTags: number;
  /** `<section>` count, the strongest of the richness signals. */
  sections: number;
  /**
   * Project-local imports (`./`, `../`, `@/`). A short file that imports
   * components is delegating, not empty.
   */
  localImports: string[];
}

export interface RejectedGenerationDiagnostic {
  fileCount: number;
  totalBytes: number;
  /** Files named in the validation errors, summarised first. */
  offenders: RejectedFileSummary[];
  /** One bounded line safe to append to an error message. */
  summaryLine: string;
}

const MAX_OFFENDERS = 3;
const MAX_IMPORTS = 8;
const MAX_SUMMARY_CHARS = 400;

/** Paths look like `src/routes/index.tsx` — pull them back out of prose. */
function extractPaths(errorMessages: string[]): string[] {
  const found = new Set<string>();
  for (const message of errorMessages) {
    for (const match of message.matchAll(/[\w.@/-]+\.(?:tsx|ts|jsx|js|css|html|json)\b/g)) {
      found.add(match[0]);
    }
  }
  return [...found];
}

function localImportsOf(content: string): string[] {
  const specifiers = new Set<string>();
  // Covers `import x from "..."`, bare `import "..."`, and `from "..."` in
  // re-exports; the leading group is skipped deliberately.
  for (const match of content.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g)) {
    const specifier = match[1] ?? match[2] ?? "";
    if (specifier.startsWith(".") || specifier.startsWith("@/")) specifiers.add(specifier);
  }
  return [...specifiers].slice(0, MAX_IMPORTS);
}

export function summariseFile(file: { path: string; content: string }): RejectedFileSummary {
  const content = file.content ?? "";
  return {
    path: file.path,
    bytes: content.length,
    jsxTags: (content.match(/<[A-Za-z]/g) ?? []).length,
    sections: (content.match(/<section\b/gi) ?? []).length,
    localImports: localImportsOf(content),
  };
}

export function describeRejectedGeneration(
  files: { path: string; content: string }[],
  errorMessages: string[],
): RejectedGenerationDiagnostic {
  const safeFiles = Array.isArray(files) ? files : [];
  const named = new Set(extractPaths(Array.isArray(errorMessages) ? errorMessages : []));

  const offenders = safeFiles
    .filter((file) => named.has(file.path))
    .slice(0, MAX_OFFENDERS)
    .map(summariseFile);

  const totalBytes = safeFiles.reduce((sum, file) => sum + (file.content?.length ?? 0), 0);

  const offenderText = offenders
    .map(
      (file) =>
        `${file.path} (${file.bytes}B, ${file.jsxTags} tags, ${file.sections} sections` +
        (file.localImports.length > 0 ? `, imports ${file.localImports.join(" ")}` : ", no local imports") +
        ")",
    )
    .join("; ");

  const summaryLine =
    `generated ${safeFiles.length} file(s), ${totalBytes}B total` +
    (offenderText ? ` — ${offenderText}` : "");

  return {
    fileCount: safeFiles.length,
    totalBytes,
    offenders,
    summaryLine:
      summaryLine.length > MAX_SUMMARY_CHARS
        ? `${summaryLine.slice(0, MAX_SUMMARY_CHARS - 1)}…`
        : summaryLine,
  };
}
