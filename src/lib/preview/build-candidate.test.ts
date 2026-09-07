import { test } from "node:test";
import assert from "node:assert/strict";
import { frameworkBuildVerdict, needsFrameworkBuild } from "./build-candidate.ts";

test("TanStack apps need the isolated Docker build, not the fallback renderer", () => {
  assert.equal(needsFrameworkBuild([
    { path: "package.json", content: JSON.stringify({ dependencies: { "@tanstack/react-router": "1.0.0" } }) },
  ]), true);
  assert.equal(needsFrameworkBuild([
    { path: "src/routes/index.tsx", content: `import { createFileRoute } from "@tanstack/react-router";` },
  ]), true);
  assert.equal(needsFrameworkBuild([
    { path: "package.json", content: JSON.stringify({ dependencies: { react: "19.0.0" } }) },
    { path: "src/routes/index.tsx", content: `import { createFileRoute } from "@tanstack/react-router";` },
  ]), true);
  assert.equal(needsFrameworkBuild([
    { path: "package.json", content: JSON.stringify({ dependencies: { react: "19.0.0" } }) },
  ]), false);
});

test("an unknown toolchain cannot undo a staged-verified commit", () => {
  const unavailable = { available: false, passed: false, errors: [], reason: "Open the preview first." };
  assert.equal(frameworkBuildVerdict(unavailable, { committed: false }).passed, false);
  assert.equal(frameworkBuildVerdict(unavailable, { committed: true }).passed, true);
  assert.equal(frameworkBuildVerdict({ available: true, passed: false, errors: ["TS2305"] }, { committed: true }).passed, false);
  assert.equal(frameworkBuildVerdict({ available: true, passed: true, errors: [] }, { committed: true }).passed, true);
});
