/**
 * Deterministic type-check gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this, a TypeScript mistake in a generated project was discovered by
 * RENDERING the app and reading a runtime stack trace. That is the worst
 * possible way to learn about a compile error:
 *
 *   - it is slow (browser launch + navigation + settle, seconds per round)
 *   - the FIRST crash masks every other error, so a browser-only pass finds one
 *     bug per round no matter how many the file actually has
 *   - the message points into minified react-dom and names neither the symbol
 *     nor the file, so the repair model gets a stack trace instead of a location
 *
 * `ai_eval_log` says 44.5% of builds needed a repair round and 21.8% needed two.
 * Repair rounds are the single largest avoidable cost in the pipeline, and a
 * compiler is both faster and vastly more precise than a stack trace at finding
 * the class of bug that causes most of them.
 *
 * WHAT IT CAN AND CANNOT SEE
 * --------------------------
 * Generated projects have no node_modules, so module-resolution and missing-lib
 * diagnostics are filtered out — they are artefacts of the sandbox, not defects
 * in the generated code. Reporting them would flood the repair prompt with
 * "Cannot find module 'react'" for every file and drown the real error.
 *
 * What survives the filter is what actually matters: syntax errors, unbalanced
 * JSX, undefined identifiers, wrong argument counts, and type mismatches inside
 * the project's own code.
 *
 * FAILURE POLICY
 * --------------
 * This gate NEVER blocks a build by failing. If tsc is missing, times out, or
 * throws, it returns `available: false` and the pipeline proceeds exactly as it
 * did before. A verification step that can take the product down when its own
 * tooling breaks is worse than no verification step.
 */
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { BUNDLER_ASSET_RE } from "./bundler-assets.ts";

import type { ProjectFile } from "../../types/database.ts";

const run = promisify(execFile);

/**
 * CONCURRENCY LIMIT — the reliability guard on this whole feature.
 *
 * `tsc` is CPU-bound and this gate spawns one process per build. Measured on a
 * 2-core box with a 4-file project:
 *
 *     1 concurrent   719ms
 *     4 concurrent  2,491ms
 *     8 concurrent  5,211ms
 *
 * Degradation is linear, and this host does not only run builds — it runs the
 * app server and the users' Docker preview sandboxes on the same cores. Left
 * unbounded, a burst of concurrent builds would slow every OTHER request on the
 * box, which would make a feature added FOR reliability into a cause of
 * unreliability.
 *
 * So: at most `cores - 1` compilers at once, never fewer than one, leaving a
 * core for everything else. A build that cannot get a slot within
 * QUEUE_WAIT_MS does not queue indefinitely — it skips the gate and proceeds to
 * the browser check exactly as it did before this feature existed. Under load,
 * degrading to the old behaviour is strictly better than adding latency to it.
 */
const MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.TYPECHECK_GATE_CONCURRENCY) || availableParallelism() - 1,
);
const QUEUE_WAIT_MS = Number(process.env.TYPECHECK_GATE_QUEUE_MS) || 4_000;

let active = 0;
const waiters: Array<() => void> = [];

/** Returns a release fn, or null when the queue wait expired. */
async function acquireSlot(): Promise<(() => void) | null> {
  if (active < MAX_CONCURRENT) {
    active++;
    return releaseSlot;
  }
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const i = waiters.indexOf(grant);
      if (i >= 0) waiters.splice(i, 1);
      resolve(null);
    }, QUEUE_WAIT_MS);

    function grant() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active++;
      resolve(releaseSlot);
    }
    waiters.push(grant);
  });
}

