/**
 * Dependency gate — make npm libraries a checked contract, not a hope.
 *
 * The platform already has real machinery for libraries: a machine-readable
 * allowlist (package-allowlist.ts) that both writes the prompt and gates
 * installs, version floors (align-package-json.ts) and template pins
 * (controlled-registry.ts). But it all ran on the SANDBOX SYNC routes only.
 * Two consequences, both observed:
 *
 *   - A generation (or a paid repair round) that imports an ALLOWED package —
 *     recharts, zustand, a Radix primitive — without adding it to package.json
 *     compiles locally (the temp-dir gate must discard module-resolution
 *     diagnostics) and dies later in the sandbox as an opaque TS2307/Vite
 *     resolve error, which then costs paid repair rounds to rediscover what
 *     was knowable statically.
 *
 *   - A generation that imports a DISALLOWED or hallucinated package produced
 *     no first-class error anywhere in verification. The installer refuses it
 *     (correctly), the import never resolves, and the repair model is left to
 *     infer "this library does not exist here" from a bare stack trace — the
 *     exact vague-signal regime repair rounds go to die in.
 *
 * This module makes both knowable at verification time, deterministically:
 *
 *   findDependencyIssues(files)
 *     - `missingAllowed`: allowed packages imported but absent from
 *       package.json. Deterministically FIXABLE — syncProjectDependencies
 *       writes them at the allowlist's pinned version (the same pins the
 *       preview image is built from, so an added dep cannot drift).
 *     - `disallowed`: imports of packages the allowlist refuses. NOT fixable
 *       here — code must change — so each becomes a precise, located error
 *       telling the repair model exactly which import to rewrite and that no
 *       install will ever satisfy it.
 *
 * Scope: bare npm specifiers only. Relative/alias imports belong to
 * normalize-imports/typecheck-gate; node builtins and the react runtime are
 * never flagged. Files without a package.json in the set are skipped entirely
 * (nothing to check against — WebContainer fallback scaffolds own their deps).
 */

import { resolveAllowedPackage } from "../ai/package-allowlist.ts";
import { BUILTIN_PACKAGES, syncPackageJsonDeps } from "../ai/npm-auto-install.ts";

export interface DependencyFile {
  path: string;
  content?: string | null;
}

export interface DisallowedImport {
  importer: string;
  line: number;
  package: string;
  formatted: string;
}

export interface DependencyIssues {
  /** Allowed packages that are imported somewhere but missing from package.json. */
  missingAllowed: string[];
  /** Imports the allowlist refuses — each needs a code rewrite, not an install. */
  disallowed: DisallowedImport[];
}

const CODE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Same shapes extractImportedPackages matches, but with the index kept so the
 * error can carry a real line number. */
const IMPORT_SPEC_RE =
  /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

function packageName(spec: string): string | null {
  if (/^[./~#]/.test(spec) || spec.startsWith("@/") || spec.startsWith("node:")) return null;
  const name = spec.startsWith("@")
    ? spec.split("/").slice(0, 2).join("/")
    : spec.split("/")[0]!;
  return name || null;
}

function declaredDeps(files: DependencyFile[]): Set<string> | null {
  const pkgFile = files.find((f) => f.path === "package.json");
  if (!pkgFile || typeof pkgFile.content !== "string") return null;
  try {
    const pkg = JSON.parse(pkgFile.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
  } catch {
    return null; // malformed package.json is its own, already-reported error
  }
}

export function findDependencyIssues(files: DependencyFile[]): DependencyIssues {
  const none: DependencyIssues = { missingAllowed: [], disallowed: [] };
  const deps = declaredDeps(files);
  if (deps === null) return none;

  const missing = new Set<string>();
  const disallowed: DisallowedImport[] = [];
  const flaggedOnce = new Set<string>(); // one error per (file, package)

  for (const file of files) {
    if (!CODE_FILE_RE.test(file.path) || typeof file.content !== "string") continue;
    IMPORT_SPEC_RE.lastIndex = 0;
    for (const m of file.content.matchAll(IMPORT_SPEC_RE)) {
      const name = packageName(m[1]);
      if (!name || BUILTIN_PACKAGES.has(name) || deps.has(name)) continue;

      if (resolveAllowedPackage(name).allowed) {
        missing.add(name);
        continue;
      }
      const onceKey = `${file.path} ${name}`;
      if (flaggedOnce.has(onceKey)) continue;
      flaggedOnce.add(onceKey);
      const at = (m.index ?? 0) + m[0].lastIndexOf(m[1]);
      const line = file.content.slice(0, at).split("\n").length;
      disallowed.push({
        importer: file.path,
        line,
        package: name,
        formatted:
          `${file.path}:${line} — imports npm package "${name}", which is not in the allowed ` +
          `library list and will never be installed. Rewrite this code using the allowed ` +
          `libraries (or remove the import); do not add it to package.json.`,
      });
    }
  }
  return { missingAllowed: [...missing].sort(), disallowed };
}

export interface DependencySyncResult<T extends DependencyFile> {
  files: T[];
  /** Packages written into package.json, at allowlist-pinned versions. */
  added: string[];
}

/**
 * Deterministic fix for the fixable half: write every ALLOWED-but-missing
 * package into package.json at its pinned version. Refused packages are left
 * exactly as they are — their fix is a code rewrite, reported by
 * findDependencyIssues, never a silent "latest" install. Idempotent: with
 * nothing to add, the input array is returned as-is.
 */
export function syncProjectDependencies<T extends DependencyFile>(
  files: T[],
): DependencySyncResult<T> {
  const idx = files.findIndex((f) => f.path === "package.json");
  if (idx < 0 || typeof files[idx].content !== "string") return { files, added: [] };

  const codeFiles = files
    .filter((f): f is T & { content: string } => CODE_FILE_RE.test(f.path) && typeof f.content === "string")
    .map((f) => ({ path: f.path, content: f.content }));

  const sync = syncPackageJsonDeps(codeFiles, files[idx].content as string);
  if (!sync || sync.addedPackages.length === 0) return { files, added: [] };

  const next = files.map((f, i) => (i === idx ? { ...f, content: sync.updated } : f));
  return { files: next, added: sync.addedPackages };
}
