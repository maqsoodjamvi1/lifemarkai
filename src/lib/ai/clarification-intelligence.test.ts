import test from "node:test";
import assert from "node:assert/strict";
import { shouldClarifyCapabilities } from "./clarification-intelligence.ts";

test("connector ambiguity triggers an intelligent clarification", () => {
  assert.equal(shouldClarifyCapabilities("Add connectors so generated apps use real data"), true);
  assert.equal(shouldClarifyCapabilities("Make it publishable on a custom domain and add integrations"), true);
  assert.equal(shouldClarifyCapabilities("Support more AI model providers"), true);
});

test("ordinary explicit edits do not trigger capability clarification", () => {
  assert.equal(shouldClarifyCapabilities("Make the button blue and increase its padding"), false);
  assert.equal(shouldClarifyCapabilities("Add a Stripe checkout using the existing project key"), false);
});

test("forceBuild prevents a clarification loop", () => {
  assert.equal(shouldClarifyCapabilities("Add connectors", true), false);
});
