/**
 * Repair import specifiers that point at a file which does not exist, when a
 * file with that name DOES exist somewhere else in the project.
 *
 * OBSERVED FAILURE (fresh "distribution ERP" build, live): the model rewrote
 * `src/components/ui/tooltip.tsx` and shortened the scaffold's
 *
 *     import { cn } from "@/lib/utils";
 *
 * to
 *
 *     import { cn } from "../utils.ts";
 *
 * which resolves to `src/components/utils.ts` — a file that has never existed
 * in the scaffold. Vite answers with
 *
 *     [vite] Internal Server Error
 *     Failed to resolve import "../utils.ts" from "src/components/ui/tooltip.tsx".
 *
 * and the preview freezes on "Preview paused — a syntax or runtime error froze
 * the preview" while the build is still writing files. The user sees a broken
 * app seconds after asking for one, and the auto-fix loop then spends paid
 * model calls re-deriving a path that is mechanically recoverable: `utils` is
 * sitting at `src/lib/utils.ts`, one directory over.
 *
 * A wrong path is not a reasoning problem, so it should not cost a model call.
 * This module resolves every project-local specifier against the real file set
 * and, when one fails, rewrites it to a RELATIVE path to the file the module
 * actually meant. Relative (not `@/`) on purpose: the alias only exists where
 * `ensureAtAlias` has patched a Vite config, while a relative specifier
 * resolves in Vite, Next, TanStack Start and plain esbuild alike.
 *
 * Conservative by construction — it only ever touches a specifier that is
 * ALREADY broken, so the worst case is an unresolvable import staying
 * unresolvable. Specifiers that resolve, bare package imports, and asset/query
 * specifiers are returned untouched.
 *
 * These rewrites apply to the sandbox copy only. The project's own files in the
 * database keep whatever the model wrote, so an export or a local `npm run dev`
 * still shows the user's real code.
 */

const SOURCE_RE = /\.(tsx?|jsx?|mts|cts)$/i;

/**
 * Specifiers that are not JavaScript modules. Mirrors the list in
 * `diagnose-imports.ts` — a stylesheet or `?url` import must never be
 * "repaired" into a source module.
 */
const ASSET_EXTENSION_RE =
  /\.(css|scss|sass|less|styl|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|json|txt|md|glsl|wasm)$/i;

/** `from "x"` / `import "x"` / `import("x")` / `require("x")`. */
const SPECIFIER_RE =
  /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g;

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function stripExt(p: string): string {
  return p.replace(SOURCE_RE, "");
}

function baseName(p: string): string {
  const segs = stripExt(norm(p)).split("/");
  return segs[segs.length - 1] ?? "";
}

/** TanStack Start's route tree is written by the Vite plugin at dev time. */
function isGenerated(spec: string): boolean {
  return /routeTree\.gen$/.test(stripExt(spec));
}

function isNonModuleSpec(spec: string): boolean {
  if (spec.includes("?")) return true;
  return ASSET_EXTENSION_RE.test(spec.split("?")[0]);
}

function isProjectSpec(spec: string): boolean {
  return spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("src/");
}

/** Collapse `.`/`..` segments. Returns a project-root-relative path. */
function resolveSpec(importer: string, spec: string): string | null {
  if (spec.startsWith("@/")) return norm(`src/${spec.slice(2)}`);
  if (spec.startsWith("src/")) return norm(spec);
  if (!spec.startsWith(".")) return null;
  const from = norm(importer);
  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  const out: string[] = [];
  for (const seg of `${dir ? `${dir}/` : ""}${spec}`.split("/")) {
    if (seg === "..") out.pop();
    else if (seg && seg !== ".") out.push(seg);
  }
  return out.join("/");
}

/** Every on-disk path a resolved specifier could legally name. */
function candidates(resolved: string): string[] {
  const base = stripExt(resolved);
  const out = [resolved, base];
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]) {
    out.push(`${base}${ext}`);
    out.push(`${base}/index${ext}`);
  }
  return out;
}

/** Relative specifier (no extension) from one project file to another. */
export function relativeSpecifier(fromPath: string, toPath: string): string {
  const fromParts = norm(fromPath).split("/").slice(0, -1);
  const toParts = stripExt(norm(toPath)).split("/");
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  const up = fromParts.length - i;
  const down = toParts.slice(i).join("/");
  return up === 0 ? `./${down}` : `${"../".repeat(up)}${down}`;
}

/** How many trailing path segments two paths share. Higher = better match. */
function sharedTailSegments(a: string, b: string): number {
  const x = stripExt(norm(a)).split("/");
  const y = stripExt(norm(b)).split("/");
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  return n;
}

/**
 * Pick the file a broken specifier most likely meant: same basename, best tail
 * overlap with what the author wrote, shortest path as the tie-break so
 * `src/lib/utils.ts` beats `src/features/x/deep/utils.ts`. Returns null when
 * nothing matches — the file may simply not be written yet, and inventing a
 * target would be worse than leaving the error for the healing pass.
 */
function findTarget(
  sourcePaths: string[],
  importer: string,
  spec: string,
): string | null {
  const wanted = baseName(spec);
  if (!wanted || wanted === "index") return null;
  const importerNorm = norm(importer);

  const matches = sourcePaths.filter(
    (p) => p !== importerNorm && baseName(p) === wanted,
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const intent = stripExt(norm(spec).replace(/^(\.\.?\/)+/, "").replace(/^@\//, ""));
  let best = matches[0];
  let bestScore = -1;
  for (const m of matches) {
    const score = sharedTailSegments(m, intent);
    if (score > bestScore || (score === bestScore && m.length < best.length)) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Rewrite every unresolvable project-local specifier in one file.
 * `knownPaths` is the full project file list (paths only — contents not needed).
 */
export function repairImportsInFile(
  path: string,
  content: string,
  knownPaths: Iterable<string>,
): string {
  if (!content || !SOURCE_RE.test(path)) return content;

  const all: string[] = [];
  const exists = new Set<string>();
  for (const p of knownPaths) {
    const n = norm(p);
    exists.add(n);
    if (SOURCE_RE.test(n)) all.push(n);
  }
  if (all.length === 0) return content;

  return content.replace(SPECIFIER_RE, (match, head: string, quote: string, spec: string) => {
    if (!isProjectSpec(spec) || isNonModuleSpec(spec) || isGenerated(spec)) return match;

    const resolved = resolveSpec(path, spec);
    if (resolved === null) return match;
    if (candidates(resolved).some((c) => exists.has(c))) return match;

    const target = findTarget(all, path, spec);
    if (!target) return match;

    return `${head}${quote}${relativeSpecifier(path, target)}${quote}`;
  });
}

/**
 * Set-level pass: repair broken specifiers across a whole project file list.
 * Used on the sandbox upload paths, where the complete file set is in hand.
 */
export function normalizeProjectImports<
  T extends { path: string; content?: string | null },
>(files: T[]): T[] {
  const paths = files.map((f) => f.path);
  return files.map((f) => {
    if (f.content == null) return f;
    const next = repairImportsInFile(f.path, f.content, paths);
    return next === f.content ? f : ({ ...f, content: next } as T);
  });
}
