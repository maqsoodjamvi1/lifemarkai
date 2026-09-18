/**
 * Validate generated files against a project-contract.json before install.
 *
 * This is the CodeTeam "developers may not create extra files / invent edges"
 * gate, plus the export-contract check against declared public interfaces.
 */
import { collectExports } from "../preview/export-contract.ts";
import { extractImportedPackages } from "./npm-auto-install.ts";
import { resolveAllowedPackage } from "./package-allowlist.ts";
import type { ValidationError } from "./code-parser.ts";
import {
  isScaffoldOrContractPath,
  PROJECT_CONTRACT_PATH,
  readProjectContractFromFiles,
  ensureContractFile,
  REQUIRED_TANSTACK_CONTRACT_FILES,
  type ProjectContract,
  type ProjectContractExport,
  type ProjectContractFile,
  type ProjectContractOwner,
} from "./project-contract.ts";
import { normalizeProjectPath } from "./dependency-context.ts";

const CODE_RE = /\.(tsx|ts|jsx|js|mjs)$/;
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"];
const LOCAL_PREFIX = /^[./]|^@\/|^~\//;

export interface ContractRestrictionResult<T extends { path: string }> {
  files: T[];
  dropped: string[];
}

export interface AppliedProjectContract<T extends { path: string }> extends ContractRestrictionResult<T> {
  contract: ProjectContract;
}

function sourceStem(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/__tests__\//, "/")
    .replace(/\.(test|spec)\.(tsx|ts|jsx|js)$/, "")
    .replace(/\.(tsx|ts|jsx|js)$/, "");
}

function isCompanionTestFile(path: string, accepted: Set<string>): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (!/\.(test|spec)\.(tsx|ts|jsx|js)$/.test(normalized)) return false;
  const stem = sourceStem(normalized);
  if (!stem) return false;
  for (const existing of accepted) {
    if (existing !== normalized && sourceStem(existing) === stem) return true;
  }
  return false;
}

function fileByPath(contract: ProjectContract): Map<string, ProjectContractFile> {
  return new Map(contract.files.map((file) => [file.path, file]));
}

function resolveLocalSpec(importer: string, spec: string, paths: Set<string>): string | null {
  const specPath = spec.replace(/\?.*$/, "");
  let base: string;
  if (specPath.startsWith("@/") || specPath.startsWith("~/")) base = `src/${specPath.slice(2)}`;
  else if (specPath.startsWith("./") || specPath.startsWith("../")) {
    const dir = importer.split("/").slice(0, -1);
    for (const part of specPath.split("/")) {
      if (part === "." || part === "") continue;
      if (part === "..") dir.pop();
      else dir.push(part);
    }
    base = dir.join("/");
  } else if (specPath.startsWith("src/")) base = specPath;
  else return null;

  const normalized = normalizeProjectPath(base);
  for (const ext of EXTS) {
    const direct = normalizeProjectPath(normalized + ext);
    if (paths.has(direct)) return direct;
  }
  for (const ext of EXTS.slice(1)) {
    const indexed = normalizeProjectPath(`${normalized}/index${ext}`);
    if (paths.has(indexed)) return indexed;
  }
  return normalizeProjectPath(normalized);
}

function collectImportEdges(content: string): Array<{ spec: string; names: string[]; isDefault: boolean }> {
  const src = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const edges: Array<{ spec: string; names: string[]; isDefault: boolean }> = [];

  const named = /import\s+(?:type\s+)?(?:([\w$]+)\s*,\s*)?\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of src.matchAll(named)) {
    if (/^\s*import\s+type\b/.test(match[0])) continue;
    const names = match[2]
      .split(",")
      .map((piece) => piece.trim())
      .filter((piece) => piece && !/^type\s/.test(piece))
      .map((piece) => {
        const asMatch = piece.match(/^([\w$]+)\s+as\s+[\w$]+$/);
        return asMatch ? asMatch[1] : piece;
      })
      .filter((name) => /^[\w$]+$/.test(name));
    edges.push({ spec: match[3], names, isDefault: Boolean(match[1]) });
  }

  const defaults = /import\s+(?:type\s+)?([\w$]+)\s+from\s*['"]([^'"]+)['"]/g;
  for (const match of src.matchAll(defaults)) {
    if (/^\s*import\s+type\b/.test(match[0])) continue;
    edges.push({ spec: match[2], names: [], isDefault: true });
  }

  const stars = /import\s+\*\s+as\s+[\w$]+\s+from\s*['"]([^'"]+)['"]/g;
  for (const match of src.matchAll(stars)) {
    edges.push({ spec: match[1], names: [], isDefault: false });
  }

  const sideEffect = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const match of src.matchAll(sideEffect)) {
    edges.push({ spec: match[1], names: [], isDefault: false });
  }

  return edges;
}

