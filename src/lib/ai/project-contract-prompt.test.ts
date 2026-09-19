import assert from "node:assert/strict";
import test from "node:test";
import { classifyBuildIntent } from "./build-intent.ts";
import { buildProjectContractPrompt } from "./project-contract-prompt.ts";

test("contract planning receives the same scope and blueprint as generation validation", () => {
  for (const request of [
    "Build an inventory app with products, stock alerts, suppliers and purchase orders.",
    "Build a travel agency website with destination packages, pricing and inquiry forms.",
    "Build a CRM dashboard with contacts, deal stages, tasks and a sales summary.",
  ]) {
    const intent = classifyBuildIntent(request);
    const prompt = buildProjectContractPrompt(request);
    assert.ok(prompt.includes(intent.blueprint));
    assert.ok(prompt.includes(`Plan at least ${intent.minFiles} meaningful files`));
    assert.match(prompt, /multi-page product/);
    assert.doesNotMatch(prompt, /Extra.*pages only when the request names them/);
  }
});

test("explicit single-page requests retain one route without invented backend scope", () => {
  const prompt = buildProjectContractPrompt("Build a single-page bakery landing page with menu and testimonials.");
  assert.match(prompt, /explicit single-page request/);
  assert.match(prompt, /do not invent extra About\/Blog\/Contact routes or a database/);
  assert.doesNotMatch(prompt, /This is a multi-page product/);
});
