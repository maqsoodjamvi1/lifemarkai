import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreviewEngine } from "./resolve-preview-engine.ts";

const frameworkFiles = [
  { path: "package.json" },
  { path: "vite.config.ts" },
  { path: "src/main.tsx" },
];

test("framework preview stays on sandbox while it is configured or booting", () => {
  assert.equal(resolvePreviewEngine(frameworkFiles, { sandboxEnabled: true }), "sandbox");
  assert.equal(resolvePreviewEngine(frameworkFiles, { sandboxUrl: "https://preview.example" }), "sandbox");
});

test("missing framework runtime is unavailable, never a static renderer", () => {
  assert.equal(resolvePreviewEngine(frameworkFiles), "unavailable");
});
