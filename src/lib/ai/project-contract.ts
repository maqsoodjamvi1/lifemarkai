/**
 * Machine-checkable generation contract (CodeTeam SDS, adapted for TanStack Start).
 *
 * Generated BEFORE any product file is written. It records every intended file,
 * route, public export, package, and dependency edge so later stages can reject
 * free-form extras (fabricated imports, missing exports, unowned files) instead
 * of discovering them in the preview.
 *
 * Structural validity mirrors CodeTeam: parseable JSON, every file in the tree,
 * every dependsOn edge points at a declared file, the file graph is acyclic,
 * packages are allowlisted. Invalid model output falls back to a deterministic
 * skeleton so greenfield TanStack builds are never unconstrained.
 */
import { classifyBuildIntent } from "./build-intent.ts";
import { resolveAllowedPackage } from "./package-allowlist.ts";
import { normalizeGeneratedPath } from "./generated-file-contract.ts";
import { SCAFFOLD_FILE_RE } from "./scaffold-files.ts";
import { TANSTACK_START_DEPENDENCIES, TANSTACK_START_DEV_DEPENDENCIES } from "../templates/tanstack-start-scaffold.ts";
import { SITE_CHROME_PATH, SITE_FOOTER_PATH, SITE_HEADER_PATH } from "../templates/site-chrome.ts";

export const PROJECT_CONTRACT_PATH = "project-contract.json";
export const PROJECT_CONTRACT_VERSION = 1 as const;

export type ProjectContractOwner = "scaffold" | "product" | "config" | "test";
export type ProjectContractExportKind = "default" | "named" | "type";
export type ProjectContractTestKind = "typecheck" | "build" | "smoke" | "route";

export interface ProjectContractExport {
  name: string;
  kind?: ProjectContractExportKind;
}

export interface ProjectContractFile {
  path: string;
  purpose: string;
  owner: ProjectContractOwner;
  exports: ProjectContractExport[];
  dependsOn: string[];
}

export interface ProjectContractRoute {
  path: string;
  file: string;
}

export interface ProjectContractPackage {
  name: string;
  version?: string;
  dev?: boolean;
}

export interface ProjectContractAcceptanceTest {
  id: string;
  description: string;
  kind: ProjectContractTestKind;
  target?: string;
}

export interface ProjectContract {
  version: typeof PROJECT_CONTRACT_VERSION;
  framework: "tanstack-start";
  appType: string;
  files: ProjectContractFile[];
  routes: ProjectContractRoute[];
  packages: ProjectContractPackage[];
  acceptanceTests: ProjectContractAcceptanceTest[];
}

