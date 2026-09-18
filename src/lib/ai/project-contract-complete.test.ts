import assert from "node:assert/strict";
import test from "node:test";
import { completeProjectContract } from "./project-contract-complete.ts";
import { serializeProjectContract, buildFallbackProjectContract } from "./project-contract.ts";

test("completeProjectContract accepts valid model JSON", async () => {
  const fallback = buildFallbackProjectContract("Build a bakery landing page");
  const result = await completeProjectContract({
    prompt: "Build a bakery landing page",
    generate: async () => ({ content: serializeProjectContract(fallback), tokensUsed: 12 }),
  });
  assert.equal(result.source, "model");
  assert.equal(result.tokensUsed, 12);
  assert.ok(result.contract.files.some((file) => file.path === "src/routes/index.tsx"));
});

test("completeProjectContract falls back when the model returns garbage", async () => {
  const result = await completeProjectContract({
    prompt: "Build a bakery landing page",
    generate: async () => ({ content: "not json", tokensUsed: 3 }),
  });
  assert.equal(result.source, "fallback");
  assert.equal(result.contract.framework, "tanstack-start");
});
