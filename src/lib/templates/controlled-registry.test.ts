import test from "node:test";
import assert from "node:assert/strict";
import { CONTROLLED_TEMPLATES, buildControlledTemplatePrompt, controlledTemplateMetadata, resolveControlledTemplate, resolveControlledTemplateForPrompt, checkTemplateCompatibility,lockControlledDependencyVersions,planControlledTemplateUpgrade,stampControlledTemplateFiles } from "./controlled-registry.ts";
import { tanstackStartScaffold } from "./tanstack-start-scaffold.ts";

test("CRM and ERP resolve to distinct controlled full-stack contracts", () => {
  assert.equal(resolveControlledTemplateForPrompt("Build a CRM with leads", "tanstack-start").key, "tanstack-crm");
  assert.equal(resolveControlledTemplateForPrompt("Build an ERP with inventory and invoices", "tanstack-start").key, "tanstack-erp");
});

test("controlled metadata is stable and cache-versioned", () => {
  const metadata = controlledTemplateMetadata(resolveControlledTemplateForPrompt("CRM", "tanstack-start"));
  assert.equal(metadata.controlled_template, "tanstack-crm");
  assert.match(metadata.template_cache_key, /^tanstack-crm:\d{4}\.\d{2}\.\d+$/);
});

test("compatibility reports missing CRM infrastructure", () => {
  const template = resolveControlledTemplateForPrompt("CRM", "tanstack-start");
  const result = checkTemplateCompatibility(template, [{ path: "package.json", content: "{}" }]);
  assert.equal(result.compatible, false);
  assert.ok(result.missingPaths.includes("supabase/migrations"));
  assert.ok(result.dependencyDrift.some((drift) => drift.startsWith("@tanstack/react-router: missing")));
});

test("dependency lock completes a sparse generated package manifest", () => {
  const template = resolveControlledTemplateForPrompt("CRM", "tanstack-start");
  const locked = lockControlledDependencyVersions(
    JSON.stringify({ name: "generated-app", dependencies: { react: "^18.2.0" } }),
    template,
  );
  const pkg = JSON.parse(locked.content);

  assert.equal(pkg.dependencies.react, template.dependencies.react);
  assert.equal(pkg.dependencies["@tanstack/react-router"], template.dependencies["@tanstack/react-router"]);
  assert.equal(pkg.dependencies["class-variance-authority"], template.dependencies["class-variance-authority"]);
  assert.equal(pkg.devDependencies.vite, template.devDependencies.vite);
  assert.ok(locked.changed.some((change) => change.startsWith("@tanstack/react-router: missing")));
});

test("template identity stamps the sandbox cache contract without changing dependencies", () => {
  const template = resolveControlledTemplateForPrompt("CRM", "tanstack-start");
  const [file] = stampControlledTemplateFiles([{ path: "package.json", content: '{"dependencies":{"react":"^19.2.0"}}' }], template);
  const pkg = JSON.parse(file.content);
  assert.equal(pkg.lifemark.cacheKey, template.cacheKey);
  assert.equal(pkg.dependencies.react, "^19.2.0");
});

test("template upgrades are explicit and version-aware", () => {
  assert.equal(planControlledTemplateUpgrade("tanstack-crm", "2025.01.1").required, true);
  const current = resolveControlledTemplateForPrompt("CRM", "tanstack-start");
  assert.equal(planControlledTemplateUpgrade(current.key, current.version).required, false);
});

test("the shipped TanStack environment remains compatible with the CRM contract", () => {
  const template = resolveControlledTemplateForPrompt("CRM", "tanstack-start");
  const files = [
    ...tanstackStartScaffold({}, "CRM"),
    { path: "supabase/migrations/001_crm.sql", content: "create table contacts(id uuid primary key);", language: "sql" },
  ];
  assert.deepEqual(checkTemplateCompatibility(template, files), {
    compatible: true,
    missingPaths: [],
    dependencyDrift: [],
  });
});

test("dependency drift invalidates the controlled environment cache contract", () => {
  const template = resolveControlledTemplateForPrompt("CRM", "tanstack-start");
  const files = tanstackStartScaffold({}, "CRM").map((file) => {
    if (file.path !== "package.json") return file;
    const pkg = JSON.parse(file.content);
    pkg.dependencies.react = "^17.0.2";
    return { ...file, content: JSON.stringify(pkg) };
  });
  const result = checkTemplateCompatibility(template, files);
  assert.ok(result.dependencyDrift.some((drift) => drift.startsWith("react:")));
});

// ── One classifier, one answer ───────────────────────────────────────────────
// This module used to re-classify the raw prompt with four regexes of its own,
// disagreeing with the 31-type classifier next door. Measured before the fix,
// every non-CRM/ERP prompt below was handed the CRM template — a brochure site
// included, because the `tanstack-start -> CRM` fallback caught the DEFAULT
// framework. These assert the template now follows the classification.
test("template follows the classifier — no second opinion about the product", () => {
  const cases: Array<[string, string]> = [
    ["Website for a school", "tanstack-site"],
    ["Build a portfolio site for a photographer", "tanstack-site"],
    ["Landing page for a CRM consultancy", "tanstack-site"],
    ["School management system", "tanstack-operations"],
    ["Build a point of sale for a cafe", "tanstack-operations"],
    ["Build a CRM with leads and deals", "tanstack-crm"],
    ["ERP for an ecommerce warehouse", "tanstack-erp"],
    ["Online store with inventory management", "tanstack-app"],
  ];
  for (const [prompt, expected] of cases) {
    assert.equal(resolveControlledTemplateForPrompt(prompt, "tanstack-start").key, expected, prompt);
  }
});

test("a public-facing template demands no auth, no roles, no migrations", () => {
  const site = resolveControlledTemplateForPrompt("Website for a school", "tanstack-start");
  assert.deepEqual([...site.modules], []);
  assert.ok(!site.requiredPaths.includes("supabase/migrations"));
  // …and its prompt contract must not ask for the app-shell acceptance rules.
  const contract = buildControlledTemplatePrompt(site);
  assert.doesNotMatch(contract, /Authentication, role checks/);
  assert.match(contract, /do NOT add authentication/);
});

test("operations tools get auth and audit WITHOUT CRM's contacts and pipeline", () => {
  const ops = resolveControlledTemplateForPrompt("School management system", "tanstack-start");
  assert.ok(ops.modules.includes("auth") && ops.modules.includes("audit"));
  assert.ok(!ops.modules.includes("contacts") && !ops.modules.includes("pipeline"));
  assert.ok(ops.requiredPaths.includes("supabase/migrations"));
});

test("framework decides the dependency set — a Vite CRM never gets TanStack Start", () => {
  // The old code returned the TanStack CRM template whenever the prompt said
  // "crm", and lockControlledDependencyVersions ADDS missing pins — so a react
  // project had @tanstack/react-start written into its package.json.
  const viteCrm = resolveControlledTemplateForPrompt("Build a CRM with leads and deals", "react");
  assert.equal(viteCrm.framework, "react");
  assert.ok(!("@tanstack/react-start" in viteCrm.dependencies));
  // It still carries the operational acceptance contract.
  assert.ok(viteCrm.modules.includes("auth"));
});

test("every template key round-trips through the upgrade planner", () => {
  for (const key of Object.keys(CONTROLLED_TEMPLATES)) {
    const plan = planControlledTemplateUpgrade(key, "1900.01.0");
    assert.equal(plan.required, true, key);
    assert.equal(plan.target?.key, key);
  }
});
