import type { ParsedFile, ValidationError } from "./code-parser.ts";
import { scanProject } from "../security/scan.ts";

export type OrchestrationIntent =
  | "chat"
  | "plan"
  | "build"
  | "patch"
  | "design"
  | "backend"
  | "repair";

export type OrchestrationRisk = "low" | "medium" | "high" | "critical";

export interface EnterpriseOrchestrationState {
  version: 1;
  appKind: string;
  largeScope: boolean;
  completedCapabilities: string[];
  completedPhases: string[];
  lastPhase: string | null;
  lastSuccessfulAt: string | null;
  projectFingerprint: string;
  lastGateResults: Array<{ id: string; passed: boolean }>;
}

export interface ProjectIntelligenceIndex {
  paths: string[];
  routes: string[];
  components: string[];
  exports: string[];
  dependencies: string[];
  migrations: string[];
  designTokens: string[];
  capabilities: string[];
  controlledTemplate: string | null;
  hasAuth: boolean;
  hasRoles: boolean;
  hasTests: boolean;
}

export interface OrchestrationPhase {
  id: "foundation" | "vertical-slice" | "permissions" | "journey" | "iterate";
  label: string;
  objective: string;
  acceptance: string[];
}

export interface BuildOrchestration {
  intent: OrchestrationIntent;
  largeScope: boolean;
  appKind: string;
  currentPhase: OrchestrationPhase;
  maxChangedFiles: number;
  risk: OrchestrationRisk;
  requiredGates: string[];
  protectedPaths: string[];
  state: EnterpriseOrchestrationState;
  deferredCapabilities: string[];
  index: ProjectIntelligenceIndex;
  promptBlock: string;
}

export interface CompletionEvaluation {
  passed: boolean;
  errors: ValidationError[];
  checks: Array<{ id: string; passed: boolean; evidence: string }>;
}

export interface EnterpriseGateEvaluation {
  passed: boolean;
  errors: ValidationError[];
  gates: Array<{ id: string; passed: boolean; evidence: string[] }>;
}

const SOURCE = /\.(?:tsx?|jsx?)$/i;
const ROUTE_PATH = /(?:^|\/)(?:routes?|pages?)\//i;
const COMPONENT_PATH = /(?:^|\/)components?\//i;
const LARGE_DOMAIN = /\b(erp|crm|lms|marketplace|multi[- ]tenant|school management|hospital management|clinic management|inventory management|accounting system|hrms|supply chain)\b/i;
const BACKEND = /\b(database|schema|migration|supabase|postgres|authentication|authorization|storage|edge function|rls|row level security)\b/i;
const DESIGN = /\b(design|redesign|visual|theme|palette|typography|layout|responsive|animation|landing page|ui|ux)\b/i;
const REPAIR = /\b(fix|repair|debug|broken|error|failing|crash|doesn'?t work|not working)\b/i;
const PATCH = /\b(change|rename|replace|update|remove|add)\b/i;
const SECURITY_SENSITIVE = /\b(auth|login|password|permission|role|rls|row level security|payment|billing|secret|api key|webhook|tenant|organization|workspace|delete account|personal data|pii)\b/i;
const DESTRUCTIVE_CHANGE = /\b(delete|drop|truncate|remove all|replace everything|reset database|wipe|migration)\b/i;
export const ORCHESTRATION_POLICY_VERSION = 1 as const;

const CAPABILITY_MARKERS: Array<{ id: string; pattern: RegExp }> = [
  { id: "inventory", pattern: /\b(inventory|stock|warehouse|sku)\b/i },
  { id: "procurement", pattern: /\b(procurement|purchase order|supplier)\b/i },
  { id: "orders", pattern: /\b(sales order|order items?|order status)\b/i },
  { id: "invoicing", pattern: /\b(invoice|invoicing|accounts receivable)\b/i },
  { id: "contacts", pattern: /\b(contact|customer profile|address book)\b/i },
  { id: "pipeline", pattern: /\b(lead|opportunity|sales pipeline|deal stage)\b/i },
  { id: "courses", pattern: /\b(course|lesson|enrollment)\b/i },
  { id: "catalog", pattern: /\b(product|catalog|listing|storefront)\b/i },
  { id: "cart", pattern: /\b(cart|basket|cart item)\b/i },
  { id: "students", pattern: /\b(student|class section|enrollment)\b/i },
  { id: "attendance", pattern: /\b(attendance|present|absent)\b/i },
  { id: "patients", pattern: /\b(patient|medical record)\b/i },
  { id: "appointments", pattern: /\b(appointment|booking|schedule)\b/i },
];

function unique(values: string[], limit = 120): string[] {
  return [...new Set(values)].slice(0, limit);
}

function stableFingerprint(values: string[]): string {
  let hash = 0x811c9dc5;
  for (const char of values.sort().join("\n")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function importedPackages(content: string): string[] {
  const out: string[] = [];
  const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier || specifier.startsWith(".") || specifier.startsWith("@/")) continue;
    out.push(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]);
  }
  return out;
}

