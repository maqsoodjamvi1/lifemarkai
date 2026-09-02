import assert from "node:assert/strict";
import { test } from "node:test";
import { productionPanelLabel, resolvePanelOpen } from "./production-panel.ts";

test("keeps production surfaces", () => {
  assert.deepEqual(resolvePanelOpen("cloud"), { kind: "right", panel: "cloud" });
  assert.deepEqual(resolvePanelOpen("github"), { kind: "right", panel: "github" });
  assert.deepEqual(resolvePanelOpen("history"), { kind: "history" });
  assert.deepEqual(resolvePanelOpen("agent"), { kind: "chat-mode", panel: "agent" });
});

test("aliases duplicate data / email / money / connector ids", () => {
  assert.deepEqual(resolvePanelOpen("dbquery"), { kind: "right", panel: "cloud" });
  assert.deepEqual(resolvePanelOpen("schema"), { kind: "right", panel: "cloud" });
  assert.deepEqual(resolvePanelOpen("email"), { kind: "right", panel: "cloud" });
  assert.deepEqual(resolvePanelOpen("env"), { kind: "right", panel: "cloud" });
  assert.deepEqual(resolvePanelOpen("secrets"), { kind: "right", panel: "cloud" });
  assert.deepEqual(resolvePanelOpen("monetize"), { kind: "right", panel: "payments" });
  assert.deepEqual(resolvePanelOpen("appconnectors"), { kind: "right", panel: "connectors" });
});

test("ignores extra research / duplicate design / QA chrome", () => {
  for (const id of [
    "healing",
    "e2e",
    "testing",
    "knowledge",
    "design",
    "designpanel",
    "visualedits",
    "guidance",
    "components",
    "packages",
    "problems",
  ]) {
    assert.deepEqual(resolvePanelOpen(id), { kind: "ignore" });
  }
});

test("labels aliases as the canonical job", () => {
  assert.equal(productionPanelLabel("dbquery"), "Cloud");
  assert.equal(productionPanelLabel("seo"), "SEO");
});
