import { LOVABLE_VITE_DEPENDENCIES, LOVABLE_VITE_DEV_DEPENDENCIES } from "./lovable-vite-scaffold.ts";
import { TANSTACK_START_DEPENDENCIES, TANSTACK_START_DEV_DEPENDENCIES } from "./tanstack-start-scaffold.ts";
import { type BuildAppType, classifyBuildIntent, isAppShellAppType } from "../ai/build-intent.ts";

export type ControlledTemplateKey =
  | "static-browser"
  | "vite-site"
  | "vite-app"
  | "vite-operations"
  | "tanstack-site"
  | "tanstack-app"
  | "tanstack-operations"
  | "tanstack-crm"
  | "tanstack-erp";
export type ControlledModule = "auth" | "roles" | "audit" | "contacts" | "pipeline" | "inventory" | "orders" | "invoicing" | "dashboard";

export interface ControlledTemplate {
  key: ControlledTemplateKey;
  version: string;
  framework: "static" | "react" | "tanstack-start";
  modules: readonly ControlledModule[];
  requiredPaths: readonly string[];
  dependencies: Readonly<Record<string, string>>;
  devDependencies: Readonly<Record<string, string>>;
  cacheKey: string;
}

const VERSION = "2026.08.1";

/**
 * Module sets by product SHAPE, not by product name. A template's modules are
 * its acceptance contract — what the generated app must actually contain — so
 * a marketing site carries none and an operations tool carries the auth/roles/
 * audit trio without CRM's contacts and pipeline.
 */
const SITE_MODULES: readonly ControlledModule[] = [];
const APP_MODULES: readonly ControlledModule[] = ["dashboard"];
const OPS_MODULES: readonly ControlledModule[] = ["auth", "roles", "audit", "dashboard"];
const CRM_MODULES: readonly ControlledModule[] = ["auth", "roles", "audit", "contacts", "pipeline", "dashboard"];
const ERP_MODULES: readonly ControlledModule[] = ["auth", "roles", "audit", "inventory", "orders", "invoicing", "dashboard"];

const VITE_PATHS = ["package.json", "index.html", "src/main.tsx", "src/App.tsx"];
const TANSTACK_PATHS = ["package.json", "vite.config.ts", "src/router.tsx", "src/routes/__root.tsx", "src/routes/index.tsx"];
const MIGRATIONS = "supabase/migrations";

function make(
  key: ControlledTemplateKey,
  framework: ControlledTemplate["framework"],
  modules: readonly ControlledModule[],
  paths: readonly string[],
): ControlledTemplate {
  const tanstack = framework === "tanstack-start";
  return {
    key,
    version: VERSION,
    framework,
    modules,
    requiredPaths: paths,
    dependencies: framework === "static" ? {} : tanstack ? TANSTACK_START_DEPENDENCIES : LOVABLE_VITE_DEPENDENCIES,
    devDependencies: framework === "static" ? {} : tanstack ? TANSTACK_START_DEV_DEPENDENCIES : LOVABLE_VITE_DEV_DEPENDENCIES,
    cacheKey: `${key}:${VERSION}`,
  };
}

const STATIC = make("static-browser", "static", SITE_MODULES, ["index.html", "styles.css", "app.js"]);
const VITE_SITE = make("vite-site", "react", SITE_MODULES, VITE_PATHS);
const VITE = make("vite-app", "react", APP_MODULES, VITE_PATHS);
const VITE_OPS = make("vite-operations", "react", OPS_MODULES, [...VITE_PATHS, MIGRATIONS]);
const TANSTACK_SITE = make("tanstack-site", "tanstack-start", SITE_MODULES, TANSTACK_PATHS);
const TANSTACK_APP = make("tanstack-app", "tanstack-start", APP_MODULES, TANSTACK_PATHS);
const TANSTACK_OPS = make("tanstack-operations", "tanstack-start", OPS_MODULES, [...TANSTACK_PATHS, MIGRATIONS]);
const CRM = make("tanstack-crm", "tanstack-start", CRM_MODULES, [...TANSTACK_PATHS, MIGRATIONS]);
const ERP = make("tanstack-erp", "tanstack-start", ERP_MODULES, [...TANSTACK_PATHS, MIGRATIONS]);

export const CONTROLLED_TEMPLATES: Readonly<Record<ControlledTemplateKey, ControlledTemplate>> = {
  "static-browser": STATIC,
  "vite-site": VITE_SITE,
  "vite-app": VITE,
  "vite-operations": VITE_OPS,
  "tanstack-site": TANSTACK_SITE,
  "tanstack-app": TANSTACK_APP,
  "tanstack-operations": TANSTACK_OPS,
  "tanstack-crm": CRM,
  "tanstack-erp": ERP,
};

/** App types whose product IS a public site — no auth, no migrations, no shell. */
const MARKETING_APP_TYPES = new Set<BuildAppType>(["marketing-website", "portfolio", "blog"]);

/**
 * Pick the controlled template from the ALREADY-CLASSIFIED app type.
 *
 * This function used to re-classify the raw prompt with its own regexes, which
 * made it a SECOND, weaker classifier disagreeing with classifyBuildIntent()
 * — 31 carefully ordered app types against four patterns and a fallback. The
 * disagreements were not theoretical; measured against the classifier, every
 * non-CRM/ERP prompt was mis-templated:
 *
 *   "Website for a school"        classifier: marketing-website  template: CRM
 *   "portfolio for a photographer" classifier: portfolio         template: CRM
 *   "School management system"    classifier: school             template: CRM
 *   "Online store with inventory" classifier: ecommerce          template: ERP
 *
 * The `framework === "tanstack-start" -> CRM` fallback did most of that damage:
 * TanStack Start is the DEFAULT framework, so every generated app that was not
 * an ERP was handed CRM's contacts/pipeline acceptance contract and a Supabase
 * migrations requirement — a brochure site included.
 *
 * Framework is now decided FIRST, which also fixes a separate defect: the old
 * code returned the TanStack CRM/ERP template for a `react` project whenever
 * the prompt said "crm", and lockControlledDependencyVersions() adds missing
 * pins — so a Vite app had @tanstack/react-start written into its package.json.
 */