export function buildProjectIntelligenceIndex(files: Array<{ path: string; content: string }>): ProjectIntelligenceIndex {
  const normalized = files.map((file) => ({ ...file, path: file.path.replace(/\\/g, "/") }));
  const packageFile = normalized.find((file) => file.path === "package.json");
  let manifestDependencies: string[] = [];
  let controlledTemplate: string | null = null;
  try {
    const pkg = JSON.parse(packageFile?.content ?? "{}") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      lifemark?: { template?: unknown };
    };
    manifestDependencies = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    controlledTemplate = typeof pkg.lifemark?.template === "string" ? pkg.lifemark.template : null;
  } catch { /* validation reports malformed JSON separately */ }

  const source = normalized.filter((file) => SOURCE.test(file.path));
  const exports = source.flatMap((file) => {
    const names: string[] = [];
    for (const match of file.content.matchAll(/\bexport\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
      if (match[1]) names.push(`${file.path}#${match[1]}`);
    }
    if (/\bexport\s+default\b/.test(file.content)) names.push(`${file.path}#default`);
    return names;
  });

  const designTokens = normalized.flatMap((file) => {
    if (!/\.(?:css|scss|tsx?)$/i.test(file.path)) return [];
    const tokens: string[] = [];
    for (const match of file.content.matchAll(/--([a-z][\w-]*)\s*:/gi)) tokens.push(`--${match[1]}`);
    return tokens;
  });

  const allText = normalized.map((file) => file.content).join("\n");
  return {
    paths: unique(normalized.map((file) => file.path), 500),
    routes: unique(normalized.filter((file) => ROUTE_PATH.test(file.path)).map((file) => file.path)),
    components: unique(normalized.filter((file) => COMPONENT_PATH.test(file.path)).map((file) => file.path)),
    exports: unique(exports, 300),
    dependencies: unique([...manifestDependencies, ...source.flatMap((file) => importedPackages(file.content))], 200),
    migrations: unique(normalized.filter((file) => /^supabase\/migrations\/.*\.sql$/i.test(file.path)).map((file) => file.path)),
    designTokens: unique(designTokens, 80),
    capabilities: CAPABILITY_MARKERS.filter((marker) => marker.pattern.test(allText)).map((marker) => marker.id),
    controlledTemplate,
    hasAuth: /supabase\.auth|signInWith|signUp\(|auth\.getUser|protected route/i.test(allText),
    hasRoles: /\b(role|roles|permission|permissions|rbac)\b/i.test(allText),
    hasTests: normalized.some((file) => /\.(?:test|spec)\.(?:tsx?|jsx?)$/i.test(file.path)),
  };
}

function assessOrchestrationRisk(prompt: string, intent: OrchestrationIntent): OrchestrationRisk {
  if (SECURITY_SENSITIVE.test(prompt) && DESTRUCTIVE_CHANGE.test(prompt)) return "critical";
  if (SECURITY_SENSITIVE.test(prompt) || intent === "backend") return "high";
  if (DESTRUCTIVE_CHANGE.test(prompt) || intent === "repair" || intent === "build") return "medium";
  return "low";
}

function requiredGatesFor(risk: OrchestrationRisk, largeScope: boolean): string[] {
  const gates = ["structural-contract", "dependency-import-resolution", "typecheck-build", "preview-smoke", "completion-evaluation"];
  if (largeScope || risk === "high" || risk === "critical") gates.push("browser-journey");
  if (risk === "high" || risk === "critical") gates.push("permission-policy", "secret-scan");
  if (risk === "critical") gates.push("destructive-change-review", "rollback-ready");
  return gates;
}

function protectedPathsFor(risk: OrchestrationRisk): string[] {
  if (risk === "low") return [".env", ".env.local"];
  return [".env", ".env.local", "package-lock.json", "src/routeTree.gen.ts", "supabase/config.toml"];
}

export function parseEnterpriseOrchestrationState(value: unknown): EnterpriseOrchestrationState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== ORCHESTRATION_POLICY_VERSION || typeof raw.appKind !== "string") return null;
  return {
    version: ORCHESTRATION_POLICY_VERSION,
    appKind: raw.appKind,
    largeScope: raw.largeScope === true,
    completedCapabilities: Array.isArray(raw.completedCapabilities) ? raw.completedCapabilities.filter((item): item is string => typeof item === "string") : [],
    completedPhases: Array.isArray(raw.completedPhases) ? raw.completedPhases.filter((item): item is string => typeof item === "string") : [],
    lastPhase: typeof raw.lastPhase === "string" ? raw.lastPhase : null,
    lastSuccessfulAt: typeof raw.lastSuccessfulAt === "string" ? raw.lastSuccessfulAt : null,
    projectFingerprint: typeof raw.projectFingerprint === "string" ? raw.projectFingerprint : "",
    lastGateResults: Array.isArray(raw.lastGateResults)
      ? raw.lastGateResults.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string"
        ? [{ id: String((item as Record<string, unknown>).id), passed: (item as Record<string, unknown>).passed === true }]
        : [])
      : [],
  };
}

