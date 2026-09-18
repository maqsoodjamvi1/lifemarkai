/**
 * Narrow the repair context to the failing dependency slice (RepoReason).
 *
 * Repository-level agents fail at integration width, not at reading one file.
 * Sending the whole repo makes that worse. This selector gives the repair
 * model: the broken symbol, its defining file, importers, relevant config,
 * and contracted acceptance targets — and nothing else.
 */
import { expandDependencyPaths, normalizeProjectPath } from "./dependency-context.ts";
import { readProjectContractFromFiles, type ProjectContract } from "./project-contract.ts";

export interface RepairSliceFile {
  path: string;
  content: string;
}

export interface RepairSlice<T extends RepairSliceFile> {
  files: T[];
  paths: string[];
  brokenSymbol: string | null;
  definingFile: string | null;
  importers: string[];
  configFiles: string[];
  brief: string;
}

const CONFIG_PATHS = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "src/routes/__root.tsx",
  "src/router.tsx",
];

function filesNamedInErrors(errors: string[]): string[] {
  const paths = new Set<string>();
  for (const error of errors) {
    for (const match of error.matchAll(/([\w./@-]+\.(?:tsx|ts|jsx|js|mjs|css|json))\b/g)) {
      paths.add(normalizeProjectPath(match[1]));
    }
  }
  return [...paths];
}

function brokenSymbolInErrors(errors: string[]): { symbol: string | null; definingFile: string | null } {
  for (const error of errors) {
    const quoted = error.match(/['"]([A-Za-z_$][\w$]*)['"]\s+is imported by\s+([\w./-]+\.\w+)/);
    if (quoted) return { symbol: quoted[1], definingFile: quoted[2] };
    const ts = error.match(/\b(?:Cannot find name|has no exported member|is not exported)\s+['"]?([A-Za-z_$][\w$]*)['"]?/);
    const file = error.match(/^([\w./-]+\.\w+):\d+/);
    if (ts) return { symbol: ts[1], definingFile: file?.[1] ?? null };
    const missingExport = error.match(/must export ([A-Za-z_$][\w$]*)/);
    if (missingExport) {
      const path = error.match(/([\w./-]+\.(?:tsx|ts|jsx|js))/);
      return { symbol: missingExport[1], definingFile: path?.[1] ?? null };
    }
  }
  return { symbol: null, definingFile: null };
}

export function selectRepairSlice<T extends RepairSliceFile>(
  files: T[],
  errors: string[],
  contract?: ProjectContract | null,
): RepairSlice<T> {
  const effectiveContract = contract ?? readProjectContractFromFiles(files);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const named = filesNamedInErrors(errors).filter((path) => byPath.has(path));
  const { symbol, definingFile } = brokenSymbolInErrors(errors);
  const seeds = [...named];
  if (definingFile && byPath.has(definingFile) && !seeds.includes(definingFile)) seeds.push(definingFile);

  const expanded = expandDependencyPaths(seeds.length > 0 ? seeds : files.slice(0, 1).map((file) => file.path), files, 2);
  const configFiles = CONFIG_PATHS.filter((path) => byPath.has(path));
  const importers: string[] = [];
  if (definingFile) {
    for (const file of files) {
      if (file.path === definingFile) continue;
      if (file.content.includes(definingFile.split("/").pop()?.replace(/\.\w+$/, "") ?? "\0")) {
        importers.push(file.path);
      }
    }
  }

  const allowed = new Set([...expanded, ...configFiles, ...importers]);
  if (effectiveContract) {
    for (const test of effectiveContract.acceptanceTests) {
      if (test.target && test.target !== "/") {
        const route = effectiveContract.routes.find((item) => item.path === test.target);
        if (route) allowed.add(route.file);
      }
    }
    if (definingFile) {
      const planned = effectiveContract.files.find((file) => file.path === definingFile);
      for (const dep of planned?.dependsOn ?? []) allowed.add(dep);
      for (const file of effectiveContract.files) {
        if (file.dependsOn.includes(definingFile)) allowed.add(file.path);
      }
    }
  }

  const sliceFiles = files.filter((file) => allowed.has(file.path));
  const fallback = sliceFiles.length > 0 ? sliceFiles : files.slice(0, Math.min(8, files.length));
  const briefParts = [
    "Repair only this dependency slice. Do not rewrite unrelated files.",
    symbol ? `Broken symbol: ${symbol}` : null,
    definingFile ? `Defining file: ${definingFile}` : null,
    importers.length > 0 ? `Importers: ${importers.slice(0, 8).join(", ")}` : null,
    `Slice files: ${fallback.map((file) => file.path).join(", ")}`,
  ].filter(Boolean);

  return {
    files: fallback,
    paths: fallback.map((file) => file.path),
    brokenSymbol: symbol,
    definingFile,
    importers,
    configFiles,
    brief: briefParts.join("\n"),
  };
}