function releaseSlot(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

/** Exposed for tests. */
export function typecheckGateLoad(): { active: number; queued: number; max: number } {
  return { active, queued: waiters.length, max: MAX_CONCURRENT };
}

export interface TypecheckError {
  /** Project-relative path, e.g. "src/App.tsx". */
  path: string;
  line: number;
  column: number;
  code: number;
  message: string;
  /** Pre-formatted for a repair prompt. */
  formatted: string;
}

export interface TypecheckResult {
  /** False when tsc could not be run at all — callers must treat this as "unknown", not "clean". */
  available: boolean;
  errors: TypecheckError[];
  checkedFiles: number;
  durationMs: number;
  skippedReason?: string;
}

/**
 * Diagnostics that are artefacts of checking a project WITHOUT its
 * node_modules, not defects in the generated code.
 *
 *   2307 Cannot find module 'react'
 *   2304 Cannot find name 'React' / 'process'
 *   2503 Cannot find namespace 'JSX'
 *   2688 Cannot find type definition file
 *   7016 Could not find a declaration file for module
 *   7026 JSX element implicitly has type 'any' (no JSX.IntrinsicElements)
 *   2875 / 2874 JSX runtime module resolution
 *   6053 File not found (tsconfig include globs)
 *   2792 Cannot find module — did you mean to set moduleResolution?
 *
 * This list is verified by fixtures in typecheck-gate.test.ts: without 7026,
 * EVERY file containing JSX reports as broken, which would make the gate worse
 * than useless — it would send the repair model chasing errors that do not exist.
 */
const SANDBOX_ARTEFACT_CODES = new Set([
  2307, 2688, 7016, 7026, 2875, 2874, 6053, 2792,
]);

/**
 * TS2304 ("Cannot find name 'X'") and TS2503 ("Cannot find namespace 'X'") are
 * NOT blanket artefacts, and treating them as such was a real bug caught by
 * typecheck-gate.test.ts: filtering 2304 outright silently swallowed
 * "Cannot find name 'missingHelper'" — a call to a function that does not
 * exist, which is one of the most common defects in generated code and one of
 * the worst to debug at runtime.
 *
 * So these codes are filtered by NAME instead. Only ambient globals that are
 * genuinely absent because there is no node_modules and no lib typings get
 * dropped; every other unknown identifier is reported as the real error it is.
 */
const AMBIENT_NAMES = new Set([
  "React", "JSX", "NodeJS", "process", "Buffer", "global", "globalThis",
  "require", "module", "exports", "__dirname", "__filename",
  "Deno", "Bun", "vi", "jest", "describe", "it", "expect", "beforeEach", "afterEach",
]);

function isAmbientNameDiagnostic(code: number, message: string): boolean {
  if (code !== 2304 && code !== 2503) return false;
  const name = message.match(/Cannot find (?:name|namespace) '([^']+)'/)?.[1];
  return Boolean(name && AMBIENT_NAMES.has(name));
}

/** Source files worth compiling. Everything else (css, json, md, svg) is noise. */
const CHECKABLE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;

/** Never write these out — a path traversal in a generated filename must not escape the temp dir. */
function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  return !path.split(/[\\/]/).some((seg) => seg === ".." || seg === "");
}

/** Locate the project's OWN tsc, rather than shelling out to `npx` (which may hit the network). */
function resolveTscPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    return require.resolve("typescript/bin/tsc");
  } catch {
    return null;
  }
}

/**
 * Minimal ambient JSX declarations, written alongside the project.
 *
 * Without React's own typings, tsc checks a JSX element's props as a plain
 * object literal — so the standard React `key` prop reports as an excess
 * property and every list render in the project looks broken:
 *
 *   TS2322: Type '{ key: string; title: string; }' is not assignable
 *           to type '{ title: string; }'
 *
 * This was not hypothetical. Running the gate over five freshly generated
 * projects produced exactly one "error", and it was this — a false positive
 * that would have sent the repair model to rewrite correct code.
 *
 * `IntrinsicAttributes` is the hook React's own types use to permit key/ref on
 * any component, so declaring it here restores the real behaviour. Verified in
 * typecheck-gate.test.ts to still catch undefined names and wrong argument
 * counts in the same file — this widens JSX only, not the whole check.
 */
const JSX_SHIM = `declare namespace JSX {
  interface IntrinsicElements { [name: string]: any }
  interface Element { [key: string]: any }
  interface IntrinsicAttributes { key?: any; ref?: any }
  interface ElementAttributesProperty { props: {} }
  interface ElementChildrenAttribute { children: {} }
}
`;

/**
 * Ambient declarations for the stylesheet imports Vite handles natively.
 *
 * Same failure mode as JSX_SHIM above, found the same way. A generated app that
 * does the single most ordinary thing in a Vite project —
 *
 *   import "../styles.css";
 *
 * — was reported as a build error, because this gate typechecks in an isolated
 * directory with no node_modules, so none of Vite's ambient asset types exist:
 *
 *   TS2882: Cannot find module or type declarations for side-effect import
 *           of '../styles.css'.
 *
 * The code is correct. The gate was wrong, and generation_runs shows it failing
 * real builds on it. Each one then paid a diagnosis and a repair round to "fix"
 * a stylesheet import that never needed fixing.
 *
 * Shipping `src/vite-env.d.ts` in the scaffold does NOT solve this, which is
 * worth recording because it is the obvious guess: that file works by
 * `/// <reference types="vite/client" />`, and `vite` is not resolvable in this
 * sandbox either, so the reference resolves to nothing. Measured — the error is
 * identical with and without it. A dependency-free ambient declaration is the
 * only thing that works here.
 *
 * Scoped to STYLE extensions on purpose. Measured across the asset types a
 * generated app actually imports, only side-effect style imports false-fail;
 * `import logo from "./logo.svg"` and friends already pass, so widening this
 * further would trade real coverage for nothing.
 */