export function classifyOrchestrationIntent(
  prompt: string,
  requestedMode: string,
  existingFileCount: number,
): OrchestrationIntent {
  if (requestedMode === "plan") return "plan";
  if (requestedMode === "chat") return "chat";
  if (requestedMode === "patch") return "patch";
  if (REPAIR.test(prompt)) return "repair";
  if (BACKEND.test(prompt)) return "backend";
  if (DESIGN.test(prompt) && existingFileCount > 0) return "design";
  if (existingFileCount > 0 && PATCH.test(prompt) && prompt.length < 600) return "patch";
  return "build";
}

function inferAppKind(prompt: string, index: ProjectIntelligenceIndex): string {
  const kinds: Array<[RegExp, string]> = [
    [/\berp|inventory|warehouse|procurement|supply chain\b/i, "ERP"],
    [/\bcrm|sales pipeline|lead management\b/i, "CRM"],
    [/\blms|course platform|e-?learning\b/i, "LMS"],
    [/\bmarketplace|multi[- ]vendor\b/i, "marketplace"],
    [/\bschool management\b/i, "school management"],
    [/\bclinic|hospital|patient\b/i, "healthcare"],
    [/\be-?commerce|online store|storefront\b/i, "commerce"],
  ];
  const direct = kinds.find(([pattern]) => pattern.test(prompt))?.[1];
  if (direct) return direct;
  if (index.controlledTemplate === "tanstack-erp") return "ERP";
  if (index.controlledTemplate === "tanstack-crm") return "CRM";
  const capabilityText = index.capabilities.join(" ");
  if (/inventory|procurement|invoicing/.test(capabilityText)) return "ERP";
  if (/contacts|pipeline/.test(capabilityText)) return "CRM";
  if (/courses/.test(capabilityText)) return "LMS";
  if (/students|attendance/.test(capabilityText)) return "school management";
  if (/patients|appointments/.test(capabilityText)) return "healthcare";
  if (/catalog|cart/.test(capabilityText)) return "commerce";
  return "application";
}

type SliceDefinition = { capability: string; objective: string };

