/**
 * Structural code search & rewrite via ast-grep (Rust, in-process through
 * @ast-grep/napi). This is AST-pattern matching, not text matching:
 * "console.log($$$A)" matches every call regardless of formatting,
 * whitespace, or line breaks, and NEVER matches inside strings/comments.
 *
 * Why this exists: it makes the agent's multi-file edits verifiable and
 * mechanical. "Add error handling to every fetch" becomes a pattern query
 * the agent can run to find call sites and to PROVE afterwards that none
 * remain — instead of hoping the model spotted every occurrence.
 *
 * Fail-soft: @ast-grep/napi is a native binary. If it can't load on the
 * current platform, every function returns a clear "unavailable" result
 * and the agent falls back to search_code (text) + edit_file.
 */

type SgMatchRange = {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
};

interface SgNode {
  text(): string;
  range(): SgMatchRange;
  replace(rewrite: string): { insertedText: string; startPos: number; endPos: number };
  getMatch(name: string): SgNode | null;
  getMultipleMatches(name: string): SgNode[];
}

interface SgRoot {
  findAll(pattern: string): SgNode[];
  commitEdits(edits: Array<{ insertedText: string; startPos: number; endPos: number }>): string;
}

interface AstGrepModule {
  parse(lang: unknown, source: string): { root(): SgRoot };
  Lang: Record<string, unknown>;
}

let modPromise: Promise<AstGrepModule | null> | null = null;

async function loadAstGrep(): Promise<AstGrepModule | null> {
  if (!modPromise) {
    modPromise = import("@ast-grep/napi")
      .then((m) => m as unknown as AstGrepModule)
      .catch(() => null);
  }
  return modPromise;
}

/** Extensions ast-grep can parse with the napi built-in language set. */
export function astGrepLangFor(path: string, Lang: Record<string, unknown>): unknown | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "tsx":
    case "jsx":
      // Tsx parses JSX in both .tsx and .jsx reliably.
      return Lang.Tsx;
    case "ts":
    case "mts":
    case "cts":
      return Lang.TypeScript;
    case "js":
    case "mjs":
    case "cjs":
      return Lang.JavaScript;
    case "css":
      return Lang.Css;
    case "html":
      return Lang.Html;
    default:
      return null;
  }
}

export interface StructuralMatch {
  path: string;
  /** 1-based line of the match start */
  line: number;
  /** Matched source text (first line, truncated) */
  text: string;
}

export interface StructuralSearchResult {
  available: boolean;
  matches: StructuralMatch[];
  /** Files that had a parse/lang problem (skipped, not fatal) */
  skipped: string[];
}

const MAX_MATCHES = 80;

export async function runStructuralSearch(
  files: Array<{ path: string; content: string }>,
  pattern: string,
): Promise<StructuralSearchResult> {
  const mod = await loadAstGrep();
  if (!mod) return { available: false, matches: [], skipped: [] };

  const matches: StructuralMatch[] = [];
  const skipped: string[] = [];

  for (const f of files) {
    if (matches.length >= MAX_MATCHES) break;
    const lang = astGrepLangFor(f.path, mod.Lang);
    if (!lang) continue;
    try {
      const root = mod.parse(lang, f.content).root();
      for (const node of root.findAll(pattern)) {
        const r = node.range();
        const firstLine = node.text().split("\n")[0] ?? "";
        matches.push({
          path: f.path,
          line: r.start.line + 1,
          text: firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine,
        });
        if (matches.length >= MAX_MATCHES) break;
      }
    } catch {
      skipped.push(f.path);
    }
  }
  return { available: true, matches, skipped };
}

export interface StructuralRewriteChange {
  path: string;
  count: number;
  newContent: string;
}

export interface StructuralRewriteResult {
  available: boolean;
  changes: StructuralRewriteChange[];
  totalMatches: number;
  skipped: string[];
}

/**
 * Apply `rewrite` to every match of `pattern`. Metavariables from the
 * pattern ($X, $$$ARGS) are interpolated into the rewrite by ast-grep.
 * Pure: returns new contents; the caller decides how to persist them.
 */
export async function runStructuralRewrite(
  files: Array<{ path: string; content: string }>,
  pattern: string,
  rewrite: string,
): Promise<StructuralRewriteResult> {
  const mod = await loadAstGrep();
  if (!mod) return { available: false, changes: [], totalMatches: 0, skipped: [] };

  const changes: StructuralRewriteChange[] = [];
  const skipped: string[] = [];
  let totalMatches = 0;

  for (const f of files) {
    const lang = astGrepLangFor(f.path, mod.Lang);
    if (!lang) continue;
    try {
      const root = mod.parse(lang, f.content).root();
      const nodes = root.findAll(pattern);
      if (!nodes.length) continue;
      const edits = nodes.map((n) => n.replace(interpolateRewrite(n, rewrite, f.content)));
      const newContent = root.commitEdits(edits);
      if (newContent !== f.content) {
        changes.push({ path: f.path, count: nodes.length, newContent });
        totalMatches += nodes.length;
      }
    } catch {
      skipped.push(f.path);
    }
  }
  return { available: true, changes, totalMatches, skipped };
}

/**
 * Interpolate pattern metavariables into a rewrite template.
 *
 * @ast-grep/napi's node.replace() takes literal text — unlike the CLI it does
 * NOT substitute $VAR / $$$VAR itself — so we resolve them from the match:
 * $$$ARGS becomes the matched nodes joined with ", ", $X becomes the matched
 * node's text. Metavariables are UPPERCASE by ast-grep convention, which is
 * what keeps this from touching real identifiers like $props or jQuery's $.
 */
function interpolateRewrite(node: SgNode, rewrite: string, source: string): string {
  let out = rewrite.replace(/\$\$\$([A-Z][A-Z0-9_]*)/g, (whole, name: string) => {
    try {
      const multi = node.getMultipleMatches(name);
      if (!multi.length) return ""; // $$$X matching zero nodes → nothing
      // Slice the ORIGINAL source between first and last matched node, so
      // the original separators survive: ", " for args, " " for JSX attrs.
      const start = multi[0]!.range().start.index;
      const end = multi[multi.length - 1]!.range().end.index;
      return source.slice(start, end);
    } catch {
      return whole;
    }
  });
  out = out.replace(/\$([A-Z][A-Z0-9_]*)/g, (whole, name: string) => {
    try {
      const single = node.getMatch(name);
      return single ? single.text() : whole;
    } catch {
      return whole;
    }
  });
  return out;
}

/** Render a search result for the agent (compact, file:line grouped). */
export function formatSearchResult(res: StructuralSearchResult, pattern: string): string {
  if (!res.available) {
    return "structural_search unavailable on this platform — fall back to search_code (text search).";
  }
  if (!res.matches.length) {
    return `No structural matches for pattern: ${pattern}`;
  }
  const lines = res.matches.map((m) => `${m.path}:${m.line}: ${m.text}`);
  const cap = res.matches.length >= MAX_MATCHES ? `\n(capped at ${MAX_MATCHES} matches)` : "";
  const skipped = res.skipped.length ? `\n(skipped unparseable: ${res.skipped.join(", ")})` : "";
  return `${res.matches.length} match(es):\n${lines.join("\n")}${cap}${skipped}`;
}
