import { LOVABLE_VITE_DEPENDENCIES, LOVABLE_VITE_DEV_DEPENDENCIES } from "./lovable-vite-scaffold.ts";
import { TANSTACK_START_DEPENDENCIES, TANSTACK_START_DEV_DEPENDENCIES } from "./tanstack-start-scaffold.ts";

export type ControlledTemplateKey = "static-browser" | "vite-app" | "tanstack-crm" | "tanstack-erp";
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
const STATIC: ControlledTemplate = {
  key: "static-browser", version: VERSION, framework: "static", modules: [],
  requiredPaths: ["index.html", "styles.css", "app.js"], dependencies: {}, devDependencies: {},
  cacheKey: `static-browser:${VERSION}`,
};
const VITE: ControlledTemplate = {
  key: "vite-app", version: VERSION, framework: "react", modules: ["dashboard"],
  requiredPaths: ["package.json", "index.html", "src/main.tsx", "src/App.tsx"],
  dependencies: LOVABLE_VITE_DEPENDENCIES, devDependencies: LOVABLE_VITE_DEV_DEPENDENCIES,
  cacheKey: `vite-app:${VERSION}`,
};
const CRM: ControlledTemplate = {
  key: "tanstack-crm", version: VERSION, framework: "tanstack-start",
  modules: ["auth", "roles", "audit", "contacts", "pipeline", "dashboard"],
  requiredPaths: ["package.json", "vite.config.ts", "src/router.tsx", "src/routes/__root.tsx", "src/routes/index.tsx", "supabase/migrations"],
  dependencies: TANSTACK_START_DEPENDENCIES, devDependencies: TANSTACK_START_DEV_DEPENDENCIES,
  cacheKey: `tanstack-crm:${VERSION}`,
};
const ERP: ControlledTemplate = {
  key: "tanstack-erp", version: VERSION, framework: "tanstack-start",
  modules: ["auth", "roles", "audit", "inventory", "orders", "invoicing", "dashboard"],
  requiredPaths: ["package.json", "vite.config.ts", "src/router.tsx", "src/routes/__root.tsx", "src/routes/index.tsx", "supabase/migrations"],
  dependencies: TANSTACK_START_DEPENDENCIES, devDependencies: TANSTACK_START_DEV_DEPENDENCIES,
  cacheKey: `tanstack-erp:${VERSION}`,
};

export const CONTROLLED_TEMPLATES: Readonly<Record<ControlledTemplateKey, ControlledTemplate>> = {
  "static-browser": STATIC, "vite-app": VITE, "tanstack-crm": CRM, "tanstack-erp": ERP,
};

export function resolveControlledTemplate(prompt: string, framework: string): ControlledTemplate {
  if (/\b(erp|inventory|warehouse|purchase orders?|invoic(?:e|ing)|accounting)\b/i.test(prompt)) return ERP;
  if (/\b(crm|customer relationship|leads?|sales pipeline|contacts?)\b/i.test(prompt)) return CRM;
  if (framework === "static") return STATIC;
  if (framework === "tanstack" || framework === "tanstack-start") return CRM;
  return VITE;
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
  return `\n\n---\n# Controlled Template Contract\nTemplate: ${template.key}@${template.version}\nModules: ${template.modules.join(", ") || "browser-only"}\nDependency policy: use the existing package manifest; do not change versions or introduce packages unless the requested feature cannot be implemented with the approved set.\nRequired architecture: ${template.requiredPaths.join(", ")}.\nFor CRM/ERP, authentication, role checks, auditability, persistent Supabase data, loading/empty/error states, and responsive tables are acceptance requirements.\n---`;
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
      const current = pkg[section];
      if (!current) continue;
      for (const [name, pin] of Object.entries(pins)) {
        if (name in current && current[name] !== pin) {
          changed.push(`${name}: ${current[name]} -> ${pin}`);
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
        if (actual !== undefined && actual !== pin) dependencyDrift.push(`${name}: ${actual} != ${pin}`);
      }
      for (const [name, pin] of Object.entries(template.devDependencies)) {
        const actual = pkg.devDependencies?.[name];
        if (actual !== undefined && actual !== pin) dependencyDrift.push(`${name}: ${actual} != ${pin}`);
      }
    } catch { dependencyDrift.push("package.json is invalid JSON"); }
  }
  return { compatible: missingPaths.length === 0 && dependencyDrift.length === 0, missingPaths, dependencyDrift };
}