function sliceBacklog(appKind: string): SliceDefinition[] {
  switch (appKind) {
    case "ERP": return [
      { capability: "inventory", objective: "deliver inventory: list stock, create an item, adjust quantity, and persist the change" },
      { capability: "procurement", objective: "deliver procurement: manage suppliers, create a purchase order, and receive stock" },
      { capability: "orders", objective: "deliver sales orders: create an order, add line items, and track its status" },
      { capability: "invoicing", objective: "deliver invoicing: issue an invoice, record payment status, and view balances" },
    ];
    case "CRM": return [
      { capability: "contacts", objective: "deliver contacts: create, search, view, and update a customer" },
      { capability: "pipeline", objective: "deliver leads: create a lead and move it through a small sales pipeline" },
    ];
    case "LMS": return [{ capability: "courses", objective: "deliver courses and enrollment: create a course, list lessons, and enroll a learner" }];
    case "marketplace": return [{ capability: "catalog", objective: "deliver catalog discovery: create a listing, browse listings, and view listing details" }];
    case "school management": return [
      { capability: "students", objective: "deliver student enrollment: create a student, assign class/section, and view the roster" },
      { capability: "attendance", objective: "deliver daily attendance: mark a roster and review attendance history" },
    ];
    case "healthcare": return [
      { capability: "patients", objective: "deliver patient registration with role-protected records" },
      { capability: "appointments", objective: "deliver appointment scheduling and status management" },
    ];
    case "commerce": return [
      { capability: "catalog", objective: "deliver products: browse a catalog and open product details" },
      { capability: "cart", objective: "deliver cart: add products, update quantities, and preserve cart state" },
    ];
    default: return [{ capability: "primary-journey", objective: "deliver one complete primary user journey from entry to persisted outcome" }];
  }
}

function selectNextSlice(appKind: string, index: ProjectIntelligenceIndex): { selected: SliceDefinition; deferred: string[] } {
  const backlog = sliceBacklog(appKind);
  const selected = backlog.find((slice) => !index.capabilities.includes(slice.capability)) ?? backlog[backlog.length - 1];
  return {
    selected,
    deferred: backlog.filter((slice) => slice.capability !== selected.capability && !index.capabilities.includes(slice.capability)).map((slice) => slice.capability),
  };
}

function choosePhase(index: ProjectIntelligenceIndex, largeScope: boolean, appKind: string): OrchestrationPhase {
  const slice = selectNextSlice(appKind, index).selected;
  if (!largeScope) {
    return { id: "iterate", label: "Requested change", objective: "implement only the requested outcome", acceptance: ["requested behavior is reachable", "loading, empty, error and success states are handled", "existing behavior remains intact"] };
  }
  if (index.routes.length < 2 || index.components.length < 2) {
    return { id: "foundation", label: "Foundation plus first vertical slice", objective: `establish architecture, roles and a shared responsive shell, then ${slice.objective}`, acceptance: ["shared navigation and layout exist", "roles and access boundaries are explicit", "one complete feature uses real persisted data", "deferred modules are not represented by empty placeholder pages"] };
  }
  if (!index.hasAuth || !index.hasRoles) {
    return { id: "permissions", label: "Authentication and permissions", objective: "complete sign-in, protected routing, role checks and owner-scoped data policies for the current feature", acceptance: ["anonymous users cannot reach protected screens", "UI and backend enforce the same roles", "new tables have RLS policies"] };
  }
  if (!index.hasTests) {
    return { id: "journey", label: "Verify the first user journey", objective: `finish and test the existing ${appKind} vertical slice before adding another module`, acceptance: ["the main journey works from navigation to saved result", "failure and empty states are visible", "a focused test covers the critical behavior"] };
  }
  return { id: "vertical-slice", label: "Next vertical slice", objective: slice.objective, acceptance: ["feature is reachable from the shared shell", "data model, permissions and UI ship together", "the full journey is testable"] };
}

