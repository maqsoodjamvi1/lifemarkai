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
