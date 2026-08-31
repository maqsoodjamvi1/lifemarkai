export interface DependencyFileRef {
  path: string;
  content: string;
}

const IMPORT_RE = /(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;
const CODE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".json"];

export function normalizeProjectPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function resolveImportPath(fromPath: string, specifier: string, paths: Set<string>): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith("~/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith(".")) {
    const directory = fromPath.replace(/\/[^/]+$/, "");
    base = normalizeProjectPath(`${directory}/${specifier}`);
  } else return null;

  for (const extension of CODE_EXTENSIONS) {
    const direct = normalizeProjectPath(base + extension);
    if (paths.has(direct)) return direct;
    const indexed = normalizeProjectPath(`${base}/index${extension}`);
    if (paths.has(indexed)) return indexed;
  }
  return null;
}

function importedPaths(file: DependencyFileRef, paths: Set<string>): string[] {
  const result = new Set<string>();
  IMPORT_RE.lastIndex = 0;
  for (const match of file.content.matchAll(IMPORT_RE)) {
    const resolved = resolveImportPath(file.path, match[1] ?? match[2] ?? match[3] ?? "", paths);
    if (resolved) result.add(resolved);
  }
  return [...result];
}

/**
 * Interleave selected files with their imports, then their direct importers.
 * The edit model sees both sides of a component contract without receiving the
 * whole repository. This deterministic layer also works when AI selection is
 * unavailable.
 */
export function expandDependencyPaths(seedPaths: string[], files: DependencyFileRef[], maxDepth = 2): string[] {
  const byPath = new Map(files.map((file) => [normalizeProjectPath(file.path), file]));
  const paths = new Set(byPath.keys());
  const dependencies = new Map<string, string[]>();
  const importers = new Map<string, string[]>();

  for (const [path, file] of byPath) {
    const imported = importedPaths(file, paths);
    dependencies.set(path, imported);
    for (const dependency of imported) {
      const parents = importers.get(dependency) ?? [];
      parents.push(path);
      importers.set(dependency, parents);
    }
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const add = (path: string) => {
    if (!seen.has(path) && byPath.has(path)) {
      seen.add(path);
      result.push(path);
    }
  };

  for (const rawSeed of seedPaths) {
    const seed = normalizeProjectPath(rawSeed);
    add(seed);
    let frontier = [seed];
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const next: string[] = [];
      for (const path of frontier) {
        for (const dependency of dependencies.get(path) ?? []) {
          add(dependency);
          next.push(dependency);
        }
      }
      frontier = next;
    }
    for (const importer of importers.get(seed) ?? []) add(importer);
  }
  return result;
}