export interface ProjectContractIssue {
  code: string;
  path?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ParsedProjectContract {
  contract: ProjectContract;
  issues: ProjectContractIssue[];
  generationOrder: string[];
}

const OWNERS = new Set<ProjectContractOwner>(["scaffold", "product", "config", "test"]);
const TEST_KINDS = new Set<ProjectContractTestKind>(["typecheck", "build", "smoke", "route"]);

export const REQUIRED_TANSTACK_CONTRACT_FILES: ProjectContractFile[] = [
  { path: "package.json", purpose: "npm manifest and scripts", owner: "config", exports: [], dependsOn: [] },
  { path: "tsconfig.json", purpose: "TypeScript compiler options and @/* alias", owner: "config", exports: [], dependsOn: [] },
  { path: "vite.config.ts", purpose: "Vite + tanstackStart() plugin", owner: "config", exports: [{ name: "default", kind: "default" }], dependsOn: [] },
  { path: "tailwind.config.js", purpose: "Tailwind theme", owner: "config", exports: [{ name: "default", kind: "default" }], dependsOn: [] },
  { path: "postcss.config.js", purpose: "PostCSS plugins", owner: "config", exports: [{ name: "default", kind: "default" }], dependsOn: [] },
  { path: "src/styles.css", purpose: "Tailwind entry stylesheet", owner: "scaffold", exports: [], dependsOn: [] },
  { path: "src/lib/utils.ts", purpose: "cn() class helper", owner: "scaffold", exports: [{ name: "cn", kind: "named" }], dependsOn: [] },
  { path: SITE_HEADER_PATH, purpose: "Public-site header", owner: "scaffold", exports: [{ name: "Header", kind: "named" }], dependsOn: [] },
  { path: SITE_FOOTER_PATH, purpose: "Public-site footer", owner: "scaffold", exports: [{ name: "Footer", kind: "named" }], dependsOn: [] },
  {
    path: SITE_CHROME_PATH,
    purpose: "Mounts header/footer on public routes only",
    owner: "scaffold",
    exports: [{ name: "SiteChrome", kind: "named" }],
    dependsOn: [SITE_HEADER_PATH, SITE_FOOTER_PATH],
  },
  {
    path: "src/routes/__root.tsx",
    purpose: "Root document: html/head/body, HeadContent, Outlet, Scripts",
    owner: "scaffold",
    exports: [{ name: "Route", kind: "named" }],
    dependsOn: [SITE_CHROME_PATH, "src/styles.css"],
  },
  {
    path: "src/routes/index.tsx",
    purpose: "Home route",
    owner: "product",
    exports: [{ name: "Route", kind: "named" }],
    dependsOn: [],
  },
  {
    path: "src/router.tsx",
    purpose: "getRouter() factory",
    owner: "scaffold",
    exports: [{ name: "getRouter", kind: "named" }],
    dependsOn: [],
  },
];

const DEFAULT_ACCEPTANCE: ProjectContractAcceptanceTest[] = [
  { id: "typecheck", description: "TypeScript --noEmit on the generated app", kind: "typecheck" },
  { id: "production-build", description: "vite production build", kind: "build" },
  { id: "smoke-home", description: "Browser smoke test of the home route", kind: "smoke", target: "/" },
];

export function isTanStackFramework(framework: string | null | undefined): boolean {
  return framework === "tanstack-start" || framework === "tanstack";
}

export function shouldGenerateProjectContract(opts: {
  mode: string;
  greenfield: boolean;
  framework: string;
}): boolean {
  if (process.env.LIFEMARK_PROJECT_CONTRACT === "0") return false;
  return opts.mode === "build" && opts.greenfield && isTanStackFramework(opts.framework);
}

/** Extra routes the browser smoke sweep should visit (home is always loaded). */
export function collectContractSmokeRoutes(
  files: Array<{ path: string }>,
  contract?: ProjectContract | null,
): string[] {
  const routes = new Set<string>();
  for (const route of contract?.routes ?? []) {
    const path = route.path?.trim();
    if (!path || path === "/" || path.includes(":") || path.includes("*") || path.includes("$")) continue;
    routes.add(path.startsWith("/") ? path : `/${path}`);
  }
  for (const test of contract?.acceptanceTests ?? []) {
    if (test.kind !== "smoke" && test.kind !== "route") continue;
    const path = test.target?.trim();
    if (!path || path === "/" || path.includes(":") || path.includes("*") || path.includes("$")) continue;
    routes.add(path.startsWith("/") ? path : `/${path}`);
  }
  for (const file of files) {
    const match = file.path.replace(/\\/g, "/").match(/^src\/routes\/(.+)\.tsx$/);
    if (!match) continue;
    const seg = match[1];
    if (!seg || seg === "__root" || seg === "index") continue;
    if (seg.includes("$") || seg.includes("[") || seg.startsWith("-")) continue;
    const path = `/${seg.replace(/\./g, "/")}`;
    if (path !== "/") routes.add(path);
  }
  return [...routes].slice(0, 8);
}

export function isScaffoldOrContractPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized === PROJECT_CONTRACT_PATH || SCAFFOLD_FILE_RE.test(normalized);
}

export function serializeProjectContract(contract: ProjectContract): string {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

export function contractAsProjectFile(contract: ProjectContract): {
  path: string;
  content: string;
  language: string;
} {
  return {
    path: PROJECT_CONTRACT_PATH,
    content: serializeProjectContract(contract),
    language: "json",
  };
}

function normalizeRoutePath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "/") return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function parseExports(value: unknown): ProjectContractExport[] {
  if (!Array.isArray(value)) return [];
  const out: ProjectContractExport[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string") {
      const name = item.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, kind: name === "default" ? "default" : "named" });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = String(rec.name ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const kind = rec.kind === "default" || rec.kind === "type" || rec.kind === "named" ? rec.kind : name === "default" ? "default" : "named";
    out.push({ name, kind });
  }
  return out;
}

