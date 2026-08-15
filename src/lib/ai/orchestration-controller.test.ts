import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProjectIntelligenceIndex,
  classifyOrchestrationIntent,
  completeEnterpriseOrchestrationState,
  createBuildOrchestration,
  evaluateBuildCompletion,
  evaluateEnterpriseGates,
  parseEnterpriseOrchestrationState,
  VERIFICATION_LADDER,
} from "./orchestration-controller.ts";

test("project intelligence indexes routes, components, exports, dependencies, schema and design tokens", () => {
  const index = buildProjectIntelligenceIndex([
    { path: "package.json", content: JSON.stringify({ dependencies: { react: "19.0.0" } }) },
    { path: "src/routes/index.tsx", content: 'import { Button } from "@/components/Button"; export function Home(){ return <Button /> }' },
    { path: "src/components/Button.tsx", content: "export default function Button(){ return <button /> }" },
    { path: "src/styles.css", content: ":root { --brand-primary: blue; }" },
    { path: "supabase/migrations/001_items.sql", content: "create table items(id uuid);" },
  ]);

  assert.deepEqual(index.routes, ["src/routes/index.tsx"]);
  assert.deepEqual(index.components, ["src/components/Button.tsx"]);
  assert(index.exports.includes("src/routes/index.tsx#Home"));
  assert(index.exports.includes("src/components/Button.tsx#default"));
  assert(index.dependencies.includes("react"));
  assert.deepEqual(index.migrations, ["supabase/migrations/001_items.sql"]);
  assert(index.designTokens.includes("--brand-primary"));
});

test("intent controller distinguishes repair, backend, design and focused patch work", () => {
  assert.equal(classifyOrchestrationIntent("fix the broken checkout", "build", 12), "repair");
  assert.equal(classifyOrchestrationIntent("add a database migration with RLS", "build", 12), "backend");
  assert.equal(classifyOrchestrationIntent("redesign the dashboard", "build", 12), "design");
  assert.equal(classifyOrchestrationIntent("rename the hero button", "build", 12), "patch");
  assert.equal(classifyOrchestrationIntent("create an inventory app", "build", 0), "build");
});

test("large ERP requests become a foundation plus one vertical slice", () => {
  const orchestration = createBuildOrchestration({
    prompt: "Build a complete ERP with inventory, procurement, orders, invoicing, accounting and reports",
    requestedMode: "build",
    files: [],
  });

  assert.equal(orchestration.largeScope, true);
  assert.equal(orchestration.appKind, "ERP");
  assert.equal(orchestration.currentPhase.id, "foundation");
  assert.match(orchestration.currentPhase.objective, /inventory/i);
  assert(orchestration.deferredCapabilities.includes("procurement"));
  assert.match(orchestration.promptBlock, /do not create placeholder pages/i);
  assert.match(orchestration.promptBlock, /roadmap, not permission/i);
});

test("an established large app advances to permissions before adding modules", () => {
  const orchestration = createBuildOrchestration({
    prompt: "Continue the ERP implementation",
    requestedMode: "build",
    files: [
      { path: "src/routes/index.tsx", content: "export default function Home(){ return <main /> }" },
      { path: "src/routes/items.tsx", content: "export default function Items(){ return <form /> }" },
      { path: "src/components/AppShell.tsx", content: "export function AppShell(){ return <nav /> }" },
      { path: "src/components/ItemForm.tsx", content: "export function ItemForm(){ return <form /> }" },
    ],
  });
  assert.equal(orchestration.currentPhase.id, "permissions");
});

test("a short continue prompt retains ERP scope and chooses the next unfinished slice", () => {
  const orchestration = createBuildOrchestration({
    prompt: "continue with the next feature",
    requestedMode: "build",
    files: [
      { path: "package.json", content: JSON.stringify({ lifemark: { template: "tanstack-erp" } }) },
      { path: "src/routes/index.tsx", content: "export default function Home(){ return <nav>Inventory</nav> }" },
      { path: "src/routes/inventory.tsx", content: "export default function Inventory(){ return <main>Stock SKU</main> }" },
      { path: "src/components/AppShell.tsx", content: "export function AppShell(){ return <aside>Navigation</aside> }" },
      { path: "src/components/StockForm.tsx", content: "export function StockForm(){ return <form /> }" },
      { path: "src/lib/auth.ts", content: "export const auth = supabase.auth; export const role = 'admin';" },
      { path: "src/routes/inventory.test.tsx", content: "test('inventory journey', () => {})" },
    ],
  });
  assert.equal(orchestration.largeScope, true);
  assert.equal(orchestration.appKind, "ERP");
  assert.equal(orchestration.currentPhase.id, "vertical-slice");
  assert.match(orchestration.currentPhase.objective, /procurement/i);
  assert(!orchestration.deferredCapabilities.includes("inventory"));
});

