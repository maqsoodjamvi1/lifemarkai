/**
 * Static export-contract checker for generated projects.
 *
 * The preview engine compiles ES modules into plain scripts and binds named
 * imports by destructuring the module object:
 *
 *     var __mod_x = window.__Mrequire('src/data/mock');
 *     const { MOCK_PARTNERS } = __mod_x;
 *
 * If the target module never exported `MOCK_PARTNERS`, the binding is silently
 * `undefined` — and the app dies later with an opaque
 * `TypeError: Cannot read properties of undefined (reading 'map')` deep inside
 * React. That message names neither the symbol nor the file, so the auto-fixer
 * has nothing to act on and the preview just freezes.
 *
 * This module catches the same class of bug BEFORE render, from source alone,
 * and reports it as a precise, directly fixable statement:
 *
 *     "MOCK_PARTNERS" is imported by src/components/home/PartnersSection.tsx
 *     but is not exported from src/data/mock.ts
 *
 * Deliberately conservative — it only reports a symbol when it can resolve the
 * target module AND enumerate its exports with confidence. Anything ambiguous
 * (star re-exports, unresolvable modules, type-only imports) is skipped, so a
 * false positive can never block a build.
 */

import { BUNDLER_ASSET_RE } from "../verify/bundler-assets.ts";

export interface ProjectFileLike {
  path: string;
  content: string;
}

export interface MissingExport {
  /** The imported symbol that doesn't exist. */
  name: string;
  /** File doing the importing. */
  importer: string;
  /** Resolved module that should have exported it. */
  module: string;
  /** Human-readable, fix-ready description. */
  message: string;
}

const CODE_RE = /\.(tsx|ts|jsx|js|mjs)$/;
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"];

/** Non-code assets — a missing one is not a module-resolution bug worth reporting. */
// One shared list — see bundler-assets.ts for why this is not a local copy.
const ASSET_RE = BUNDLER_ASSET_RE;

type Resolution =
  | { kind: "external" }                 // bare package (react, lucide-react…) — not ours
  | { kind: "asset" }                    // ./styles.css — not a JS module contract
  | { kind: "found"; path: string }      // resolved to a real project file
  | { kind: "missing"; expected: string }; // project-relative, but NO such file exists

/**
 * Resolve an import specifier against the project.
 *
 * Crucially this distinguishes a bare package (fine — provided by the CDN shims)
 * from a project-relative path that resolves to NOTHING. The latter is a genuine
 * bug: the preview's `__Mrequire` hands back `{}`, so every binding from it is
 * `undefined`, and a real Vite build would fail outright.
 */
function resolveModule(
  importerPath: string,
  spec: string,
  byPath: Map<string, ProjectFileLike>
): Resolution {
  const specPath = spec.replace(/\?.*$/, "");
  let base: string;

  if (specPath.startsWith("@/")) {
    base = `src/${specPath.slice(2)}`;
  } else if (specPath.startsWith("./") || specPath.startsWith("../")) {
    const dir = importerPath.split("/").slice(0, -1);
    const parts = specPath.split("/");
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") dir.pop();
      else dir.push(part);
    }
    base = dir.join("/");
  } else if (specPath.startsWith("src/")) {
    base = specPath;
  } else {
    return { kind: "external" };
  }

  for (const ext of EXTS) {
    const candidate = base + ext;
    if (byPath.has(candidate)) return { kind: "found", path: candidate };
  }
  for (const ext of EXTS.slice(1)) {
    const candidate = `${base}/index${ext}`;
    if (byPath.has(candidate)) return { kind: "found", path: candidate };
  }

  // Project-relative but unresolved. Assets are the AI's business, not ours.
  if (ASSET_RE.test(base)) return { kind: "asset" };
  return { kind: "missing", expected: base };
}

interface ModuleExports {
  names: Set<string>;
  /** `export * from …` means we can't enumerate exhaustively — don't report. */
  hasStarReexport: boolean;
}

/** Collect every name a module exports (values AND types — we only need existence). */
export function collectExports(content: string): ModuleExports {
  const names = new Set<string>();
  let hasStarReexport = false;

  // Strip comments so commented-out exports don't count.
  const src = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  if (/export\s+\*\s+from/.test(src)) hasStarReexport = true;

  // export const/let/var NAME    (also: export const A = 1, B = 2)
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([\w$]+)/g)) {
    names.add(m[1]);
  }
  // export function NAME / export async function NAME / export function* NAME
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([\w$]+)/g)) {
    names.add(m[1]);
  }
  // export class NAME
  for (const m of src.matchAll(/export\s+class\s+([\w$]+)/g)) {
    names.add(m[1]);
  }
  // export type / interface / enum NAME
  for (const m of src.matchAll(/export\s+(?:type|interface|enum)\s+([\w$]+)/g)) {
    names.add(m[1]);
  }
  // export { A, B as C, default as D }  — including re-export form `export { x } from '…'`
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of m[1].split(",")) {
      const piece = raw.trim();
      if (!piece) continue;
      // "A as B" exports B; "A" exports A
      const asMatch = piece.match(/(?:[\w$]+)\s+as\s+([\w$]+)/);
      const name = asMatch ? asMatch[1] : piece.replace(/^type\s+/, "").trim();
      if (name && name !== "default") names.add(name);
    }
  }
  if (/export\s+default\b/.test(src)) names.add("default");

  return { names, hasStarReexport };
}