function parseFileEntry(raw: unknown): ProjectContractFile | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const path = normalizeGeneratedPath(String(rec.path ?? ""));
  if (!path) return null;
  const ownerRaw = String(rec.owner ?? "product");
  const owner: ProjectContractOwner = OWNERS.has(ownerRaw as ProjectContractOwner)
    ? (ownerRaw as ProjectContractOwner)
    : "product";
  return {
    path,
    purpose: String(rec.purpose ?? rec.responsibility ?? "").trim() || path,
    owner,
    exports: parseExports(rec.exports ?? rec.public_api ?? rec.publicApi),
    dependsOn: asStringArray(rec.dependsOn ?? rec.depends_on)
      .map((dep) => normalizeGeneratedPath(dep.split("::")[0] ?? "") ?? "")
      .filter(Boolean),
  };
}

function parseFiles(raw: unknown): ProjectContractFile[] {
  if (Array.isArray(raw)) {
    return raw.map(parseFileEntry).filter((file): file is ProjectContractFile => file !== null);
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([path, value]) => {
      const base = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
      return parseFileEntry({ ...base, path: base.path ?? path });
    }).filter((file): file is ProjectContractFile => file !== null);
  }
  return [];
}

function topoSort(files: ProjectContractFile[]): { order: string[]; cycles: string[][] } {
  const ids = files.map((file) => file.path);
  const idSet = new Set(ids);
  const inbound = new Map<string, number>();
  const outbound = new Map<string, string[]>();
  for (const id of ids) {
    inbound.set(id, 0);
    outbound.set(id, []);
  }
  for (const file of files) {
    for (const dep of file.dependsOn) {
      if (!idSet.has(dep) || dep === file.path) continue;
      outbound.get(dep)!.push(file.path);
      inbound.set(file.path, (inbound.get(file.path) ?? 0) + 1);
    }
  }
  const queue = ids.filter((id) => (inbound.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const next = queue.shift()!;
    order.push(next);
    for (const child of outbound.get(next) ?? []) {
      const remaining = (inbound.get(child) ?? 1) - 1;
      inbound.set(child, remaining);
      if (remaining === 0) queue.push(child);
    }
  }
  if (order.length === ids.length) return { order, cycles: [] };

  const leftover = new Set(ids.filter((id) => !order.includes(id)));
  const cycles: string[][] = [];
  while (leftover.size > 0) {
    const start = leftover.values().next().value as string;
    const cycle: string[] = [];
    let cursor: string | undefined = start;
    const seen = new Set<string>();
    while (cursor && leftover.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      cycle.push(cursor);
      leftover.delete(cursor);
      cursor = (files.find((file) => file.path === cursor)?.dependsOn ?? []).find((dep) => leftover.has(dep) || seen.has(dep));
    }
    if (cycle.length > 0) cycles.push(cycle);
  }
  return { order: [...order, ...ids.filter((id) => !order.includes(id))], cycles };
}

function defaultPackages(): ProjectContractPackage[] {
  return [
    ...Object.entries(TANSTACK_START_DEPENDENCIES).map(([name, version]) => ({ name, version, dev: false })),
    ...Object.entries(TANSTACK_START_DEV_DEPENDENCIES).map(([name, version]) => ({ name, version, dev: true })),
  ];
}

function mergeFiles(base: ProjectContractFile[], extra: ProjectContractFile[]): ProjectContractFile[] {
  const byPath = new Map<string, ProjectContractFile>();
  for (const file of base) byPath.set(file.path, { ...file, dependsOn: [...file.dependsOn], exports: [...file.exports] });
  for (const file of extra) {
    const current = byPath.get(file.path);
    if (!current) {
      byPath.set(file.path, { ...file, dependsOn: [...file.dependsOn], exports: [...file.exports] });
      continue;
    }
    const exportNames = new Set(current.exports.map((item) => item.name));
    for (const item of file.exports) {
      if (!exportNames.has(item.name)) {
        current.exports.push(item);
        exportNames.add(item.name);
      }
    }
    const deps = new Set(current.dependsOn);
    for (const dep of file.dependsOn) deps.add(dep);
    current.dependsOn = [...deps];
    if (file.purpose && file.purpose !== file.path) current.purpose = file.purpose;
    if (file.owner === "product" && current.owner === "scaffold") current.owner = "product";
  }
  return [...byPath.values()];
}

function collectIssues(contract: ProjectContract): { issues: ProjectContractIssue[]; generationOrder: string[] } {
  const issues: ProjectContractIssue[] = [];
  const paths = new Set<string>();
  for (const file of contract.files) {
    if (paths.has(file.path)) {
      issues.push({ code: "duplicate-file", path: file.path, message: `contract lists ${file.path} more than once`, severity: "error" });
    }
    paths.add(file.path);
    for (const dep of file.dependsOn) {
      if (dep === file.path) {
        issues.push({ code: "self-dependency", path: file.path, message: `${file.path} depends on itself`, severity: "error" });
      } else if (!paths.has(dep) && !contract.files.some((candidate) => candidate.path === dep)) {
        issues.push({
          code: "unresolved-dependency",
          path: file.path,
          message: `${file.path} dependsOn ${dep}, which is not a declared file`,
          severity: "error",
        });
      }
    }
  }

  for (const required of REQUIRED_TANSTACK_CONTRACT_FILES) {
    if (!paths.has(required.path)) {
      issues.push({
        code: "missing-required-file",
        path: required.path,
        message: `TanStack Start contract must include ${required.path}`,
        severity: "error",
      });
    }
  }

  const forbidden = contract.files.filter((file) =>
    /^(index\.html|src\/main\.(t|j)sx|src\/App\.(t|j)sx)$/.test(file.path),
  );
  for (const file of forbidden) {
    issues.push({
      code: "forbidden-vite-entry",
      path: file.path,
      message: `${file.path} is not part of a TanStack Start app (the Start plugin owns the entry)`,
      severity: "error",
    });
  }

  const routeFiles = new Set<string>();
  for (const route of contract.routes) {
    if (!paths.has(route.file)) {
      issues.push({
        code: "route-file-missing",
        path: route.file,
        message: `route ${route.path} points at ${route.file}, which is not in the file list`,
        severity: "error",
      });
    }
    if (!/^src\/routes\//.test(route.file)) {
      issues.push({
        code: "route-not-under-routes",
        path: route.file,
        message: `route ${route.path} must live under src/routes/`,
        severity: "error",
      });
    }
    routeFiles.add(route.file);
  }
  if (!contract.routes.some((route) => route.path === "/" && route.file === "src/routes/index.tsx")) {
    issues.push({
      code: "missing-home-route",
      path: "src/routes/index.tsx",
      message: "contract must declare the home route / → src/routes/index.tsx",
      severity: "error",
    });
  }

  const scaffoldPackages = new Set([
    ...Object.keys(TANSTACK_START_DEPENDENCIES),
    ...Object.keys(TANSTACK_START_DEV_DEPENDENCIES),
    "react",
    "react-dom",
  ]);
  for (const pkg of contract.packages) {
    if (scaffoldPackages.has(pkg.name) || pkg.name.startsWith("@types/")) continue;
    const decision = resolveAllowedPackage(pkg.name);
    if (!decision.allowed) {
      issues.push({
        code: "disallowed-package",
        message: `package ${pkg.name} is not on the install allowlist`,
        severity: "error",
      });
    }
  }

  const { order, cycles } = topoSort(contract.files);
  for (const cycle of cycles) {
    issues.push({
      code: "dependency-cycle",
      message: `file dependency cycle: ${cycle.join(" → ")}`,
      severity: "error",
    });
  }

  return { issues, generationOrder: order };
}

export function buildFallbackProjectContract(prompt: string): ProjectContract {
  const intent = classifyBuildIntent(prompt);
  const packages = defaultPackages();
  return {
    version: PROJECT_CONTRACT_VERSION,
    framework: "tanstack-start",
    appType: intent.appType,
    files: REQUIRED_TANSTACK_CONTRACT_FILES.map((file) => ({
      ...file,
      exports: [...file.exports],
      dependsOn: [...file.dependsOn],
    })),
    routes: [{ path: "/", file: "src/routes/index.tsx" }],
    packages,
    acceptanceTests: DEFAULT_ACCEPTANCE.map((test) => ({ ...test })),
  };
}

function coerceRawContract(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.contract && typeof rec.contract === "object") return rec.contract as Record<string, unknown>;
  if (rec.sds && typeof rec.sds === "object") return rec.sds as Record<string, unknown>;
  return rec;
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("contract response was not valid JSON");
  }
}

