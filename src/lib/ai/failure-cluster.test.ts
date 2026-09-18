import assert from "node:assert/strict";
import test from "node:test";
import { attemptClusterFields, classifyFailureFamily, clusterFailures } from "./failure-cluster.ts";

test("classifies contract and runtime failures into defect families", () => {
  assert.equal(classifyFailureFamily({ type: "undeclared_file", message: "src/App.tsx is not listed in project-contract" }), "undeclared-file");
  assert.equal(classifyFailureFamily({ type: "missing_contract_export", message: "src/lib/utils.ts must export cn" }), "missing-export");
  assert.equal(classifyFailureFamily({ type: "disallowed_package", message: "left-pad is not on the install allowlist" }), "invalid-package");
  assert.equal(classifyFailureFamily({ message: "Preview timed out after 60000ms" }), "preview-timeout");
  assert.equal(classifyFailureFamily({ message: "src/App.tsx:2:1 — TS2304: Cannot find name Foo" }), "typecheck");
  assert.equal(classifyFailureFamily({ message: "vite build failed to compile" }), "build");
});

test("clusterFailures groups repeated fingerprints and reports dimensions", () => {
  const clusters = clusterFailures([
    { type: "undeclared_file", message: "src/Hero.tsx was generated but is not listed in the contract", file: "src/Hero.tsx" },
    { type: "undeclared_file", message: "src/Hero.tsx was generated but is not listed in the contract", file: "src/Hero.tsx" },
    { message: "sandbox boot timed out: ETIMEDOUT connecting to preview host" },
  ]);
  assert.equal(clusters[0]?.family, "undeclared-file");
  assert.equal(clusters[0]?.count, 2);
  assert.equal(clusters[0]?.dimension, "adherence");
  assert.ok(clusters.some((item) => item.family === "preview-timeout" && item.dimension === "latency"));
  const fields = attemptClusterFields(clusters.map((item) => ({ type: item.family, message: item.sample })));
  assert.ok(fields.familyCount >= 1);
  assert.equal(typeof fields.families, "string");
});
