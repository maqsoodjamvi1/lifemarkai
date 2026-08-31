import test from "node:test";
import assert from "node:assert/strict";
import { buildUserDirective, classifyBuildIntent } from "./build-intent.ts";

test("explicit landing pages use the single-page completeness contract", () => {
  const intent = classifyBuildIntent(
    "Build a responsive landing page for a neighborhood bakery with menu, testimonials and contact form.",
  );

  assert.equal(intent.appType, "marketing-website");
  assert.equal(intent.singlePage, true);
  assert.equal(intent.minFiles, 12);
  assert.match(intent.blueprint, /one polished, production-style landing page/i);
  assert.match(intent.blueprint, /One routed home page/);
  assert.doesNotMatch(intent.blueprint, /Required site map \(5–10 linked pages\)/);
  assert.match(buildUserDirective(intent), /explicit single-page landing build/);
});

test("ordinary website requests retain the full multi-page database-backed contract", () => {
  const intent = classifyBuildIntent(
    "Build a construction company website with projects, capabilities, safety statistics and quote form.",
  );

  assert.equal(intent.appType, "marketing-website");
  assert.equal(intent.singlePage, false);
  assert.equal(intent.minFiles, 18);
  assert.match(intent.blueprint, /Required site map \(5–10 linked pages\)/);
  assert.match(intent.blueprint, /Database-backed behavior/);
});

test("intent metadata separates product type, operation, scope, and capabilities", () => {
  const intent = classifyBuildIntent(
    "Fix the broken customer table component in my CRM with role permissions and analytics",
  );

  assert.equal(intent.appType, "crm");
  assert.equal(intent.operation, "repair");
  assert.equal(intent.changeScope, "single-component");
  assert.ok(intent.requiredCapabilities.includes("auth"));
  assert.ok(intent.requiredCapabilities.includes("database"));
  assert.ok(intent.requiredCapabilities.includes("analytics"));
  assert.ok(intent.confidence >= 0.9);
  assert.match(buildUserDirective(intent), /Allowed change scope: single-component/);
  assert.match(buildUserDirective(intent), /Required capabilities: database, auth, analytics/);
});

test("plain landing pages do not acquire an invented backend", () => {
  const intent = classifyBuildIntent("Build a landing page with hero images for a CRM consultancy");

  assert.equal(intent.appType, "marketing-website");
  assert.equal(intent.operation, "create");
  assert.equal(intent.changeScope, "single-page");
  assert.deepEqual(intent.requiredCapabilities, []);
});

test("features named during a new app request do not shrink the whole build to one component", () => {
  const intent = classifyBuildIntent("Build a CRM with a sidebar, customer table, and deal pipeline");

  assert.equal(intent.operation, "create");
  assert.equal(intent.changeScope, "architecture");
});
