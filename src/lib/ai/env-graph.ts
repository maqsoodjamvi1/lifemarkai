/**
 * Two-layer executability graph (EnvGraph).
 *
 * External dependencies and internal repository references fail independently.
 * Classifying which layer is misaligned — before a repair model sees the logs —
 * is what stops undifferentiated "here are the errors, fix them" prompts from
 * rewriting the wrong files.
 */
import type { ProjectContract } from "./project-contract.ts";
import { classifyFailureFamily, type FailureFamily } from "./failure-cluster.ts";

export type PreviewFailureLayer =
  | "dependency"
  | "internal-reference"
  | "build"
  | "boot"
  | "browser-runtime";

export interface RuntimeRequirementNode {
  kind: "package" | "engine" | "env";
  name: string;
  version?: string;
}

export interface InternalReferenceNode {
  path: string;
  exports: string[];
  imports: string[];
  route?: string;
}

export interface EnvGraph {
  runtime: RuntimeRequirementNode[];
  internal: InternalReferenceNode[];
}

const FAMILY_LAYER: Record<FailureFamily, PreviewFailureLayer> = {
  "undeclared-package": "dependency",
  "invalid-package": "dependency",
  "missing-export": "internal-reference",
  "fabricated-import": "internal-reference",
  "undeclared-file": "internal-reference",
  "missing-file": "internal-reference",
  "missing-route": "internal-reference",
  "undeclared-edge": "internal-reference",
  "preview-timeout": "boot",
  typecheck: "build",
  build: "build",
  adherence: "internal-reference",
  safety: "dependency",
  other: "browser-runtime",
};

const IMPORT_RE =
  /(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;
const EXPORT_RE =
  /export\s+(?:default\s+(?:function|class|const|let|async)?\s*|async\s+function\s+|function\s+|class\s+|const\s+|let\s+|type\s+|enum\s+|interface\s+)([A-Za-z_$][\w$]*)|export\s+default\b/g;
const ENV_RE = /(?:import\.meta\.env|process\.env)\.([A-Z][A-Z0-9_]+)/g;

export function buildEnvGraph(
  files: Array<{ path: string; content?: string | null }>,
  contract?: ProjectContract | null,
): EnvGraph {
  const byPath = new Map(files.map((file) => [file.path.replace(/\\/g, "/"), file]));
  const runtime: RuntimeRequirementNode[] = [];
  const internal: InternalReferenceNode[] = [];

  const manifest = byPath.get("package.json")?.content;
  if (manifest) {
    try {
      const pkg = JSON.parse(manifest) as {
        engines?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
        runtime.push({ kind: "package", name, version });
      }
      for (const [name, version] of Object.entries(pkg.engines ?? {})) {
        runtime.push({ kind: "engine", name, version });
      }
    } catch {
      /* malformed manifests are a build-layer problem, not a graph problem */
    }
  }

  const envNames = new Set<string>();
  for (const file of files) {
    const content = file.content ?? "";
    ENV_RE.lastIndex = 0;
    for (const match of content.matchAll(ENV_RE)) envNames.add(match[1]);
  }
  if (contract) {
    for (const pkg of contract.packages) {
      if (!runtime.some((node) => node.kind === "package" && node.name === pkg.name)) {
        runtime.push({ kind: "package", name: pkg.name, version: pkg.version });
      }
    }
  }
  for (const name of envNames) runtime.push({ kind: "env", name });

  const contractByPath = new Map((contract?.files ?? []).map((file) => [file.path, file]));
  const routeByFile = new Map((contract?.routes ?? []).map((route) => [route.file, route.path]));

  for (const file of files) {
    const path = file.path.replace(/\\/g, "/");
    if (!/\.(tsx|ts|jsx|js|mjs)$/.test(path)) continue;
    const content = file.content ?? "";
    const imports: string[] = [];
    IMPORT_RE.lastIndex = 0;
    for (const match of content.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (spec) imports.push(spec);
    }
    const exports: string[] = [];
    EXPORT_RE.lastIndex = 0;
    for (const match of content.matchAll(EXPORT_RE)) {
      if (match[1]) exports.push(match[1]);
      else if (/export\s+default\b/.test(match[0])) exports.push("default");
    }
    const planned = contractByPath.get(path);
    for (const item of planned?.exports ?? []) {
      if (!exports.includes(item.name)) exports.push(item.name);
    }
    internal.push({
      path,
      exports,
      imports: planned?.dependsOn?.length ? [...imports, ...planned.dependsOn] : imports,
      route: routeByFile.get(path),
    });
  }

  return { runtime, internal };
}

export function classifyPreviewFailureLayer(
  errors: Array<{ type?: string; message: string }>,
): PreviewFailureLayer {
  if (errors.length === 0) return "browser-runtime";
  const votes: Record<PreviewFailureLayer, number> = {
    dependency: 0,
    "internal-reference": 0,
    build: 0,
    boot: 0,
    "browser-runtime": 0,
  };
  for (const error of errors) {
    votes[layerForError(error)] += 1;
  }
  return (Object.entries(votes) as Array<[PreviewFailureLayer, number]>)
    .sort((a, b) => b[1] - a[1])[0][0];
}

export function layerForError(error: { type?: string; message: string }): PreviewFailureLayer {
  const message = error.message.toLowerCase();
  if (
    /cannot find module|not on the install allowlist|npm install|eresolve|enotfound|env(?:ironment)? variable|import\.meta\.env|process\.env/.test(
      message,
    )
  ) {
    return "dependency";
  }
  if (
    /econnrefused|preview timed out|etimedout|server (?:failed|did not)|health check|bad gateway|connection refused/.test(
      message,
    )
  ) {
    return "boot";
  }
  if (
    /uncaught|pageerror|console error|blank (?:page|screen)|no visible content|#root has no children|failed to fetch|playwright/.test(
      message,
    )
  ) {
    return "browser-runtime";
  }
  if (/vite build|production build|failed to compile|esbuild|tsc --noemit|ts\d{4}|typecheck/.test(message)) {
    return "build";
  }
  return FAMILY_LAYER[classifyFailureFamily(error)];
}

export function targetedRepairHint(layer: PreviewFailureLayer): string {
  switch (layer) {
    case "dependency":
      return "Failure layer: dependency (external packages/runtime/env). Change package.json, env references, or install-time imports only.";
    case "internal-reference":
      return "Failure layer: internal reference. Fix local imports, exports, or routes only — do not churn unrelated files.";
    case "build":
      return "Failure layer: build. Fix TypeScript/Vite production-build errors only.";
    case "boot":
      return "Failure layer: boot. Fix server start, health-check, or preview-timeout failures only.";
    case "browser-runtime":
      return "Failure layer: browser-runtime. Fix page-load, console, or empty-root failures only.";
  }
}

export function layerAlignsWithGraph(layer: PreviewFailureLayer, graph: EnvGraph, error: string): boolean {
  const lower = error.toLowerCase();
  if (layer === "dependency") {
    return graph.runtime.some((node) => lower.includes(node.name.toLowerCase()));
  }
  if (layer === "internal-reference") {
    return graph.internal.some(
      (node) =>
        lower.includes(node.path.toLowerCase()) ||
        node.exports.some((name) => lower.includes(name.toLowerCase())),
    );
  }
  return true;
}