test("completion evaluator rejects placeholder breadth and accepts a real first slice", () => {
  const orchestration = createBuildOrchestration({
    prompt: "Build a complete ERP",
    requestedMode: "build",
    files: [],
  });
  const failed = evaluateBuildCompletion({
    orchestration,
    files: [{ path: "src/routes/index.tsx", language: "typescript", content: "export default function App(){ return <main>Coming soon</main> }" }],
  });
  assert.equal(failed.passed, false);
  assert(failed.errors.some((error) => error.type === "completion_no-placeholder-modules"));

  const passed = evaluateBuildCompletion({
    orchestration,
    files: [
      { path: "src/routes/index.tsx", language: "typescript", content: "export default function App(){ return <nav><button>Inventory</button></nav> }" },
      { path: "src/routes/items.tsx", language: "typescript", content: "export default function Items(){ return <form onSubmit={() => save()}><button>Save</button></form> }" },
      { path: "src/components/AppShell.tsx", language: "typescript", content: "export function AppShell(){ return <aside>Navigation</aside> }" },
    ],
  });
  assert.equal(passed.passed, true);
});

test("completion checks only reject placeholders introduced by the current change", () => {
  const orchestration = createBuildOrchestration({
    prompt: "Build a complete ERP",
    requestedMode: "build",
    files: [],
  });
  const existingPlaceholder = {
    path: "src/routes/legacy.tsx",
    language: "typescript",
    content: "export default function Legacy(){ return <main>Coming soon</main> }",
  };
  const changed = [
    { path: "src/routes/index.tsx", language: "typescript", content: "export default function App(){ return <nav><button>Inventory</button></nav> }" },
    { path: "src/routes/items.tsx", language: "typescript", content: "export default function Items(){ return <form onSubmit={() => save()}><button>Save</button></form> }" },
    { path: "src/components/AppShell.tsx", language: "typescript", content: "export function AppShell(){ return <aside>Navigation</aside> }" },
  ];
  const result = evaluateBuildCompletion({
    orchestration,
    files: [existingPlaceholder, ...changed],
    changedFiles: changed,
  });
  assert.equal(result.passed, true);
});

test("verification ladder has deterministic ordering from normalization to outcome", () => {
  assert.deepEqual(VERIFICATION_LADDER, [
    "normalize",
    "structural-contract",
    "dependency-import-resolution",
    "typecheck-build",
    "preview-smoke",
    "browser-journey",
    "completion-evaluation",
  ]);
});

test("enterprise risk adds permission, secret and destructive-change gates", () => {
  const orchestration = createBuildOrchestration({
    prompt: "drop the old tenant authentication tables and replace their RLS policies",
    requestedMode: "build",
    files: [],
  });
  assert.equal(orchestration.risk, "critical");
  assert(orchestration.requiredGates.includes("permission-policy"));
  assert(orchestration.requiredGates.includes("secret-scan"));
  assert(orchestration.requiredGates.includes("destructive-change-review"));
  assert(orchestration.requiredGates.includes("rollback-ready"));
  assert(orchestration.protectedPaths.includes("package-lock.json"));
});

test("durable enterprise state parses strictly and advances only on completion", () => {
  assert.equal(parseEnterpriseOrchestrationState({ version: 2, appKind: "ERP" }), null);
  const previous = parseEnterpriseOrchestrationState({
    version: 1,
    appKind: "ERP",
    largeScope: true,
    completedCapabilities: ["inventory"],
    completedPhases: ["foundation"],
    lastPhase: "foundation",
    lastSuccessfulAt: "2026-08-15T00:00:00.000Z",
    projectFingerprint: "abc12345",
  });
  assert(previous);
  const orchestration = createBuildOrchestration({
    prompt: "continue",
    requestedMode: "build",
    previousState: previous,
    files: [
      { path: "src/routes/index.tsx", content: "export default function Home(){ return <nav>Inventory</nav> }" },
      { path: "src/routes/inventory.tsx", content: "export default function Inventory(){ return <main>Stock SKU</main> }" },
      { path: "src/components/AppShell.tsx", content: "export function AppShell(){ return <aside>Navigation</aside> }" },
      { path: "src/components/StockForm.tsx", content: "export function StockForm(){ return <form /> }" },
    ],
  });
  assert.equal(orchestration.appKind, "ERP");
  assert.equal(orchestration.largeScope, true);
  const completed = completeEnterpriseOrchestrationState(
    orchestration,
    [...orchestration.index.paths.map((path) => ({ path, content: "" })), { path: "src/routes/procurement.tsx", content: "supplier purchase order" }],
    "2026-08-16T00:00:00.000Z",
  );
  assert(completed.completedPhases.includes(orchestration.currentPhase.id));
  assert(completed.completedCapabilities.includes("procurement"));
  assert.equal(completed.lastSuccessfulAt, "2026-08-16T00:00:00.000Z");
  assert.notEqual(completed.projectFingerprint, previous.projectFingerprint);
});

