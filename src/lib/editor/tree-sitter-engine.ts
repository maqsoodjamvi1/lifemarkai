/**
 * In-browser (and in-Node, for tests) tree-sitter engine.
 *
 * Real incremental-grade parsing for the code editor via web-tree-sitter
 * (the Rust tree-sitter runtime compiled to WASM). This is what powers:
 *
 *  - the syntax-precise file outline (nested: class methods, JSX components,
 *    hooks — things the regex outline in file-outline-panel.tsx guesses at)
 *  - syntax-aware selection expand/shrink in Monaco (Alt+Shift+Right/Left)
 *
 * Everything here is fail-soft: if the WASM runtime or a grammar fails to
 * load (old browser, missing asset, CSP), every entry point resolves to
 * null and callers keep their regex fallbacks. No hard dependency anywhere.
 *
 * Assets: public/ts-wasm/ holds the runtime (web-tree-sitter.wasm) and the
 * grammars (tree-sitter-{tsx,typescript,javascript,css}.wasm), copied from
 * the web-tree-sitter / @vscode/tree-sitter-wasm npm packages (the VS Code
 * team keeps those grammar builds ABI-compatible with current web-tree-sitter;
 * the older tree-sitter-wasms package's builds fail dylink validation). If you upgrade
 * web-tree-sitter, re-copy BOTH the runtime and the grammars together —
 * the runtime and grammar ABI versions must stay compatible, and the node
 * test in tree-sitter-engine.test.ts is the gate that proves they match.
 *
 * Offsets: web-tree-sitter parses JS strings, so all indexes here are
 * UTF-16 code-unit offsets — the same units Monaco's model.getOffsetAt /
 * getPositionAt use. No conversion layer is needed (or wanted).
 */

import { Language, Parser } from "web-tree-sitter";

export type EngineLang = "tsx" | "typescript" | "javascript" | "css";

export interface OutlineEntry {
  name: string;
  kind:
    | "component"
    | "hook"
    | "function"
    | "method"
    | "class"
    | "interface"
    | "type"
    | "enum"
    | "const";
  /** 1-based start line */
  line: number;
  /** 1-based end line of the whole declaration */
  endLine: number;
  /** Nesting depth: 0 = top level, 1 = class method, … */
  depth: number;
  exported: boolean;
}

export interface EngineInitOptions {
  /** Runtime wasm: URL string (browser) or bytes (node tests). */
  runtimeWasm?: string | Uint8Array;
  /** Base URL for grammar wasms (browser). Default "/ts-wasm/". */
  grammarBase?: string;
  /** Per-language grammar override: URL or bytes (node tests). */
  grammars?: Partial<Record<EngineLang, string | Uint8Array>>;
}

const DEFAULT_GRAMMAR_BASE = "/ts-wasm/";

let options: EngineInitOptions = {};
let runtimeReady: Promise<boolean> | null = null;
const languageCache = new Map<EngineLang, Promise<Language | null>>();

/** Configure asset locations BEFORE first use (tests pass bytes here). */
export function configureEngine(opts: EngineInitOptions): void {
  options = opts;
  runtimeReady = null;
  languageCache.clear();
}

export function langForPath(path: string): EngineLang | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx" || ext === "jsx") return "tsx";
  if (ext === "ts" || ext === "mts" || ext === "cts") return "typescript";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
  if (ext === "css") return "css";
  return null;
}

async function ensureRuntime(): Promise<boolean> {
  if (!runtimeReady) {
    runtimeReady = (async () => {
      try {
        const rt = options.runtimeWasm;
        if (rt instanceof Uint8Array) {
          await Parser.init({ wasmBinary: rt });
        } else if (typeof rt === "string") {
          await Parser.init({ locateFile: () => rt });
        } else {
          await Parser.init({
            locateFile: (name: string) => `${DEFAULT_GRAMMAR_BASE}${name}`,
          });
        }
        return true;
      } catch {
        return false;
      }
    })();
  }
  return runtimeReady;
}