export function parseProjectContract(
  raw: unknown,
  opts: { prompt?: string; fallback?: ProjectContract } = {},
): ParsedProjectContract {
  const fallback = opts.fallback ?? buildFallbackProjectContract(opts.prompt ?? "");
  const source = coerceRawContract(raw);
  const parsedFiles = parseFiles(source?.files ?? source?.repo_tree);
  const parsedRoutes = Array.isArray(source?.routes)
    ? (source!.routes as unknown[]).map((item) => {
        if (!item || typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        const file = normalizeGeneratedPath(String(rec.file ?? rec.routeFile ?? "")) ?? "";
        const path = normalizeRoutePath(String(rec.path ?? rec.url ?? ""));
        if (!file || !path) return null;
        return { path, file };
      }).filter((route): route is ProjectContractRoute => route !== null)
    : [];
  const parsedPackages = Array.isArray(source?.packages ?? source?.dependencies)
    ? ((source!.packages ?? source!.dependencies) as unknown[]).flatMap((item) => {
        if (typeof item === "string") return [{ name: item, dev: false } satisfies ProjectContractPackage];
        if (!item || typeof item !== "object") return [];
        const rec = item as Record<string, unknown>;
        const name = String(rec.name ?? "").trim();
        if (!name) return [];
        const pkg: ProjectContractPackage = { name, dev: rec.dev === true };
        if (rec.version != null) pkg.version = String(rec.version);
        return [pkg];
      })
    : [];
  const parsedTests = Array.isArray(source?.acceptanceTests ?? source?.acceptance_tests)
    ? ((source!.acceptanceTests ?? source!.acceptance_tests) as unknown[]).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const rec = item as Record<string, unknown>;
        const id = String(rec.id ?? "").trim();
        const kind = String(rec.kind ?? "");
        if (!id || !TEST_KINDS.has(kind as ProjectContractTestKind)) return [];
        const test: ProjectContractAcceptanceTest = {
          id,
          description: String(rec.description ?? id),
          kind: kind as ProjectContractTestKind,
        };
        if (rec.target != null) test.target = String(rec.target);
        return [test];
      })
    : [];

  const files = mergeFiles(fallback.files, parsedFiles);
  const routesByPath = new Map(fallback.routes.map((route) => [route.path, route]));
  for (const route of parsedRoutes) routesByPath.set(route.path, route);
  const packagesByName = new Map(fallback.packages.map((pkg) => [pkg.name, pkg]));
  for (const pkg of parsedPackages) packagesByName.set(pkg.name, pkg);
  const testsById = new Map(fallback.acceptanceTests.map((test) => [test.id, test]));
  for (const test of parsedTests) testsById.set(test.id, test);

  const contract: ProjectContract = {
    version: PROJECT_CONTRACT_VERSION,
    framework: "tanstack-start",
    appType: String(source?.appType ?? fallback.appType),
    files,
    routes: [...routesByPath.values()],
    packages: [...packagesByName.values()],
    acceptanceTests: [...testsById.values()],
  };
  const { issues, generationOrder } = collectIssues(contract);
  return { contract, issues, generationOrder };
}

export function generationOrderForContract(contract: ProjectContract): string[] {
  return collectIssues(contract).generationOrder;
}

export function readProjectContractFromFiles(
  files: Array<{ path: string; content: string }>,
  existingFiles: Array<{ path: string; content: string }> = [],
): ProjectContract | null {
  const found =
    files.find((file) => file.path === PROJECT_CONTRACT_PATH) ??
    existingFiles.find((file) => file.path === PROJECT_CONTRACT_PATH);
  if (!found?.content) return null;
  try {
    return parseProjectContract(JSON.parse(found.content)).contract;
  } catch {
    return null;
  }
}

export function contractHasErrors(parsed: ParsedProjectContract): boolean {
  return parsed.issues.some((issue) => issue.severity === "error");
}

export function ensureContractFile<T extends { path: string; content: string; language?: string }>(
  files: T[],
  contract: ProjectContract,
): T[] {
  const next = contractAsProjectFile(contract);
  const index = files.findIndex((file) => file.path === PROJECT_CONTRACT_PATH);
  const file = { ...(files[index] ?? { language: "json" }), ...next } as T;
  if (index >= 0) {
    const copy = files.slice();
    copy[index] = file;
    return copy;
  }
  return [...files, file];
}