export function resolveControlledTemplate(
  appType: BuildAppType,
  framework: string,
): ControlledTemplate {
  if (framework === "static") return STATIC;
  const tanstack = framework === "tanstack" || framework === "tanstack-start";

  if (MARKETING_APP_TYPES.has(appType)) return tanstack ? TANSTACK_SITE : VITE_SITE;
  if (appType === "erp") return tanstack ? ERP : VITE_OPS;
  if (appType === "crm") return tanstack ? CRM : VITE_OPS;
  // Staff-only operational tools (POS, healthcare, HR, school, logistics…)
  // need auth/roles/audit and persistence, but NOT CRM's contacts+pipeline.
  if (isAppShellAppType(appType)) return tanstack ? TANSTACK_OPS : VITE_OPS;
  return tanstack ? TANSTACK_APP : VITE;
}

/**
 * Convenience for the call sites that hold a raw prompt rather than an intent.
 *
 * Deliberately the ONLY prompt-shaped entry point: it routes through
 * classifyBuildIntent() so this module can never grow a second opinion about
 * what the user asked for again.
 */
export function resolveControlledTemplateForPrompt(
  prompt: string,
  framework: string,
): ControlledTemplate {
  return resolveControlledTemplate(classifyBuildIntent(prompt).appType, framework);
}

export function controlledTemplateMetadata(template: ControlledTemplate) {
  return {
    controlled_template: template.key,
    template_version: template.version,
    template_cache_key: template.cacheKey,
    template_modules: [...template.modules],
  };
}

export function stampControlledTemplateFiles<T extends { path: string; content: string }>(files: T[], template: ControlledTemplate): T[] {
  return files.map((file) => {
    if (file.path !== "package.json") return file;
    try {
      const pkg = JSON.parse(file.content) as Record<string, unknown>;
      pkg.lifemark = { template: template.key, version: template.version, cacheKey: template.cacheKey };
      return { ...file, content: `${JSON.stringify(pkg, null, 2)}\n` };
    } catch { return file; }
  });
}

export function planControlledTemplateUpgrade(currentKey: string, currentVersion: string): { required: boolean; target: ControlledTemplate | null } {
  const target = CONTROLLED_TEMPLATES[currentKey as ControlledTemplateKey] ?? null;
  return { required: !!target && target.version !== currentVersion, target };
}

export function buildControlledTemplatePrompt(template: ControlledTemplate): string {
  return `\n\n---\n# Controlled Template Contract\nTemplate: ${template.key}@${template.version}\nModules: ${template.modules.join(", ") || "browser-only"}\nDependency policy: use the existing package manifest; do not change versions or introduce packages unless the requested feature cannot be implemented with the approved set.\nRequired architecture: ${template.requiredPaths.join(", ")}.\n${template.modules.includes("auth") ? "Authentication, role checks, auditability, persistent Supabase data, loading/empty/error states, and responsive tables are acceptance requirements for this template." : "This template is a public-facing surface: do NOT add authentication, an admin sidebar, or a database unless the request explicitly asks for one."}\n---`;
}

export interface TemplateCompatibility {
  compatible: boolean;
  missingPaths: string[];
  dependencyDrift: string[];
}

export function lockControlledDependencyVersions(content: string, template: ControlledTemplate): { content: string; changed: string[] } {
  try {
    const pkg = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const changed: string[] = [];
    for (const [section, pins] of [["dependencies", template.dependencies], ["devDependencies", template.devDependencies]] as const) {
      const current = pkg[section] ?? {};
      pkg[section] = current;
      for (const [name, pin] of Object.entries(pins)) {
        if (current[name] !== pin) {
          changed.push(`${name}: ${current[name] ?? "missing"} -> ${pin}`);
          current[name] = pin;
        }
      }
    }
    return changed.length ? { content: `${JSON.stringify(pkg, null, 2)}\n`, changed } : { content, changed };
  } catch { return { content, changed: [] }; }
}

export function checkTemplateCompatibility(
  template: ControlledTemplate,
  files: Array<{ path: string; content: string }>,
): TemplateCompatibility {
  const paths = new Set(files.map((file) => file.path.replace(/\\/g, "/")));
  const missingPaths = template.requiredPaths.filter((required) =>
    required === "supabase/migrations"
      ? !Array.from(paths).some((path) => path.startsWith("supabase/migrations/") && path.endsWith(".sql"))
      : !paths.has(required),
  );
  const dependencyDrift: string[] = [];
  const packageFile = files.find((file) => file.path === "package.json");
  if (packageFile) {
    try {
      const pkg = JSON.parse(packageFile.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      for (const [name, pin] of Object.entries(template.dependencies)) {
        const actual = pkg.dependencies?.[name];
        if (actual !== pin) dependencyDrift.push(`${name}: ${actual ?? "missing"} != ${pin}`);
      }
      for (const [name, pin] of Object.entries(template.devDependencies)) {
        const actual = pkg.devDependencies?.[name];
        if (actual !== pin) dependencyDrift.push(`${name}: ${actual ?? "missing"} != ${pin}`);
      }
    } catch { dependencyDrift.push("package.json is invalid JSON"); }
  }
  return { compatible: missingPaths.length === 0 && dependencyDrift.length === 0, missingPaths, dependencyDrift };
}