async function loadLanguage(lang: EngineLang): Promise<Language | null> {
  let cached = languageCache.get(lang);
  if (!cached) {
    cached = (async () => {
      if (!(await ensureRuntime())) return null;
      try {
        const override = options.grammars?.[lang];
        const source =
          override ?? `${options.grammarBase ?? DEFAULT_GRAMMAR_BASE}tree-sitter-${lang}.wasm`;
        return await Language.load(source as never);
      } catch {
        return null;
      }
    })();
    languageCache.set(lang, cached);
  }
  return cached;
}

/** True once the runtime + tsx grammar are known to load in this env. */
export async function engineAvailable(): Promise<boolean> {
  return (await loadLanguage("tsx")) !== null;
}

// ── Internal: parse + walk ───────────────────────────────────────────────────

type TSNode = NonNullable<ReturnType<Parser["parse"]>>["rootNode"];

async function withTree<T>(
  path: string,
  source: string,
  fn: (root: TSNode) => T,
): Promise<T | null> {
  const lang = langForPath(path);
  if (!lang) return null;
  const language = await loadLanguage(lang);
  if (!language) return null;
  const parser = new Parser();
  try {
    parser.setLanguage(language);
    const tree = parser.parse(source);
    if (!tree) return null;
    try {
      return fn(tree.rootNode);
    } finally {
      tree.delete();
    }
  } catch {
    return null;
  } finally {
    parser.delete();
  }
}

function isFunctionValue(node: { type: string } | null): boolean {
  if (!node) return false;
  return (
    node.type === "arrow_function" ||
    node.type === "function_expression" ||
    node.type === "function" ||
    node.type === "generator_function"
  );
}

/** memo(...), forwardRef(...), memo(forwardRef(...)) wrappers around a fn. */
function unwrapCallToFunction(node: TSNode | null): boolean {
  let cur: TSNode | null = node;
  for (let i = 0; i < 3 && cur; i++) {
    if (isFunctionValue(cur)) return true;
    if (cur.type !== "call_expression") return false;
    const args = cur.childForFieldName("arguments");
    const first = args?.namedChildren?.[0] ?? null;
    cur = (first as TSNode | null) ?? null;
  }
  return false;
}

function classify(
  name: string,
  fnLike: boolean,
  isTsxFile: boolean,
): OutlineEntry["kind"] {
  if (/^use[A-Z0-9]/.test(name)) return "hook";
  if (fnLike && isTsxFile && /^[A-Z]/.test(name)) return "component";
  if (fnLike) return "function";
  return "const";
}

// ── Outline ──────────────────────────────────────────────────────────────────

export async function extractOutline(
  path: string,
  source: string,
): Promise<OutlineEntry[] | null> {
  const isTsxFile = /\.(tsx|jsx)$/i.test(path);
  return withTree(path, source, (root) => {
    const out: OutlineEntry[] = [];

    const push = (
      node: TSNode,
      name: string | undefined,
      kind: OutlineEntry["kind"],
      depth: number,
      exported: boolean,
    ) => {
      if (!name) return;
      out.push({
        name,
        kind,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        depth,
        exported,
      });
    };

    const visitDeclaration = (node: TSNode, depth: number, exported: boolean): void => {
      switch (node.type) {
        case "export_statement": {
          const decl = node.childForFieldName("declaration");
          if (decl) visitDeclaration(decl as TSNode, depth, true);
          return;
        }
        case "function_declaration":
        case "generator_function_declaration": {
          const name = node.childForFieldName("name")?.text;
          push(node, name, classify(name ?? "", true, isTsxFile), depth, exported);
          return;
        }
        case "class_declaration":
        case "abstract_class_declaration": {
          const name = node.childForFieldName("name")?.text;
          push(node, name, "class", depth, exported);
          const body = node.childForFieldName("body");
          for (const member of body?.namedChildren ?? []) {
            if (member?.type === "method_definition") {
              const mName = member.childForFieldName("name")?.text;
              push(member as TSNode, mName, "method", depth + 1, false);
            }
          }
          return;
        }
        case "interface_declaration": {
          push(node, node.childForFieldName("name")?.text, "interface", depth, exported);
          return;
        }
        case "type_alias_declaration": {
          push(node, node.childForFieldName("name")?.text, "type", depth, exported);
          return;
        }
        case "enum_declaration": {
          push(node, node.childForFieldName("name")?.text, "enum", depth, exported);
          return;
        }
        case "lexical_declaration":
        case "variable_declaration": {
          for (const declarator of node.namedChildren ?? []) {
            if (declarator?.type !== "variable_declarator") continue;
            const nameNode = declarator.childForFieldName("name");
            if (!nameNode || nameNode.type !== "identifier") continue;
            const value = declarator.childForFieldName("value") as TSNode | null;
            const fnLike = isFunctionValue(value) || unwrapCallToFunction(value);
            push(
              declarator as TSNode,
              nameNode.text,
              classify(nameNode.text, fnLike, isTsxFile),
              depth,
              exported,
            );
          }
          return;
        }
        default:
          return;
      }
    };

    for (const child of root.namedChildren ?? []) {
      if (child) visitDeclaration(child as TSNode, 0, false);
    }
    return out;
  });
}