const ASSET_SHIM = `declare module "*.css";
declare module "*.scss";
declare module "*.sass";
declare module "*.less";
declare module "*.styl";
declare module "*.stylus";
declare module "*.pcss";
declare module "*.postcss";
`;

/**
 * TanStack's dev-time route tree, as an ambient module. The real file is
 * generated by the Vite plugin when the app runs; in this sandbox it does not
 * exist, so `import { routeTree } from "./routeTree.gen"` was a hard TS2307 on
 * every TanStack project — the scaffold's own router.tsx could not pass the
 * gate meant to verify it. Same class of self-inflicted failure as ASSET_SHIM.
 */
const ROUTETREE_SHIM = `declare module "*routeTree.gen" {
  export const routeTree: unknown;
}
`;

const TSCONFIG = {
  compilerOptions: {
    noEmit: true,
    skipLibCheck: true,
    allowJs: true,
    checkJs: false,
    jsx: "react-jsx",
    target: "es2022",
    module: "esnext",
    moduleResolution: "bundler",
    strict: false,
    // strict:false is deliberate. This gate is a SAFETY NET for broken code, not
    // a style reviewer. Under `strict` a generated project trips dozens of
    // implicit-any warnings that are stylistic, and burying one real error in
    // forty cosmetic ones is how a repair round gets wasted.
    noImplicitAny: false,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    isolatedModules: false,
    forceConsistentCasingInFileNames: false,
  },
  include: ["**/*"],
};

