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
    evidence: [{ name: "build", status: "skipped", runId: "run-1", sandboxImage: "image@sha256:abc", source: "build-worker", observedAt: "2026-09-25T08:00:00.000Z" }],
  });
  assert.equal(verdict.accepted, false);
});

test("rejects functionally plausible patches that violate repository constraints", () => {
  const refusedDependency = verifyRepairPatch({
    originalErrors: ["Build failed"],
    beforeFiles: [{ path: "package.json", content: '{"dependencies":{}}' }, { path: "src/App.tsx", content: "bad" }],
    afterFiles: [{ path: "package.json", content: '{"dependencies":{"react-super-table":"latest"}}' }, { path: "src/App.tsx", content: "good" }],
  });
  assert.equal(refusedDependency.accepted, false);
  assert.match(refusedDependency.constraintViolations.join(" "), /refused dependencies/);

  const secretLeak = verifyRepairPatch({
    originalErrors: ["Uncaught TypeError"],
    beforeFiles: [{ path: "src/App.tsx", content: "export default () => <div/>" }],
    afterFiles: [{ path: "src/App.tsx", content: "const key = process.env.SERVICE_ROLE_KEY; export default () => <div/>" }],
  });
  assert.equal(secretLeak.accepted, false);
  assert.match(secretLeak.constraintViolations.join(" "), /secret references/);
});

test("rejects repairs that delete unrelated existing files", () => {
  const verdict = verifyRepairPatch({
    originalErrors: ["Build failed"],
    beforeFiles: [{ path: "src/App.tsx", content: "bad" }, { path: "src/data.ts", content: "export const rows = []" }],
    afterFiles: [{ path: "src/App.tsx", content: "good" }],
  });
  assert.equal(verdict.accepted, false);
  assert.match(verdict.constraintViolations.join(" "), /deletes existing files/);
});
