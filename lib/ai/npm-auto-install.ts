/**
 * npm auto-install utility
 * Scans AI-generated files for import statements, finds packages not already
 * in package.json, and returns a list of packages to install.
 */

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
 * Sync package.json dependencies with all imports found in project files.
 * Adds any missing packages to the `dependencies` section with version "latest".
 * Returns the updated package.json string, or null if no changes were needed.
 */
export function syncPackageJsonDeps(
  allProjectFiles: Array<{ path: string; content: string }>,
  packageJsonContent: string
): { updated: string; addedPackages: string[] } | null {
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

  const addedPackages = [...allImports].filter((p) => !existingDeps.has(p));
  if (addedPackages.length === 0) return null;

  // Add missing packages to dependencies with "latest" as a placeholder version
  const updatedDeps = {
    ...(pkg.dependencies ?? {}),
    ...Object.fromEntries(addedPackages.map((p) => [p, "latest"])),
  };

  const updatedPkg = { ...pkg, dependencies: updatedDeps };
  return {
    updated: JSON.stringify(updatedPkg, null, 2),
    addedPackages,
  };
}
