import assert from "node:assert/strict";
import test from "node:test";
import { reconstructIssueFromDiff, verifyRepairIndependently } from "./repair-verifier.ts";

test("reconstructs a dependency failure from a package.json diff", () => {
  const reconstructed = reconstructIssueFromDiff([
    {
      path: "package.json",
      before: JSON.stringify({ dependencies: { react: "19.0.0" } }),
      after: JSON.stringify({ dependencies: { react: "19.0.0", "lucide-react": "0.1.0" } }),
    },
  ]);
  assert.equal(reconstructed.layer, "dependency");
});

test("reconstructs an internal-reference failure from an export change", () => {
  const reconstructed = reconstructIssueFromDiff([
    {
      path: "src/components/Header.tsx",
      before: "export function SiteHeader() { return null; }",
      after: "export function Header() { return null; }",
    },
  ]);
  assert.equal(reconstructed.layer, "internal-reference");
});

test("rejects a patch that does not reconstruct the original failure even when evidence is green", () => {
  const verdict = verifyRepairIndependently({
    originalFailures: [{ type: "missing_contract_export", message: "src/lib/utils.ts must export cn" }],
    diffs: [
      {
        path: "src/styles.css",
        before: "body { color: black; }",
        after: "body { color: blue; }",
      },
    ],
    remainingErrors: [],
    repairAgentDiagnosis: "Fixed the missing cn export in utils.ts",
  });
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.falseGreen, true);
  assert.match(verdict.mismatch ?? "", /does not match original/);
});

test("ignores the repair agent's diagnosis when scoring the patch", () => {
  const without = verifyRepairIndependently({
    originalFailures: [{ message: "vite build failed to compile" }],
    diffs: [
      {
        path: "src/styles.css",
        before: "a {}",
        after: "b {}",
      },
    ],
    remainingErrors: [],
  });
  const withDiagnosis = verifyRepairIndependently({
    originalFailures: [{ message: "vite build failed to compile" }],
    diffs: [
      {
        path: "src/styles.css",
        before: "a {}",
        after: "b {}",
      },
    ],
    remainingErrors: [],
    repairAgentDiagnosis: "I fixed the production build by correcting vite.config.ts",
  });
  assert.equal(without.accepted, withDiagnosis.accepted);
  assert.equal(without.falseGreen, withDiagnosis.falseGreen);
});

test("accepts a targeted patch when reconstruction matches and the original failure is gone", () => {
  const verdict = verifyRepairIndependently({
    originalFailures: [{ type: "missing_contract_export", message: "src/components/Header.tsx must export Header" }],
    diffs: [
      {
        path: "src/components/Header.tsx",
        before: "export function SiteHeader() { return null; }",
        after: "export function Header() { return null; }",
      },
    ],
    remainingErrors: [],
  });
  assert.equal(verdict.accepted, true);
  assert.equal(verdict.falseGreen, false);
  assert.equal(verdict.remainingOriginal, 0);
});

test("rejects when the original failure is still in fresh execution evidence", () => {
  const verdict = verifyRepairIndependently({
    originalFailures: [{ message: "src/lib/utils.ts must export cn" }],
    diffs: [
      {
        path: "src/lib/utils.ts",
        before: "export const foo = 1;",
        after: "export function cn() { return ''; }",
      },
    ],
    remainingErrors: ["src/lib/utils.ts must export cn"],
  });
  assert.equal(verdict.accepted, false);
  assert.ok((verdict.remainingOriginal ?? 0) >= 1);
});
