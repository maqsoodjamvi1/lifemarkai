import assert from "node:assert/strict";
import test from "node:test";
import { detectMentionedConnectors, formatConnectorTurnBlock } from "./mentioned-connectors.ts";

test("detects natural-language connector names", () => {
  assert.deepEqual(detectMentionedConnectors("Add Stripe checkout and Slack alerts"), ["stripe", "slack"]);
});

test("detects @connector mentions", () => {
  assert.ok(detectMentionedConnectors("wire @connector:github").includes("github"));
});

test("formatConnectorTurnBlock is empty when nothing is named", () => {
  assert.equal(formatConnectorTurnBlock("p1", []), "");
});

test("formatConnectorTurnBlock tells the model to implement now", () => {
  const block = formatConnectorTurnBlock("proj-1", ["stripe"]);
  assert.match(block, /connector-proxy/);
  assert.match(block, /do not say "open the Connectors panel"/);
});
