/**
 * npm auto-install utility
 * Scans AI-generated files for import statements, finds packages not already
 * in package.json, and returns a list of packages to install.
 *
 * Installs are gated by the allowlist in lib/ai/package-allowlist.ts — the same
 * data that generates the allowlist section of the system prompts. See
 * `syncPackageJsonDeps` for why that gate exists.
 */

import { resolveAllowedPackage } from "./package-allowlist.ts";

// Packages that are built-in to Node.js / browser / React and never need installing
const BUILTIN_PACKAGES = new Set([
  "react",
  "react-dom",
  "next",
  "path",
  "fs",
  "os",
  "url",
  "http",
  "https",
  "stream",
  "events",
  "crypto",
  "util",
  "buffer",
  "child_process",
  "querystring",
  "string_decoder",
  "zlib",
  "net",
  "tls",
  "dns",
  "cluster",
  "worker_threads",
  "assert",
  "constants",
  "module",
  "process",
  "timers",
  "readline",
  "repl",
]);

// Internal / relative import prefixes that are never npm packages
const INTERNAL_PREFIXES = [".", "/", "@/", "~/", "#"];

/**
 * Extract npm package names from ESM / CJS import statements in source code.
 * Handles: import x from 'pkg', import { x } from 'pkg', require('pkg'), dynamic import('pkg')
 */
export function extractImportedPackages(sourceCode: string): string[] {
  const packages = new Set<string>();

  // Match: import ... from 'pkg' / import('pkg') / require('pkg')
  const patterns = [
    /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sourceCode)) !== null) {
      const spec = match[1];
      if (!spec) continue;
      // Skip relative / absolute / internal imports
      if (INTERNAL_PREFIXES.some((p) => spec.startsWith(p))) continue;
      // Node builtins with the modern prefix ("node:url", "node:path", ...) are
      // never npm packages. Without this, the TanStack Start scaffold's
      // `import { fileURLToPath } from "node:url"` in vite.config.ts got
      // injected into package.json as "node:url": "latest" and npm install
      // died with EINVALIDPACKAGENAME before installing anything.
      if (spec.startsWith("node:")) continue;
      // Extract package name (strip subpath: 'lodash/merge' → 'lodash', '@scope/pkg/sub' → '@scope/pkg')
      const name = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")   // scoped: @scope/pkg
        : spec.split("/")[0]!;                     // unscoped: pkg
      if (name && name.length > 0) packages.add(name);
    }
  }

  return [...packages].filter((p) => !BUILTIN_PACKAGES.has(p));
}

/**
 * Given a list of newly generated files and the current package.json content,
 * return the set of packages that need to be installed (not already present).
 */
export function findMissingPackages(
  generatedFiles: Array<{ path: string; content: string }>,
  packageJsonContent?: string | null
): string[] {
  // Parse existing deps from package.json
  let existingDeps: Set<string> = new Set();
  if (packageJsonContent) {
    try {
      const pkg = JSON.parse(packageJsonContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.peerDependencies ?? {}),
      };
      existingDeps = new Set(Object.keys(allDeps));
    } catch {
      // Malformed package.json — treat as empty
    }
  }

  // Collect all imports from generated code files
  const codeExts = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]);
  const allImports = new Set<string>();

  for (const f of generatedFiles) {
    const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
    if (!codeExts.has(ext)) continue;
    const imports = extractImportedPackages(f.content);
    imports.forEach((p) => allImports.add(p));
  }

  // Return packages that are imported but not already installed
  return [...allImports].filter((p) => !existingDeps.has(p));
}

/**
 * Returns a short npm install command for a list of packages.
 * e.g. "npm install recharts date-fns"
 */
export function buildInstallCommand(packages: string[]): string {
  return `npm install ${packages.join(" ")}`;
}

/**
 * One-line, user-facing explanation of refused imports.
 *
 * Refusing silently would trade a broken `npm install` for a mystery unresolved
 * import, which is not much better. The user needs to know a package was blocked
 * and that the code referencing it will not run until it stops doing so.
 */
export function describeRejectedPackages(rejected: string[]): string {
  if (rejected.length === 0) return "";
  const list = rejected.slice(0, 4).join(", ");
  const more = rejected.length > 4 ? ` +${rejected.length - 4} more` : "";
  return `Not installed (outside the allowed package list): ${list}${more}. Imports of ${
    rejected.length === 1 ? "it" : "them"
  } will not resolve — ask for the feature to be rebuilt with the supported libraries.`;
}

/**
 * Sync package.json dependencies with all imports found in project files.
 *
 * ALLOWLIST-GATED. Every candidate goes through `resolveAllowedPackage()`:
 * - allowed → written at the version the allowlist declares (a real pin for
 *   anything in the scaffold, so it matches the pre-baked preview image)
 * - not allowed → NOT written, and returned in `rejectedPackages`
 *
 * This used to write every unrecognised import as `"latest"`. One hallucinated
 * name — or one typo away from a real package — and `npm install` 404'd before
 * installing anything, so the user got a dead preview instead of a bad import.
 * Refusing is better on both counts: the import error is specific and local, and
 * the self-verify / auto-fix loop can rewrite the code to drop the dependency,
 * which it cannot do for a failed install.
 *
 * Returns null when nothing changed. Note that a run which rejects packages but
 * adds none still returns a result, so callers can report the rejections.
 */
export function syncPackageJsonDeps(
  allProjectFiles: Array<{ path: string; content: string }>,
  packageJsonContent: string
): { updated: string; addedPackages: string[]; rejectedPackages: string[] } | null {
  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    [key: string]: unknown;
  };

  try {
    pkg = JSON.parse(packageJsonContent);
  } catch {
    return null; // Malformed package.json — skip
  }

  const existingDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);

  // Collect all imports from all code files
  const codeExts = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]);
  const allImports = new Set<string>();

  for (const f of allProjectFiles) {
    const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
    if (!codeExts.has(ext)) continue;
    const imports = extractImportedPackages(f.content);
    imports.forEach((p) => allImports.add(p));
  }

  const candidates = [...allImports].filter((p) => !existingDeps.has(p));
  if (candidates.length === 0) return null;

  // Gate every candidate through the allowlist and pin at the declared version.
  const addedDeps: Record<string, string> = {};
  const addedDevDeps: Record<string, string> = {};
  const addedPackages: string[] = [];
  const rejectedPackages: string[] = [];

  for (const name of candidates) {
    const decision = resolveAllowedPackage(name);
    if (!decision.allowed) {
      rejectedPackages.push(name);
      continue;
    }
    (decision.dev ? addedDevDeps : addedDeps)[name] = decision.version;
    addedPackages.push(name);
  }

  if (addedPackages.length === 0) {
    // Nothing installable. Still report, so the caller can tell the user which
    // imports will not resolve rather than leaving a silently broken preview.
    return rejectedPackages.length > 0
      ? { updated: packageJsonContent, addedPackages: [], rejectedPackages }
      : null;
  }

  const updatedPkg = {
    ...pkg,
    dependencies: { ...(pkg.dependencies ?? {}), ...addedDeps },
    ...(Object.keys(addedDevDeps).length > 0
      ? { devDependencies: { ...(pkg.devDependencies ?? {}), ...addedDevDeps } }
      : {}),
  };
  return {
    updated: JSON.stringify(updatedPkg, null, 2),
    addedPackages,
    rejectedPackages,
  };
}