export function createBuildOrchestration(options: {
  prompt: string;
  requestedMode: string;
  files: Array<{ path: string; content: string }>;
  previousState?: EnterpriseOrchestrationState | null;
}): BuildOrchestration {
  const index = buildProjectIntelligenceIndex(options.files);
  const intent = classifyOrchestrationIntent(options.prompt, options.requestedMode, options.files.length);
  const inferredAppKind = inferAppKind(options.prompt, index);
  const appKind = inferredAppKind === "application" && options.previousState?.appKind
    ? options.previousState.appKind
    : inferredAppKind;
  const explicitInventory = options.prompt.match(/\b(\d{2,})\s*(?:\+\s*)?(?:modules?|features?|pages?|screens?|subsystems?)\b/i);
  const largeScope = LARGE_DOMAIN.test(options.prompt) || Number(explicitInventory?.[1] ?? 0) >= 10 ||
    index.controlledTemplate === "tanstack-erp" || index.controlledTemplate === "tanstack-crm" ||
    options.previousState?.largeScope === true;
  const currentPhase = choosePhase(index, largeScope, appKind);
  const deferredCapabilities = largeScope ? selectNextSlice(appKind, index).deferred : [];
  const maxChangedFiles = largeScope
    ? currentPhase.id === "foundation" ? 36 : 24
    : intent === "patch" || intent === "design" || intent === "repair" ? 8 : 24;
  const risk = assessOrchestrationRisk(options.prompt, intent);
  const requiredGates = requiredGatesFor(risk, largeScope);
  const protectedPaths = protectedPathsFor(risk);
  const state: EnterpriseOrchestrationState = {
    version: ORCHESTRATION_POLICY_VERSION,
    appKind,
    largeScope,
    completedCapabilities: unique([...(options.previousState?.completedCapabilities ?? []), ...index.capabilities]),
    completedPhases: unique(options.previousState?.completedPhases ?? []),
    lastPhase: options.previousState?.lastPhase ?? null,
    lastSuccessfulAt: options.previousState?.lastSuccessfulAt ?? null,
    projectFingerprint: stableFingerprint(index.paths.map((path) => `${path}:${options.files.find((file) => file.path.replace(/\\/g, "/") === path)?.content.length ?? 0}`)),
    lastGateResults: options.previousState?.lastGateResults ?? [],
  };

  const promptBlock = `\n\n---\n# LifeMarkAI Orchestration Contract
Intent: ${intent}
Application kind: ${appKind}
Scope policy: ${largeScope ? "PHASED LARGE BUILD" : "FOCUSED CHANGE"}
Risk: ${risk.toUpperCase()}
Current phase: ${currentPhase.label}
Objective: ${currentPhase.objective}
Change budget: at most ${maxChangedFiles} files in this turn.

Acceptance criteria:
${currentPhase.acceptance.map((item) => `- ${item}`).join("\n")}
${deferredCapabilities.length ? `\nExplicitly deferred (do not create placeholder pages): ${deferredCapabilities.join(", ")}.` : ""}

Project intelligence index:
- Routes: ${index.routes.slice(0, 24).join(", ") || "none yet"}
- Components: ${index.components.slice(0, 24).join(", ") || "none yet"}
- Dependencies: ${index.dependencies.slice(0, 30).join(", ") || "none"}
- Migrations: ${index.migrations.slice(0, 12).join(", ") || "none"}
- Completed capabilities: ${index.capabilities.join(", ") || "none detected"}
- Auth: ${index.hasAuth ? "present" : "missing"}; roles: ${index.hasRoles ? "present" : "missing"}; tests: ${index.hasTests ? "present" : "missing"}

Execution rules:
1. Work only on this phase and stay within the change budget. Never simulate completeness with empty modules, dead navigation, fake exports, or placeholder dashboards.
2. Reuse indexed files and installed dependencies. Do not invent imports, exports, packages, routes, tables, or environment variables.
3. Return one structured JSON object with complete file operations. Every changed file needs an explicit project-relative path and complete content; use the existing parser contract exactly.
4. For backend work, ship schema, RLS/permissions, client integration, loading/error states, and UI together.
5. Preserve unrelated files. A large specification is a roadmap, not permission to generate every module in one response.
6. Before returning, check imports/exports, route reachability, JSX extensions, dependency declarations, responsive behavior, and every acceptance criterion above.
7. Required verification gates: ${requiredGates.join(", ")}.
8. Protected paths must not be generated or rewritten unless the request explicitly requires it: ${protectedPaths.join(", ")}.
9. Enterprise data rules: tenant-owned records require tenant isolation, privileged actions require server-side authorization, schema changes require RLS, and material mutations require an audit trail.
---`;

  return { intent, largeScope, appKind, currentPhase, maxChangedFiles, risk, requiredGates, protectedPaths, state, deferredCapabilities, index, promptBlock };
}

