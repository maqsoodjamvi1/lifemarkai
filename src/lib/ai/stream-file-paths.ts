const PATH_SCAN_TAIL_SIZE = 2_048;
const FILE_FIELD_PATTERN = /"(path|name)"\s*:\s*"([^\"]+)"/g;
const FILE_UPDATE_PATH_PATTERN = /<file_update\b[^>]*\bpath=["']([^"']+)["']/gi;
const ROOT_FILE_NAMES = new Set(["Dockerfile", "Makefile", "Procfile"]);

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").trim();
}

function looksLikeFilePath(path: string): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;

  const basename = normalized.split("/").at(-1) ?? "";
  return normalized.includes("/") || basename.includes(".") || ROOT_FILE_NAMES.has(basename);
}

export function createStreamedFilePathTracker() {
  let tail = "";
  const paths = new Set<string>();

  function add(path: string): boolean {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath || paths.has(normalizedPath)) return false;

    paths.add(normalizedPath);
    return true;
  }

  function append(chunk: string): boolean {
    tail = (tail + chunk).slice(-PATH_SCAN_TAIL_SIZE);
    let changed = false;

    for (const match of tail.matchAll(FILE_FIELD_PATTERN)) {
      const [, field, path] = match;
      if ((field === "path" || !path.startsWith("/")) && looksLikeFilePath(path)) {
        changed = add(path) || changed;
      }
    }

    for (const match of tail.matchAll(FILE_UPDATE_PATH_PATTERN)) {
      changed = add(match[1]) || changed;
    }

    return changed;
  }

  return {
    add,
    append,
    getPaths: () => [...paths],
  };
}