export function undeclaredFileErrors(dropped: string[]): ValidationError[] {
  return dropped.map((path) => ({
    type: "undeclared_file",
    file: path,
    message: `${path} was generated but is not listed in ${PROJECT_CONTRACT_PATH}. Do not create files outside the contract.`,
    severity: "error" as const,
  }));
}

const FORBIDDEN_TANSTACK_PATHS = /^(index\.html|src\/main\.(t|j)sx|src\/App\.(t|j)sx)$/;

export function isForbiddenTanStackEntry(path: string): boolean {
  return FORBIDDEN_TANSTACK_PATHS.test(path.replace(/\\/g, "/").replace(/^\/+/, ""));
}

export function projectLooksTanStack(
  files: Array<{ path: string }>,
  contract: { framework?: string } | null = null,
): boolean {
  if (contract?.framework === "tanstack-start") return true;
  return files.some((file) => {
    const path = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
    return path === "src/routes/__root.tsx" || path === "src/router.tsx";
  });
}

/**
 * Merge/import/pull writers: drop Vite SPA entries when the target (or the
 * incoming tree) is TanStack Start. Unlike constrainRepairFiles this keeps
 * every other imported path — the user asked to copy those files.
 */
export function dropForbiddenTanStackMergeFiles<T extends { path: string }>(
  proposed: T[],
  existing: Array<{ path: string }> = [],
): { files: T[]; dropped: string[] } {
  if (!projectLooksTanStack([...existing, ...proposed])) {
    return { files: proposed, dropped: [] };
  }
  const dropped: string[] = [];
  const files = proposed.filter((file) => {
    if (!isForbiddenTanStackEntry(file.path)) return true;
    dropped.push(file.path.replace(/\\/g, "/").replace(/^\/+/, ""));
    return false;
  });
  return { files, dropped };
}

/**
 * Architect vs scaffold: extra product files are planned generate work, not a
 * failed first-boot. Fail only when required Start files are missing or the
 * contract plants Vite SPA entries.
 */
export function scoreContractAgainstScaffold(
  contract: ProjectContract,
  files: Array<{ path: string }>,
): {
  requiredMissing: string[];
  forbidden: string[];
  extraProduct: string[];
  requiredCovered: boolean;
} {
  const present = new Set(
    files.map((file) => file.path.replace(/\\/g, "/").replace(/^\/+/, "")),
  );
  const requiredMissing = REQUIRED_TANSTACK_CONTRACT_FILES
    .map((file) => file.path)
    .filter((path) => !contract.files.some((item) => item.path === path));
  const forbidden = contract.files
    .map((file) => file.path)
    .filter((path) => isForbiddenTanStackEntry(path));
  const extraProduct = contract.files
    .map((file) => file.path)
    .filter(
      (path) =>
        path !== PROJECT_CONTRACT_PATH &&
        !present.has(path) &&
        !isForbiddenTanStackEntry(path),
    );
  return {
    requiredMissing,
    forbidden,
    extraProduct,
    requiredCovered: requiredMissing.length === 0 && forbidden.length === 0,
  };
}

/**
 * Live-stream and tool writes must never plant Vite entries into a Start app,
 * and must not preview undeclared extras that the contract will drop on commit.
 */
export function shouldLiveStreamGeneratedPath(
  path: string,
  existing: Array<{ path: string }>,
  contract: { framework?: string; files?: Array<{ path: string }> } | null = null,
  content = "",
): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (projectLooksTanStack(existing, contract) && isForbiddenTanStackEntry(normalized)) {
    return false;
  }
  if (!contract?.files?.length) return true;
  const accepted = new Set<string>();
  for (const file of contract.files) accepted.add(file.path.replace(/\\/g, "/"));
  for (const file of existing) accepted.add(file.path.replace(/\\/g, "/"));
  if (accepted.has(normalized) || isScaffoldOrContractPath(normalized)) return true;
  if (/^src\/routes\/.+\.tsx$/.test(normalized) && /createFileRoute\s*\(/.test(content)) return true;
  if (isCompanionTestFile(normalized, accepted)) return true;
  return false;
}

