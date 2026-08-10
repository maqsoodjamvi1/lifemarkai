import test from "node:test";
import assert from "node:assert/strict";
import { controlledTemplateMetadata, resolveControlledTemplate, checkTemplateCompatibility,planControlledTemplateUpgrade,stampControlledTemplateFiles } from "./controlled-registry.ts";
import { tanstackStartScaffold } from "./tanstack-start-scaffold.ts";

test("CRM and ERP resolve to distinct controlled full-stack contracts", () => {
  assert.equal(resolveControlledTemplate("Build a CRM with leads", "tanstack-start").key, "tanstack-crm");
  assert.equal(resolveControlledTemplate("Build an ERP with inventory and invoices", "tanstack-start").key, "tanstack-erp");
});

test("controlled metadata is stable and cache-versioned", () => {
  const metadata = controlledTemplateMetadata(resolveControlledTemplate("CRM", "tanstack-start"));
  assert.equal(metadata.controlled_template, "tanstack-crm");
  assert.match(metadata.template_cache_key, /^tanstack-crm:\d{4}\.\d{2}\.\d+$/);
});

test("compatibility reports missing CRM infrastructure", () => {
  const template = resolveControlledTemplate("CRM", "tanstack-start");
  const result = checkTemplateCompatibility(template, [{ path: "package.json", content: "{}" }]);
  assert.equal(result.compatible, false);
  assert.ok(result.missingPaths.includes("supabase/migrations"));
});

test("template identity stamps the sandbox cache contract without changing dependencies", () => {
  const template = resolveControlledTemplate("CRM", "tanstack-start");
  const [file] = stampControlledTemplateFiles([{ path: "package.json", content: '{"dependencies":{"react":"^19.2.0"}}' }], template);
  const pkg = JSON.parse(file.content);
  assert.equal(pkg.lifemark.cacheKey, template.cacheKey);
  assert.equal(pkg.dependencies.react, "^19.2.0");
});

test("template upgrades are explicit and version-aware", () => {
  assert.equal(planControlledTemplateUpgrade("tanstack-crm", "2025.01.1").required, true);
  const current = resolveControlledTemplate("CRM", "tanstack-start");
  assert.equal(planControlledTemplateUpgrade(current.key, current.version).required, false);
});

test("the shipped TanStack environment remains compatible with the CRM contract", () => {
  const template = resolveControlledTemplate("CRM", "tanstack-start");
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
  const template = resolveControlledTemplate("CRM", "tanstack-start");
  const files = tanstackStartScaffold({}, "CRM").map((file) => {
    if (file.path !== "package.json") return file;
    const pkg = JSON.parse(file.content);
    pkg.dependencies.react = "^17.0.2";
    return { ...file, content: JSON.stringify(pkg) };
  });
  const result = checkTemplateCompatibility(template, files);
  assert.ok(result.dependencyDrift.some((drift) => drift.startsWith("react:")));
});