export function completeEnterpriseOrchestrationState(
  orchestration: BuildOrchestration,
  committedFiles: Array<{ path: string; content: string }>,
  completedAt: string,
  gateResults: Array<{ id: string; passed: boolean }> = [],
): EnterpriseOrchestrationState {
  const nextIndex = buildProjectIntelligenceIndex(committedFiles);
  return {
    ...orchestration.state,
    completedCapabilities: unique([...orchestration.state.completedCapabilities, ...nextIndex.capabilities]),
    completedPhases: unique([...orchestration.state.completedPhases, orchestration.currentPhase.id]),
    lastPhase: orchestration.currentPhase.id,
    lastSuccessfulAt: completedAt,
    projectFingerprint: stableFingerprint(nextIndex.paths.map((path) => `${path}:${committedFiles.find((file) => file.path.replace(/\\/g, "/") === path)?.content.length ?? 0}`)),
    lastGateResults: gateResults,
  };
}

export function evaluateBuildCompletion(options: {
  orchestration: BuildOrchestration;
  files: ParsedFile[];
  changedFiles?: ParsedFile[];
}): CompletionEvaluation {
  const index = buildProjectIntelligenceIndex(options.files);
  const changedFiles = options.changedFiles ?? options.files;
  const checks: CompletionEvaluation["checks"] = [];
  const add = (id: string, passed: boolean, evidence: string) => checks.push({ id, passed, evidence });

  add("files", options.files.length > 0, `${options.files.length} changed file(s)`);
  add("change-budget", changedFiles.length <= options.orchestration.maxChangedFiles, `${changedFiles.length}/${options.orchestration.maxChangedFiles} changed files`);
  add("protected-paths", !changedFiles.some((file) => options.orchestration.protectedPaths.includes(file.path)), "protected infrastructure files unchanged");
  add("reachable-ui", index.routes.length > 0 || options.files.some((file) => /<(?:main|form|button|nav)\b/i.test(file.content)), `${index.routes.length} route file(s)`);
  add("no-placeholder-modules", !changedFiles.some((file) => /(?:coming soon|todo:\s*implement|placeholder page|lorem ipsum)/i.test(file.content)), "no new placeholder modules");

  if (options.orchestration.largeScope && options.orchestration.currentPhase.id === "foundation") {
    add("shared-shell", options.files.some((file) => /(?:sidebar|navigation|<nav\b|appShell|dashboardLayout)/i.test(file.content)), "shared navigation/layout marker");
    add("vertical-feature", options.files.some((file) => /(?:insert\(|upsert\(|\.from\(|createServerFn|<form\b|onSubmit)/i.test(file.content)), "interactive or persisted feature marker");
  }
  if (options.orchestration.currentPhase.id === "permissions") {
    add("authentication", index.hasAuth, "authentication implementation");
    add("roles", index.hasRoles, "role/permission implementation");
  }

  const errors: ValidationError[] = checks
    .filter((check) => !check.passed)
    .map((check) => ({
      type: `completion_${check.id}`,
      severity: "error" as const,
      message: `Completion criterion failed: ${check.id} (${check.evidence}).`,
    }));
  return { passed: errors.length === 0, errors, checks };
}

function createdTables(sql: string): string[] {
  return unique(Array.from(sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z][\w]*)/gi), (match) => match[1]).filter(Boolean));
}