// ── Syntax-aware selection expand / shrink ───────────────────────────────────

export interface OffsetRange {
  start: number;
  end: number;
}

/**
 * Smallest named node strictly CONTAINING the selection; if the selection
 * already equals a node's range, its nearest strictly-larger ancestor.
 * Returns null when there is nothing larger (or parsing failed).
 */
export async function syntaxExpandRange(
  path: string,
  source: string,
  sel: OffsetRange,
): Promise<OffsetRange | null> {
  return withTree(path, source, (root) => {
    const start = Math.max(0, Math.min(sel.start, source.length));
    const end = Math.max(start, Math.min(sel.end, source.length));
    let node: TSNode | null =
      (root.namedDescendantForIndex(start, Math.max(start, end - 1)) as TSNode | null) ?? null;
    while (node && node.startIndex === start && node.endIndex === end) {
      node = (node.parent as TSNode | null) ?? null;
    }
    while (node && (node.startIndex > start || node.endIndex < end)) {
      node = (node.parent as TSNode | null) ?? null;
    }
    if (!node) return null;
    if (node.startIndex === start && node.endIndex === end) return null;
    return { start: node.startIndex, end: node.endIndex };
  }).then((r) => r ?? null);
}

/**
 * Inverse of syntaxExpandRange: largest named node strictly INSIDE the
 * selection (first named child that is smaller than the selection).
 */
export async function syntaxShrinkRange(
  path: string,
  source: string,
  sel: OffsetRange,
): Promise<OffsetRange | null> {
  return withTree(path, source, (root) => {
    const start = Math.max(0, Math.min(sel.start, source.length));
    const end = Math.max(start, Math.min(sel.end, source.length));
    let node: TSNode | null =
      (root.namedDescendantForIndex(start, Math.max(start, end - 1)) as TSNode | null) ?? null;
    while (node && (node.startIndex > start || node.endIndex < end)) {
      node = (node.parent as TSNode | null) ?? null;
    }
    if (!node) return null;
    // Walk down: first named child whose range is a strict sub-range.
    let candidate: TSNode | null = null;
    for (const child of node.namedChildren ?? []) {
      if (!child) continue;
      if (child.startIndex >= start && child.endIndex <= end) {
        if (child.startIndex > start || child.endIndex < end) {
          candidate = child as TSNode;
          break;
        }
        // child equals selection — descend into it
        for (const inner of (child as TSNode).namedChildren ?? []) {
          if (inner) {
            candidate = inner as TSNode;
            break;
          }
        }
        break;
      }
    }
    if (!candidate) return null;
    return { start: candidate.startIndex, end: candidate.endIndex };
  }).then((r) => r ?? null);
}
