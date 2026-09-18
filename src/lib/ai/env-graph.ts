export type RepairFailureLayer =
  | "dependency"
  | "internal-reference"
  | "build"
  | "boot"
  | "browser-runtime";

export type GraphFile = { path: string; content?: string | null };

export interface EnvironmentGraph {
  dependencies: Set<string>;
  scripts: Map<string, string>;
  environment: Set<string>;
  imports: Map<string, Set<string>>;
  exports: Map<string, Set<string>>;
  routes: Set<string>;
}

export interface FailureClassification {
  layer: RepairFailureLayer;
  reasons: string[];
  relevantFiles: string[];
}

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/i;
const IMPORT_RE = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;
const EXPORT_RE = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)?\s*([A-Za-z_$][\w$]*)?/g;
const ENV_RE = /(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g;

export function buildEnvironmentGraph(files: GraphFile[]): EnvironmentGraph {
  const graph: EnvironmentGraph = {
    dependencies: new Set(), scripts: new Map(), environment: new Set(),
    imports: new Map(), exports: new Map(), routes: new Set(),
  };
  for (const file of files) {
    const content = file.content ?? "";
    if (file.path.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(content) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; scripts?: Record<string, unknown> };
        for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) graph.dependencies.add(name);
        for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
          if (typeof command === "string") graph.scripts.set(name, command);
        }
      } catch { /* malformed manifests are classified from execution errors */ }
    }
    for (const match of content.matchAll(ENV_RE)) if (match[1]) graph.environment.add(match[1]);
    if (!SOURCE_EXT.test(file.path)) continue;
    const imports = new Set<string>();
    for (const match of content.matchAll(IMPORT_RE)) imports.add(match[1] ?? match[2] ?? match[3]);
    graph.imports.set(file.path, imports);
    const exports = new Set<string>();
    for (const match of content.matchAll(EXPORT_RE)) exports.add(match[1] || "default");
    graph.exports.set(file.path, exports);
    if (/(?:^|\/)(?:routes?|pages?|app)\//i.test(file.path)) graph.routes.add(file.path);
  }
  return graph;
}

const RULES: Array<{ layer: RepairFailureLayer; pattern: RegExp }> = [
  { layer: "dependency", pattern: /(?:npm|pnpm|yarn|package(?:\.json)?|dependency|peer dep|eresolve|lockfile|not found in registry|could not resolve package)/i },
  { layer: "internal-reference", pattern: /(?:cannot find module ['"](?:\.|@\/)|failed to resolve import|does not provide an export|has no exported member|route not found|unresolved local import)/i },
  { layer: "boot", pattern: /(?:eaddrinuse|server (?:failed|did not|won't)|connection refused|health ?check|listen|startup|timed out waiting|no port)/i },
  { layer: "browser-runtime", pattern: /(?:uncaught|unhandled|pageerror|hydration|blank (?:page|screen|root)|failed to fetch|browser|console error|is not a function|cannot read propert)/i },
  { layer: "build", pattern: /(?:build failed|type(?:script)? error|syntaxerror|parse error|ts\d{3,5}|vite|webpack|rollup|esbuild)/i },
];

export function classifyRepairFailure(errors: string[], graph?: EnvironmentGraph): FailureClassification {
  const joined = errors.join("\n");
  const matched = RULES.find((rule) => rule.pattern.test(joined));
  const layer = matched?.layer ?? "build";
  const mentioned = new Set<string>();
  for (const path of [...(graph?.imports.keys() ?? []), ...(graph?.routes ?? [])]) {
    if (joined.includes(path) || joined.includes(path.replace(/^src\//, "@/"))) mentioned.add(path);
  }
  return {
    layer,
    reasons: matched ? [`Execution evidence matched the ${layer} failure class.`] : ["No narrower execution signature matched; treating the failure as build-time."],
    relevantFiles: [...mentioned],
  };
}