/** Named imports (value imports only) declared by a file. */
function collectNamedImports(
  content: string
): Array<{ names: string[]; spec: string }> {
  const out: Array<{ names: string[]; spec: string }> = [];
  const src = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // import { A, B as C } from 'x'   and   import Def, { A } from 'x'
  // Skip `import type { … }` entirely — type-only bindings are erased at runtime.
  const re = /import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    if (/^\s*import\s+type\b/.test(m[0])) continue;

    const names = m[1]
      .split(",")
      .map((piece) => piece.trim())
      .filter(Boolean)
      // drop inline `type Foo` specifiers — erased at runtime
      .filter((piece) => !/^type\s/.test(piece))
      // "A as B" — the local binding is B, but the EXPORT we need is A
      .map((piece) => {
        const asMatch = piece.match(/^([\w$]+)\s+as\s+[\w$]+$/);
        return asMatch ? asMatch[1] : piece;
      })
      .filter((n) => /^[\w$]+$/.test(n));

    if (names.length) out.push({ names, spec: m[2] });
  }
  return out;
}

/** EVERY module specifier a file imports/re-exports, in any syntactic form. */
function collectAllSpecs(content: string): string[] {
  const src = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const specs: string[] = [];
  // import … from 'x'  /  export … from 'x'   (covers default, named, star, mixed)
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
    specs.push(m[1]);
  }
  // side-effect: import 'x'
  for (const m of src.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
    specs.push(m[1]);
  }
  return specs;
}

export interface MissingModule {
  /** The specifier that resolved to nothing. */
  spec: string;
  importer: string;
  /** Path the project was expected to contain. */
  expected: string;
  /** Symbols the importer tried to pull out of it (best-effort). */
  imported: string[];
  message: string;
}

/**
 * Find imports of project files that DO NOT EXIST.
 *
 * This is the single most damaging generation failure: the model writes
 * `import { Navbar } from './layout/Navbar'` and never creates the file. The
 * preview's `__Mrequire` returns `{}` rather than throwing, so `Navbar` is
 * `undefined` and React dies with an opaque error (or renders a "missing
 * component" placeholder) that names nothing useful. Reported here as a plain
 * "create this file" instruction.
 */
export function findMissingModules(files: ProjectFileLike[]): MissingModule[] {
  const byPath = new Map<string, ProjectFileLike>();
  for (const f of files) byPath.set(f.path, f);

  // What each file pulls from each spec, so we can say WHICH symbols are needed.
  const namedBySpec = new Map<string, Set<string>>();

  const out: MissingModule[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (!CODE_RE.test(file.path)) continue;

    namedBySpec.clear();
    for (const { names, spec } of collectNamedImports(file.content)) {
      const set = namedBySpec.get(spec) ?? new Set<string>();
      for (const n of names) set.add(n);
      namedBySpec.set(spec, set);
    }

    for (const spec of new Set(collectAllSpecs(file.content))) {
      // Vite resource queries (?url, ?raw, ?worker) and the dev-time route
      // tree are not TS modules - same exemptions as normalize-imports.ts.
      if (spec.includes("?")) continue;
      if (/routeTree\.gen$/.test(spec.replace(/\.(ts|tsx|js|jsx)$/, ""))) continue;
      const res = resolveModule(file.path, spec, byPath);
      if (res.kind !== "missing") continue;

      const key = `${file.path}|${res.expected}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const imported = [...(namedBySpec.get(spec) ?? [])];
      const needs = imported.length
        ? ` It must export: ${imported.join(", ")}.`
        : "";

      out.push({
        spec,
        importer: file.path,
        expected: res.expected,
        imported,
        message:
          `${file.path} imports "${spec}", but no such file exists in the project ` +
          `(expected ${res.expected}.ts/.tsx).${needs} ` +
          `Create it, or remove/redirect the import.`,
      });
    }
  }

  return out;
}

/**
 * Find every named import that its target project module does not actually export.
 *
 * Only reports high-confidence breaks: the module resolved to a real project
 * file, that file has no `export *` passthrough, and the symbol is absent from
 * its export list. Modules that don't exist at all are NOT reported here —
 * `findMissingModules` owns that case, so we never double-report one root cause.
 */
export function findMissingExports(files: ProjectFileLike[]): MissingExport[] {
  const byPath = new Map<string, ProjectFileLike>();
  for (const f of files) byPath.set(f.path, f);

  // Cache export sets per module.
  const exportCache = new Map<string, ModuleExports>();
  const exportsOf = (path: string): ModuleExports => {
    const cached = exportCache.get(path);
    if (cached) return cached;
    const parsed = collectExports(byPath.get(path)?.content ?? "");
    exportCache.set(path, parsed);
    return parsed;
  };

  const missing: MissingExport[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (!CODE_RE.test(file.path)) continue;

    for (const { names, spec } of collectNamedImports(file.content)) {
      const res = resolveModule(file.path, spec, byPath);
      if (res.kind !== "found") continue; // external / asset / missing-file — not ours

      const modulePath = res.path;
      const { names: exported, hasStarReexport } = exportsOf(modulePath);
      if (hasStarReexport) continue; // can't enumerate — stay silent
      if (exported.size === 0) continue; // couldn't parse exports — stay silent

      for (const name of names) {
        if (exported.has(name)) continue;

        const key = `${file.path}|${modulePath}|${name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        missing.push({
          name,
          importer: file.path,
          module: modulePath,
          message:
            `"${name}" is imported by ${file.path} but is not exported from ${modulePath}. ` +
            `Add the missing \`export const ${name} = …\` to ${modulePath} ` +
            `(matching how ${file.path} uses it), or correct the import.`,
        });
      }
    }
  }

  return missing;
}

/**
 * All broken module contracts in a project, ordered most-fatal-first:
 * missing FILES before missing EXPORTS (a missing file explains many symbols).
 */
export function findContractErrors(files: ProjectFileLike[]): string[] {
  return [
    ...findMissingModules(files).map((m) => m.message),
    ...findMissingExports(files).map((m) => m.message),
  ];
}
