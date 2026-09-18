import assert from "node:assert/strict";
import test from "node:test";
import { verifyRepairPatch } from "./repair-verifier.ts";

test("rejects a green-looking patch outside the original failure layer", () => {
  const verdict = verifyRepairPatch({
    originalErrors: ["npm ERR! ERESOLVE dependency tree"],
    beforeFiles: [{ path: "package.json", content: '{"dependencies":{}}' }, { path: "src/App.tsx", content: "export default () => <div/>" }],
    afterFiles: [{ path: "package.json", content: '{"dependencies":{}}' }, { path: "src/App.tsx", content: "export default () => <main/>" }],
  });
  assert.equal(verdict.accepted, false);
  assert.match(verdict.reasons.join(" "), /dependency/);
});

test("accepts a dependency patch and ignores repair-agent diagnosis by contract", () => {
  const verdict = verifyRepairPatch({
    originalErrors: ["npm ERR! package dependency missing"],
    beforeFiles: [{ path: "package.json", content: '{"dependencies":{}}' }],
    afterFiles: [{ path: "package.json", content: '{"dependencies":{"zod":"^4"}}' }],
  });
  assert.equal(verdict.accepted, true);
  assert.deepEqual(verdict.changedFiles, ["package.json"]);
});

test("fresh evidence fails closed on skipped steps", () => {
  const verdict = verifyRepairPatch({
    originalErrors: ["Build failed"],
    beforeFiles: [{ path: "src/App.tsx", content: "bad" }],
    afterFiles: [{ path: "src/App.tsx", content: "good" }],
    requireFreshEvidence: true,
    evidence: [{ name: "build", status: "skipped" }],
  });
  assert.equal(verdict.accepted, false);
});