export async function runTypecheckGate(
  files: ProjectFile[],
  opts: { timeoutMs?: number; maxErrors?: number } = {},
): Promise<TypecheckResult> {
  const startedAt = Date.now();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxErrors = opts.maxErrors ?? 8;

  const tsc = resolveTscPath();
  if (!tsc) {
    return { available: false, errors: [], checkedFiles: 0, durationMs: 0, skippedReason: "typescript not resolvable" };
  }

  const checkable = files.filter(
    (f) => typeof f?.path === "string" && CHECKABLE.test(f.path) && isSafeRelativePath(f.path) && typeof f.content === "string",
  );
  if (checkable.length === 0) {
    return { available: true, errors: [], checkedFiles: 0, durationMs: Date.now() - startedAt };
  }

  const release = await acquireSlot();
  if (!release) {
    // Busy. Skip rather than queue: the browser check still runs, so the build
    // is verified exactly as it was before this gate existed.
    return {
      available: false,
      errors: [],
      checkedFiles: checkable.length,
      durationMs: Date.now() - startedAt,
      skippedReason: `typecheck queue busy (${MAX_CONCURRENT} slots) — skipped to protect host CPU`,
    };
  }

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "lm-typecheck-"));
    await Promise.all(
      checkable.map(async (f) => {
        const target = join(dir as string, f.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, f.content ?? "", "utf8");
      }),
    );
    await writeFile(join(dir, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2), "utf8");
    await writeFile(join(dir, "__jsx-shim.d.ts"), JSX_SHIM, "utf8");
    await writeFile(join(dir, "__asset-shim.d.ts"), ASSET_SHIM, "utf8");
    await writeFile(join(dir, "__routetree-shim.d.ts"), ROUTETREE_SHIM, "utf8");

    let stdout = "";
    try {
      // tsc exits NON-ZERO when it finds errors, so the success path here means
      // "no diagnostics" and the catch path is the normal one.
      await run(process.execPath, [tsc, "--pretty", "false", "--project", dir], { cwd: dir, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; killed?: boolean; code?: string };
      if (err.killed || err.code === "ETIMEDOUT") {
        return { available: false, errors: [], checkedFiles: checkable.length, durationMs: Date.now() - startedAt, skippedReason: `tsc timed out after ${timeoutMs}ms` };
      }
      stdout = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    }

    const errors: TypecheckError[] = [];
    const seen = new Set<string>();
    for (const m of stdout.matchAll(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$/gm)) {
      const [, rawPath, lineStr, colStr, codeStr, message] = m;
      const code = Number(codeStr);
      if (SANDBOX_ARTEFACT_CODES.has(code)) continue;
      if (isAmbientNameDiagnostic(code, message)) continue;
      // tsc emits paths relative to its cwd (which IS the temp dir), so calling
      // relative() again resolved them against process.cwd() and produced
      // nonsense like "../../mnt/user-data/.../src/use.ts". Only re-base when
      // the path really is absolute.
      const path = (isAbsolute(rawPath) ? relative(dir, rawPath) : rawPath).split(sep).join("/");
      // One error per line: tsc often reports the same broken line several ways,
      // and a repair prompt listing the same location four times wastes context.
      const key = `${path}:${lineStr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      errors.push({
        path,
        line: Number(lineStr),
        column: Number(colStr),
        code,
        message: message.trim(),
        formatted: `${path}:${lineStr}:${colStr} — TS${code}: ${message.trim()}`,
      });
      if (errors.length >= maxErrors) break;
    }

    return { available: true, errors, checkedFiles: checkable.length, durationMs: Date.now() - startedAt };
  } catch (e) {
    return {
      available: false,
      errors: [],
      checkedFiles: checkable.length,
      durationMs: Date.now() - startedAt,
      skippedReason: (e as Error).message?.slice(0, 120) ?? "unknown error",
    };
  } finally {
    release();
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Bundle gate — catches what the type checker structurally cannot.
 *
 * `findContractErrors` (preview/export-contract.ts) already reports a symbol
 * imported but never exported, and it is deliberately conservative: it skips
 * anything it cannot resolve. That leaves the most common bundler failure of
 * all completely unreported —
 *
 *     import { Card } from "./components/Card";   // Card.tsx was never created
 *
 * tsc reports this as TS2307 "Cannot find module", which the type-check gate
 * has to filter, because that same code fires for every `import from "react"`
 * in a project with no node_modules. The two are indistinguishable by error
 * code — the only difference is that one specifier is RELATIVE and the other is
 * a bare package name.
 *
 * So this gate resolves relative imports itself, against the actual file set,
 * and reports only those. Bare imports are ignored entirely: whether `react`
 * resolves is a question about the sandbox, not about the generated code.
 */
const RELATIVE_IMPORT =
  /(?:^|\n)\s*(?:import\s[^;'"]*?from\s*|import\s*|export\s[^;'"]*?from\s*)['"](\.[^'"]+)['"]/g;
const RELATIVE_REQUIRE = /(?:require|import)\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** Extensions tried when a specifier has none, mirroring bundler resolution order. */
const RESOLVE_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

function normalisePath(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Vite/Rollup suffixes (`?url`, `?raw`, …) are not part of the file path. */
function stripBundlerImportQuery(spec: string): string {
  const q = spec.indexOf("?");
  return q === -1 ? spec : spec.slice(0, q);
}

export interface UnresolvedImport {
  importer: string;
  specifier: string;
  line: number;
  formatted: string;
}

/**
 * Pure function over the file set — no temp dir, no child process, so it is
 * safe to run on every build regardless of what tooling the image has.
 */
export function findUnresolvedLocalImports(
  files: Array<{ path: string; content?: string | null }>,
): UnresolvedImport[] {
  const known = new Set(
    files.filter((f) => typeof f?.path === "string").map((f) => normalisePath(f.path)),
  );
  const out: UnresolvedImport[] = [];

  for (const file of files) {
    if (typeof file?.path !== "string" || typeof file.content !== "string") continue;
    if (!CHECKABLE.test(file.path)) continue;
    const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";

    for (const re of [RELATIVE_IMPORT, RELATIVE_REQUIRE]) {
      re.lastIndex = 0;
      for (const m of file.content.matchAll(re)) {
        const spec = m[1];
        const specPath = stripBundlerImportQuery(spec);
        const base = normalisePath(`${dir}/${specPath}`);
        // A specifier resolves if ANY candidate extension exists. Assets the
        // bundler handles (css/svg/json/images) are not our business here.
        if (BUNDLER_ASSET_RE.test(specPath)) continue;
        // TanStack's route tree is written by the tanstackStart Vite plugin at
        // dev time and is NEVER in a generated file set. export-contract.ts and
        // normalize-imports.ts both already exempt it; this gate did not, and
        // repair_outcomes shows the price: "src/router.tsx imports
        // './routeTree.gen', but no such file exists" recurs across production
        // repairs — rounds spent creating a file the toolchain writes for free.
        if (/(^|\/)routeTree\.gen$/.test(specPath.replace(/\.(ts|tsx|js|jsx)$/, ""))) continue;
        const resolved = RESOLVE_EXTS.some((ext) => known.has(normalisePath(base + ext)));
        if (resolved) continue;
        // Count to the SPECIFIER, not to the match start: the pattern begins
        // with `(?:^|\n)\s*` and therefore swallows the blank lines before the
        // import, which reported every such import as line 1.
        const at = (m.index ?? 0) + m[0].lastIndexOf(spec);
        const line = file.content.slice(0, at).split("\n").length;
        out.push({
          importer: file.path,
          specifier: spec,
          line,
          formatted: `${file.path}:${line} — imports "${spec}", but no such file exists in the project`,
        });
      }
    }
  }
  return out;
}

/**
 * Do these files PARSE? Syntax only — TS1xxx codes.
 *
 * Used to vet a repair BEFORE it is written. `guardFileWrite` already refuses a
 * blanking write and a repetition loop, but it cannot see truncation: a repair
 * that hit its token ceiling returns a file that is syntactically incomplete but
 * neither empty nor repetitive, so it passes every existing guard and lands on
 * top of a working file.
 *
 * That is the "failed builds must never replace the last working version" rule,
 * and it was unenforced. A file that does not parse cannot be an improvement on
 * one that does, whatever the model intended.
 *
 * Deliberately syntax-only: a repair that leaves a TYPE error behind is still
 * progress and the next round will catch it. A repair that leaves a SYNTAX error
 * is corruption.
 */
export async function filesWithSyntaxErrors(files: ProjectFile[]): Promise<Map<string, string>> {
  const bad = new Map<string, string>();
  const result = await runTypecheckGate(files, { timeoutMs: 20_000, maxErrors: 40 });
  if (!result.available) return bad;          // unknown, not "clean" — caller decides
  for (const e of result.errors) {
    if (e.code >= 1000 && e.code < 2000 && !bad.has(e.path)) bad.set(e.path, e.formatted);
  }
  return bad;
}

/**
 * JSX list rendering without a `key`.
 *
 * React logs this via console.error, so it lands in the preview's error stream
 * and the user sees a red console on an app that otherwise works. It surfaced
 * once in a 50-build smoke run — the only render failure whose app was actually
 * fine — and it is entirely mechanical to detect, so paying a model to find it
 * would be absurd.
 *
 * Conservative by construction: it only fires when a `.map(` callback opens JSX
 * on the same or next line AND no `key=` appears before that element's first
 * `>`. Anything it cannot read confidently is skipped, because a false positive
 * here would send a repair to "fix" correct code.
 */
export interface MissingKeyWarning {
  path: string;
  line: number;
  formatted: string;
}

export function findMissingListKeys(
  files: Array<{ path: string; content?: string | null }>,
): MissingKeyWarning[] {
  const out: MissingKeyWarning[] = [];
  for (const f of files) {
    if (typeof f?.path !== "string" || typeof f.content !== "string") continue;
    if (!/\.(tsx|jsx)$/i.test(f.path)) continue;

    const src = f.content;
    for (const m of src.matchAll(/\.map\s*\(/g)) {
      // Start AFTER the map callback's arrow. A first version searched from the
      // `.map(` itself and matched the ENCLOSING element — so `{xs.map(x =>
      // <Row key={x.id} />)}` inside a <div> was reported against the <div>,
      // and every correct file was flagged. Only the element the callback
      // RETURNS can carry the key.
      const from = m.index! + m[0].length;
      const arrow = src.indexOf("=>", from);
      if (arrow < 0 || arrow - from > 120) continue;   // not an arrow callback
      const after = src.slice(arrow + 2, arrow + 400);
      // Skip a wrapping paren/brace/newline to reach the element itself.
      const open = after.match(/^[\s(){]*<([A-Za-z][\w.]*)\b([^>]*)>/);
      if (!open) continue;                              // fragment, or not JSX
      if (/\bkey\s*=/.test(open[2])) continue;
      const line = src.slice(0, arrow).split("\n").length;
      out.push({
        path: f.path,
        line,
        formatted: `${f.path}:${line} — <${open[1]}> returned from .map() has no \`key\` prop (React logs this as a console error)`,
      });
      break;
    }
  }
  return out;
}