export function restrictGeneratedFilesToContract<T extends { path: string }>(
  files: T[],
  existingFiles: Array<{ path: string }>,
  contract: ProjectContract,
): ContractRestrictionResult<T> {
  const allowed = new Set(contract.files.map((file) => file.path));
  allowed.add(PROJECT_CONTRACT_PATH);
  const existing = new Set(existingFiles.map((file) => file.path));
  const kept: T[] = [];
  const dropped: string[] = [];
  for (const file of files) {
    if (contract.framework === "tanstack-start" && isForbiddenTanStackEntry(file.path) && !allowed.has(file.path)) {
      dropped.push(file.path);
      continue;
    }
    if (allowed.has(file.path) || existing.has(file.path) || isScaffoldOrContractPath(file.path)) {
      kept.push(file);
    } else {
      dropped.push(file.path);
    }
  }
  return { files: kept, dropped };
}

function inferContractOwner(path: string): ProjectContractOwner {
  if (/^(package\.json|tsconfig|vite\.config|tailwind\.config|postcss\.config)/.test(path)) return "config";
  if (/\.(test|spec)\./.test(path)) return "test";
  if (isScaffoldOrContractPath(path) && !/^src\/routes\/index\.tsx$/.test(path)) return "scaffold";
  return "product";
}