function hasRlsForTable(sql: string, table: string): boolean {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`alter\\s+table\\s+(?:public\\.)?["']?${escaped}["']?\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql) &&
    new RegExp(`create\\s+policy[\\s\\S]{0,500}\\bon\\s+(?:public\\.)?["']?${escaped}["']?`, "i").test(sql);
}

/** Execute the deterministic enterprise-only gates before commit. */
export function evaluateEnterpriseGates(options: {
  orchestration: BuildOrchestration;
  candidateFiles: ParsedFile[];
  changedFiles: ParsedFile[];
}): EnterpriseGateEvaluation {
  const gates: EnterpriseGateEvaluation["gates"] = [];
  const add = (id: string, passed: boolean, evidence: string[]) => gates.push({ id, passed, evidence });

  if (options.orchestration.requiredGates.includes("secret-scan")) {
    const scan = scanProject(options.changedFiles);
    const blocking = scan.findings.filter((finding) =>
      (finding.kind === "secret" || finding.kind === "risky") &&
      (finding.severity === "critical" || finding.severity === "high"),
    );
    add("secret-scan", blocking.length === 0, blocking.map((finding) => `${finding.file}:${finding.line} ${finding.title}`));
  }

  const changedMigrations = options.changedFiles.filter((file) => /^supabase\/migrations\/.*\.sql$/i.test(file.path));
  if (options.orchestration.requiredGates.includes("permission-policy") && changedMigrations.length > 0) {
    const missing: string[] = [];
    for (const migration of changedMigrations) {
      for (const table of createdTables(migration.content)) {
        if (!hasRlsForTable(migration.content, table)) missing.push(`${migration.path}: ${table}`);
      }
    }
    add("permission-policy", missing.length === 0, missing.length ? missing.map((item) => `missing RLS policy for ${item}`) : ["all newly created tables enable RLS and define a policy"]);
  }

  if (options.orchestration.largeScope && changedMigrations.length > 0) {
    const sql = changedMigrations.map((file) => file.content).join("\n");
    const tables = createdTables(sql);
    const needsTenantKey = tables.length > 0 && !tables.every((table) => /^(audit_logs?|roles?|permissions?|profiles?)$/i.test(table));
    const hasTenantKey = /\b(tenant_id|organization_id|workspace_id|company_id)\b/i.test(sql);
    add("tenant-isolation", !needsTenantKey || hasTenantKey, needsTenantKey && !hasTenantKey ? ["new business tables do not declare a tenant/company/workspace ownership key"] : ["tenant ownership key present or only global identity/audit tables created"]);
  }

  if ((options.orchestration.largeScope || options.orchestration.risk === "high" || options.orchestration.risk === "critical") &&
      options.changedFiles.some((file) => /\b(insert|update|delete|upsert)\s*\(|\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i.test(file.content))) {
    const candidateText = options.candidateFiles.map((file) => `${file.path}\n${file.content}`).join("\n");
    const auditable = /\b(audit_logs?|logAuditEvent|audit_event|activity_log)\b/i.test(candidateText);
    add("auditability", auditable, auditable ? ["audit trail implementation detected"] : ["material mutations exist without an audit trail"]);
  }

  if (options.orchestration.requiredGates.includes("destructive-change-review")) {
    const destructive = options.changedFiles.filter((file) => /\b(drop\s+(?:table|column)|truncate\s+table|delete\s+from\s+\w+\s*;)/i.test(file.content));
    const withoutRollback = destructive.filter((file) => !/(--\s*rollback:|begin\s*;[\s\S]*commit\s*;|create\s+table[\s\S]*as\s+select)/i.test(file.content));
    add("destructive-change-review", withoutRollback.length === 0, withoutRollback.map((file) => `${file.path}: destructive SQL has no rollback/transaction evidence`));
  }

  const errors = gates
    .filter((gate) => !gate.passed)
    .map((gate) => ({
      type: `enterprise_${gate.id}`,
      severity: "error" as const,
      message: `Enterprise gate failed: ${gate.id}. ${gate.evidence.join(" | ")}`,
    }));
  return { passed: errors.length === 0, errors, gates };
}

export const VERIFICATION_LADDER = [
  "normalize",
  "structural-contract",
  "dependency-import-resolution",
  "typecheck-build",
  "preview-smoke",
  "browser-journey",
  "completion-evaluation",
] as const;