test("completion rejects model writes to enterprise protected paths", () => {
  const orchestration = createBuildOrchestration({
    prompt: "update authentication roles",
    requestedMode: "build",
    files: [],
  });
  const changed = [{ path: ".env.local", language: "text", content: "SECRET=value" }];
  const result = evaluateBuildCompletion({ orchestration, files: changed, changedFiles: changed });
  assert.equal(result.passed, false);
  assert(result.errors.some((error) => error.type === "completion_protected-paths"));
});

test("enterprise secret gate blocks high-severity credentials", () => {
  const orchestration = createBuildOrchestration({ prompt: "add authentication", requestedMode: "build", files: [] });
  const changed = [{ path: "src/auth.ts", language: "typescript", content: 'const OPENAI_API_KEY = "sk-abcdefghijklmnopqrstuvwxyz123456";' }];
  const result = evaluateEnterpriseGates({ orchestration, candidateFiles: changed, changedFiles: changed });
  assert.equal(result.passed, false);
  assert(result.errors.some((error) => error.type === "enterprise_secret-scan"));
});

test("permission gate requires RLS and a policy for every new table", () => {
  const orchestration = createBuildOrchestration({ prompt: "add an authentication database migration", requestedMode: "build", files: [] });
  const unsafe = [{ path: "supabase/migrations/001_profiles.sql", language: "sql", content: "create table profiles(id uuid primary key);" }];
  const failed = evaluateEnterpriseGates({ orchestration, candidateFiles: unsafe, changedFiles: unsafe });
  assert(failed.errors.some((error) => error.type === "enterprise_permission-policy"));

  const safe = [{
    path: "supabase/migrations/001_profiles.sql",
    language: "sql",
    content: "create table profiles(id uuid primary key); alter table profiles enable row level security; create policy profiles_owner on profiles using (id = auth.uid());",
  }];
  const passed = evaluateEnterpriseGates({ orchestration, candidateFiles: safe, changedFiles: safe });
  assert(!passed.errors.some((error) => error.type === "enterprise_permission-policy"));
});

test("large business migrations require tenant ownership and mutation auditability", () => {
  const orchestration = createBuildOrchestration({ prompt: "build an enterprise ERP", requestedMode: "build", files: [] });
  const migration = {
    path: "supabase/migrations/001_inventory.sql",
    language: "sql",
    content: "create table inventory(id uuid primary key); alter table inventory enable row level security; create policy inventory_owner on inventory using (id = auth.uid());",
  };
  const mutation = { path: "src/actions.ts", language: "typescript", content: "export const save = (row: unknown) => supabase.from('inventory').insert(row);" };
  const failed = evaluateEnterpriseGates({ orchestration, candidateFiles: [migration, mutation], changedFiles: [migration, mutation] });
  assert(failed.errors.some((error) => error.type === "enterprise_tenant-isolation"));
  assert(failed.errors.some((error) => error.type === "enterprise_auditability"));

  const safeMigration = { ...migration, content: migration.content.replace("id uuid", "id uuid, company_id uuid") };
  const audit = { path: "src/audit.ts", language: "typescript", content: "export const logAuditEvent = () => supabase.from('audit_logs');" };
  const passed = evaluateEnterpriseGates({ orchestration, candidateFiles: [safeMigration, mutation, audit], changedFiles: [safeMigration, mutation, audit] });
  assert(!passed.errors.some((error) => error.type === "enterprise_tenant-isolation"));
  assert(!passed.errors.some((error) => error.type === "enterprise_auditability"));
});