function inferContractExports(path: string, content: string): ProjectContractExport[] {
  if (/^src\/routes\/.+\.tsx$/.test(path) && /createFileRoute\s*\(/.test(content)) {
    return [{ name: "Route", kind: "named" }];
  }
  const actual = collectExports(content);
  return [...actual.names].slice(0, 12).map((name) => ({
    name,
    kind: name === "default" ? "default" : "named",
  }));
}

function routePathFromFile(path: string): string | null {
  const match = path.replace(/\\/g, "/").match(/^src\/routes\/(.+)\.tsx$/);
  if (!match) return null;
  const seg = match[1];
  if (!seg || seg === "__root" || seg.includes("$") || seg.includes("[")) return null;
  if (seg === "index") return "/";
  return `/${seg.replace(/\./g, "/")}`;
}

function addDependsOn(files: ProjectContractFile[], from: string, to: string): void {
  if (from === to) return;
  const planned = files.find((file) => file.path === from);
  if (!planned || planned.dependsOn.includes(to)) return;
  planned.dependsOn = [...planned.dependsOn, to];
}

/**
 * Fold newly requested product files (new file routes + anything they import)
 * into an existing contract so later edits are not dropped as undeclared, and
 * unused hallucinations (Ghost.tsx, App.tsx) still get discarded.
 *
 * `requestedPaths` is for user-initiated writes (component import, MCP generate)
 * that are not yet imported by a contracted file. Forbidden TanStack Vite
 * entries are still rejected even when requested.
 */
export function extendProjectContract(
  contract: ProjectContract,
  files: Array<{ path: string; content: string }>,
  existingFiles: Array<{ path: string }> = [],
  requestedPaths: Iterable<string> = [],
): ProjectContract {
  const byPath = new Map(files.map((file) => [file.path.replace(/\\/g, "/"), file]));
  const allPaths = new Set(byPath.keys());
  const declared = new Set(contract.files.map((file) => file.path));
  const accepted = new Set(declared);
  for (const row of existingFiles) accepted.add(row.path.replace(/\\/g, "/"));
  const requested = new Set<string>();
  for (const path of requestedPaths) {
    requested.add(path.replace(/\\/g, "/").replace(/^\/+/, ""));
  }

  for (const [path, file] of byPath) {
    if (isForbiddenTanStackEntry(path) || accepted.has(path)) continue;
    if (requested.has(path)) accepted.add(path);
    if (/^src\/routes\/.+\.tsx$/.test(path) && /createFileRoute\s*\(/.test(file.content)) {
      accepted.add(path);
    }
    if (isCompanionTestFile(path, accepted)) {
      accepted.add(path);
    }
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const path of [...accepted]) {
      const file = byPath.get(path);
      if (!file || !CODE_RE.test(path)) continue;
      for (const edge of collectImportEdges(file.content)) {
        if (!LOCAL_PREFIX.test(edge.spec) && !edge.spec.startsWith("src/")) continue;
        const resolved = resolveLocalSpec(path, edge.spec, allPaths);
        if (!resolved || !byPath.has(resolved) || isForbiddenTanStackEntry(resolved)) continue;
        if (!accepted.has(resolved)) {
          accepted.add(resolved);
          grew = true;
        }
      }
    }
  }

  const filesOut: ProjectContractFile[] = contract.files.map((file) => ({
    ...file,
    exports: [...file.exports],
    dependsOn: [...file.dependsOn],
  }));
  const routesOut = [...contract.routes];
  const packagesOut = [...contract.packages];
  const testsOut = [...contract.acceptanceTests];
  const packageNames = new Set(packagesOut.map((pkg) => pkg.name));
  const routePaths = new Set(routesOut.map((route) => route.path));
  const testIds = new Set(testsOut.map((test) => test.id));

  for (const path of accepted) {
    const file = byPath.get(path);
    if (!file) continue;
    if (CODE_RE.test(path)) {
      for (const edge of collectImportEdges(file.content)) {
        if (!LOCAL_PREFIX.test(edge.spec) && !edge.spec.startsWith("src/")) continue;
        const resolved = resolveLocalSpec(path, edge.spec, allPaths);
        if (resolved && accepted.has(resolved)) addDependsOn(filesOut, path, resolved);
      }
      for (const pkg of extractImportedPackages(file.content)) {
        if (pkg === "react" || pkg === "react-dom" || packageNames.has(pkg)) continue;
        if (!resolveAllowedPackage(pkg).allowed) continue;
        packageNames.add(pkg);
        packagesOut.push({ name: pkg, dev: false });
      }
    }
    if (declared.has(path) || filesOut.some((item) => item.path === path)) continue;
    if (!CODE_RE.test(path) && !path.endsWith(".css") && !requested.has(path)) continue;
    filesOut.push({
      path,
      purpose: `Product file added after the initial contract`,
      owner: inferContractOwner(path),
      exports: CODE_RE.test(path) ? inferContractExports(path, file.content) : [],
      dependsOn: [],
    });
    if (CODE_RE.test(path)) {
      for (const edge of collectImportEdges(file.content)) {
        if (!LOCAL_PREFIX.test(edge.spec) && !edge.spec.startsWith("src/")) continue;
        const resolved = resolveLocalSpec(path, edge.spec, allPaths);
        if (resolved && accepted.has(resolved)) addDependsOn(filesOut, path, resolved);
      }
    }
    const routePath = routePathFromFile(path);
    if (routePath && !routePaths.has(routePath)) {
      routePaths.add(routePath);
      routesOut.push({ path: routePath, file: path });
      const testId = `smoke-${routePath.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "page"}`;
      if (routePath !== "/" && !testIds.has(testId)) {
        testIds.add(testId);
        testsOut.push({
          id: testId,
          description: `Browser smoke test of ${routePath}`,
          kind: "smoke",
          target: routePath,
        });
      }
    }
  }

  return {
    ...contract,
    files: filesOut,
    routes: routesOut,
    packages: packagesOut,
    acceptanceTests: testsOut,
  };
}

export function applyGeneratedContract<T extends { path: string; content: string; language?: string }>(
  files: T[],
  existingFiles: Array<{ path: string }>,
  contract: ProjectContract,
  requestedPaths: Iterable<string> = [],
): AppliedProjectContract<T> {
  const extended = extendProjectContract(contract, files, existingFiles, requestedPaths);
  const restricted = restrictGeneratedFilesToContract(ensureContractFile(files, extended), existingFiles, extended);
  return { ...restricted, contract: extended };
}

/**
 * Keep a repair's proposed writes inside the contract. New file-routes the
 * user (or the error) actually needs are merged in; App.tsx / unused extras
 * are dropped. Returns only the proposed paths that survive, plus an updated
 * project-contract.json when the contract grew.
 */
export function constrainRepairFiles<T extends { path: string; content: string; language?: string }>(
  proposed: T[],
  existing: Array<{ path: string; content?: string; language?: string }>,
  contract: ProjectContract | null,
  requestedPaths: Iterable<string> = [],
): { files: T[]; dropped: string[]; contract: ProjectContract | null } {
  const looksTanStack = [...existing, ...proposed].some(
    (file) => file.path === "src/routes/__root.tsx" || file.path === "src/router.tsx",
  );
  if (!contract) {
    if (!looksTanStack) return { files: proposed, dropped: [], contract: null };
    const dropped = proposed.filter((file) => isForbiddenTanStackEntry(file.path)).map((file) => file.path);
    return {
      files: proposed.filter((file) => !dropped.includes(file.path)),
      dropped,
      contract: null,
    };
  }

  const merged = new Map<string, T>();
  for (const file of existing) {
    merged.set(file.path, { path: file.path, content: file.content ?? "", language: file.language } as T);
  }
  for (const file of proposed) merged.set(file.path, file);
  const applied = applyGeneratedContract([...merged.values()], existing, contract, requestedPaths);
  const intended = new Set(proposed.map((file) => file.path));
  const kept = applied.files.filter((file) => intended.has(file.path));
  const dropped = proposed.map((file) => file.path).filter((path) => !kept.some((file) => file.path === path));
  const previous = existing.find((file) => file.path === PROJECT_CONTRACT_PATH)?.content ?? "";
  const nextContractFile = applied.files.find((file) => file.path === PROJECT_CONTRACT_PATH);
  const contractGrew =
    applied.contract.files.length !== contract.files.length ||
    applied.contract.routes.length !== contract.routes.length;
  if (contractGrew && nextContractFile && nextContractFile.content !== previous) {
    if (!kept.some((file) => file.path === PROJECT_CONTRACT_PATH)) kept.push(nextContractFile);
  }
  return { files: kept, dropped, contract: applied.contract };
}

export function validateFilesAgainstProjectContract(
  files: Array<{ path: string; content: string }>,
  existingFiles: Array<{ path: string; content: string }> = [],
  contract = readProjectContractFromFiles(files, existingFiles),
): ValidationError[] {
  if (!contract) return [];

  const errors: ValidationError[] = [];
  const declared = fileByPath(contract);
  const merged = new Map<string, { path: string; content: string }>();
  for (const file of existingFiles) merged.set(file.path, file);
  for (const file of files) merged.set(file.path, file);
  const generatedPaths = new Set(files.map((file) => file.path));
  const allPaths = new Set(merged.keys());

  for (const file of files) {
    if (file.path === PROJECT_CONTRACT_PATH) continue;
    if (contract.framework === "tanstack-start" && isForbiddenTanStackEntry(file.path)) {
      errors.push({
        type: "forbidden_tanstack_entry",
        file: file.path,
        message: `${file.path} is not part of a TanStack Start app. Remove it; the Start plugin owns the entry.`,
        severity: "error",
      });
      continue;
    }
    if (declared.has(file.path) || isScaffoldOrContractPath(file.path) || existingFiles.some((row) => row.path === file.path)) {
      continue;
    }
    errors.push({
      type: "undeclared_file",
      file: file.path,
      message: `${file.path} was generated but is not listed in ${PROJECT_CONTRACT_PATH}. Do not create files outside the contract.`,
      severity: "error",
    });
  }

  for (const planned of contract.files) {
    if (planned.owner === "config" || planned.owner === "scaffold") {
      if (!allPaths.has(planned.path)) {
        errors.push({
          type: "missing_contract_file",
          file: planned.path,
          message: `Contracted ${planned.owner} file ${planned.path} is missing.`,
          severity: "error",
        });
      }
      continue;
    }
    if (!allPaths.has(planned.path)) {
      errors.push({
        type: "missing_contract_file",
        file: planned.path,
        message: `Contracted file ${planned.path} (${planned.purpose}) was never generated.`,
        severity: "error",
      });
    }
  }

  for (const route of contract.routes) {
    const file = merged.get(route.file);
    if (!file) {
      errors.push({
        type: "missing_contract_route",
        file: route.file,
        message: `Contracted route ${route.path} is missing its file ${route.file}.`,
        severity: "error",
      });
      continue;
    }
    if (route.file !== "src/routes/__root.tsx" && !/createFileRoute\s*\(/.test(file.content)) {
      errors.push({
        type: "route_missing_createFileRoute",
        file: route.file,
        message: `${route.file} is contracted as route ${route.path} but does not call createFileRoute().`,
        severity: "error",
      });
    }
  }

  const contractedPackages = new Set(contract.packages.map((pkg) => pkg.name));
  contractedPackages.add("react");
  contractedPackages.add("react-dom");

  for (const file of merged.values()) {
    if (!CODE_RE.test(file.path)) continue;
    const planned = declared.get(file.path);

    if (planned && planned.exports.length > 0 && generatedPaths.has(file.path)) {
      const actual = collectExports(file.content);
      if (!actual.hasStarReexport) {
        for (const exported of planned.exports) {
          if (!actual.names.has(exported.name)) {
            errors.push({
              type: "missing_contract_export",
              file: file.path,
              message: `${file.path} must export ${exported.name} (declared in ${PROJECT_CONTRACT_PATH}) but does not.`,
              severity: "error",
            });
          }
        }
      }
    }

    for (const edge of collectImportEdges(file.content)) {
      if (!LOCAL_PREFIX.test(edge.spec) && !edge.spec.startsWith("src/")) continue;
      if (edge.spec.includes("?")) continue;
      if (/routeTree\.gen$/.test(edge.spec.replace(/\.(ts|tsx|js|jsx)$/, ""))) continue;
      const resolved = resolveLocalSpec(file.path, edge.spec, allPaths);
      if (!resolved) continue;
      const target = declared.get(resolved);
      if (planned && resolved !== file.path && !planned.dependsOn.includes(resolved) && declared.has(resolved)) {
        errors.push({
          type: "undeclared_dependency_edge",
          file: file.path,
          message: `${file.path} imports ${resolved} but ${PROJECT_CONTRACT_PATH} does not list that dependsOn edge.`,
          severity: "error",
        });
      }
      if (target && (edge.isDefault || edge.names.length > 0)) {
        const exportedNames = new Set(target.exports.map((item) => item.name));
        if (edge.isDefault && exportedNames.size > 0 && !exportedNames.has("default")) {
          errors.push({
            type: "undeclared_default_import",
            file: file.path,
            message: `${file.path} default-imports ${resolved}, which does not declare a default export in the contract.`,
            severity: "error",
          });
        }
        for (const name of edge.names) {
          if (exportedNames.size > 0 && !exportedNames.has(name)) {
            errors.push({
              type: "undeclared_named_import",
              file: file.path,
              message: `${file.path} imports { ${name} } from ${resolved}, which does not declare that export in the contract.`,
              severity: "error",
            });
          }
        }
      }
    }

    for (const pkg of extractImportedPackages(file.content)) {
      if (pkg === "react" || pkg === "react-dom") continue;
      if (!contractedPackages.has(pkg)) {
        const allowed = resolveAllowedPackage(pkg);
        errors.push({
          type: allowed.allowed ? "undeclared_package" : "disallowed_package",
          file: file.path,
          message: allowed.allowed
            ? `${file.path} imports ${pkg}, which is not listed in ${PROJECT_CONTRACT_PATH} packages.`
            : `${file.path} imports ${pkg}, which is not on the install allowlist.`,
          severity: "error",
        });
      }
    }
  }

  return errors;
}

/** Completeness defects that must fail boot / enter repair — not generate-time package edges. */
export const PROJECT_CONTRACT_BOOT_ERROR_TYPES = new Set([
  "missing_contract_file",
  "missing_contract_route",
  "forbidden_tanstack_entry",
]);

/** Self-verify / agent repair consume these as `file — message` lines. */
export function formatProjectContractErrors(
  files: Array<{ path: string; content?: string | null }>,
  contract: ProjectContract | null | undefined,
  existingFiles: Array<{ path: string; content?: string | null }> = [],
  types: ReadonlySet<string> = PROJECT_CONTRACT_BOOT_ERROR_TYPES,
): string[] {
  if (!contract) return [];
  return validateFilesAgainstProjectContract(
    files.map((file) => ({ path: file.path, content: file.content ?? "" })),
    existingFiles.map((file) => ({ path: file.path, content: file.content ?? "" })),
    contract,
  )
    .filter((error) => error.severity === "error" && types.has(error.type))
    .map((error) => (error.file ? `${error.file} — ${error.message}` : error.message));
}
