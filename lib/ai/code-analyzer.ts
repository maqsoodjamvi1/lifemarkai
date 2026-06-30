/**
 * Lightweight TS/JS/JSX structural analyzer for the agent toolset.
 * Used by editor-intelligence architecture/QA lenses; gives the
 * agent structural understanding of a file (imports, exports, functions, React
 * components, classes, hooks) and lets it locate a symbol's definition across
 * the project WITHOUT reading whole files.
 *
 * Dependency-free by design: `typescript` is a devDependency, so importing the
 * compiler at runtime would risk production builds and bundle bloat. This uses
 * resilient line/brace heuristics instead — precise enough for navigation and
 * summarization, and safe in any build. Upgrade path: swap the internals for the
 * TS compiler API if `typescript` is moved to dependencies.
 */

export interface SymbolInfo {
  kind: "function" | "component" | "class" | "const" | "type" | "interface" | "hook";
  name: string;
  line: number;
  exported: boolean;
  signature?: string;
}

export interface FileAnalysis {
  path: string;
  imports: Array<{ from: string; line: number; what: string }>;
  symbols: SymbolInfo[];
  defaultExport?: string;
  loc: number;
}

const IMPORT_RE = /^\s*import\s+(?:type\s+)?(.+?)\s+from\s+["']([^"']+)["']/;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+["']([^"']+)["']/;

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/** Trim a line into a compact one-line signature. */
function sig(line: string): string {
  return line.trim().replace(/\s*\{?\s*$/, "").replace(/\s+/g, " ").slice(0, 200);
}

/** Parse a single file's structure. Heuristic, resilient to partial code. */
export function analyzeFile(path: string, content: string): FileAnalysis {
  const lines = content.split("\n");
  const imports: FileAnalysis["imports"] = [];
  const symbols: SymbolInfo[] = [];
  let defaultExport: string | undefined;

  lines.forEach((raw, i) => {
    const line = raw;
    const ln = i + 1;

    const imp = IMPORT_RE.exec(line);
    if (imp) {
      imports.push({ what: imp[1].trim(), from: imp[2], line: ln });
      return;
    }
    const sideImp = SIDE_EFFECT_IMPORT_RE.exec(line);
    if (sideImp && !imp) {
      imports.push({ what: "(side-effect)", from: sideImp[1], line: ln });
      return;
    }

    const exported = /^\s*export\b/.test(line);

    // export default <Name> / export default function Name
    const defM = /^\s*export\s+default\s+(?:function\s+)?([A-Za-z0-9_]+)/.exec(line);
    if (defM) defaultExport = defM[1];

    // function declarations
    let m = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(\([^)]*\))?/.exec(line);
    if (m) {
      const fnName = m[1];
      const fnKind: SymbolInfo["kind"] = /^use[A-Z]/.test(fnName)
        ? "hook"
        : isPascalCase(fnName)
          ? "component"
          : "function";
      symbols.push({ kind: fnKind, name: fnName, line: ln, exported, signature: sig(line) });
      return;
    }

    // const NAME = (...) => / const NAME = function / const NAME = useXxx(
    m = /^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(.*)$/.exec(line);
    if (m) {
      const rhs = m[2];
      const name = m[1];
      let kind: SymbolInfo["kind"] = "const";
      const isFn = /^(async\s+)?\(?[^)]*\)?\s*=>/.test(rhs) || /^(async\s+)?function/.test(rhs);
      if (/^use[A-Z]/.test(name) && isFn) {
        kind = "hook";
      } else if (isFn) {
        kind = isPascalCase(name) ? "component" : "function";
      }
      symbols.push({ kind, name, line: ln, exported, signature: sig(line) });
      return;
    }

    // class declarations
    m = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/.exec(line);
    if (m) {
      symbols.push({ kind: "class", name: m[1], line: ln, exported, signature: sig(line) });
      return;
    }

    // type aliases & interfaces
    m = /^\s*(?:export\s+)?type\s+([A-Za-z0-9_]+)/.exec(line);
    if (m) {
      symbols.push({ kind: "type", name: m[1], line: ln, exported });
      return;
    }
    m = /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_]+)/.exec(line);
    if (m) {
      symbols.push({ kind: "interface", name: m[1], line: ln, exported });
      return;
    }
  });

  return { path, imports, symbols, defaultExport, loc: lines.length };
}

/** Human-readable structural summary for a tool result. */
export function summarizeFile(path: string, content: string): string {
  const a = analyzeFile(path, content);
  const out: string[] = [`${path} (${a.loc} lines)`];

  if (a.imports.length) {
    out.push(`\nImports (${a.imports.length}):`);
    for (const im of a.imports.slice(0, 40)) out.push(`  L${im.line}: ${im.what} ← ${im.from}`);
  }

  const byKind = (k: SymbolInfo["kind"]) => a.symbols.filter((s) => s.kind === k);
  const groups: Array<[string, SymbolInfo["kind"]]> = [
    ["Components", "component"],
    ["Functions", "function"],
    ["Hooks", "hook"],
    ["Classes", "class"],
    ["Interfaces", "interface"],
    ["Types", "type"],
    ["Consts", "const"],
  ];
  for (const [label, kind] of groups) {
    const items = byKind(kind);
    if (!items.length) continue;
    out.push(`\n${label} (${items.length}):`);
    for (const s of items.slice(0, 60)) {
      out.push(`  L${s.line}: ${s.exported ? "export " : ""}${s.name}${s.signature ? ` — ${s.signature}` : ""}`);
    }
  }
  if (a.defaultExport) out.push(`\nDefault export: ${a.defaultExport}`);
  if (a.symbols.length === 0 && a.imports.length === 0) out.push("\n(no top-level declarations detected)");
  return out.join("\n");
}

/** Find where a symbol is defined across the project. Returns file:line matches. */
export function findDefinition(
  files: Array<{ path: string; content: string }>,
  symbol: string,
): string {
  const hits: string[] = [];
  for (const f of files) {
    const a = analyzeFile(f.path, f.content);
    for (const s of a.symbols) {
      if (s.name === symbol) {
        hits.push(`${f.path}:${s.line}  [${s.kind}${s.exported ? ", exported" : ""}]  ${s.signature ?? s.name}`);
      }
    }
  }
  return hits.length ? hits.join("\n") : `No definition found for "${symbol}".`;
}
