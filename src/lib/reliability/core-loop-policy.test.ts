import assert from "node:assert/strict";
import test from "node:test";
import { getCoreLoopPolicy,isCoreLoopRequest } from "./core-loop-policy.ts";

test("core-loop policy has one deterministic default path", () => {
  assert.deepEqual(getCoreLoopPolicy({}), {
    contractVersion: 2,
    framework: "tanstack",
    mode: "build",
    primaryModel: "qwen/qwen3-coder",
    fallbackModel: "deepseek/deepseek-v4-flash",
    previewStrategy: "server-verified",
    sandboxProvider: "docker",
    browserFallback: "webcontainer",
    apiSurface: [
      "POST /api/projects",
      "POST /api/ai/chat",
      "POST /api/projects/:projectId/sandbox-preview",
      "GET /api/projects/:projectId/sandbox-preview",
      "POST /api/projects/:projectId/sandbox-preview/stop",
      "POST /api/projects/:projectId/preview-verify",
      "POST /api/deploy",
      "GET /api/deploy",
    ],
    deploymentProvider: "netlify",
    maxAutomaticRepairRounds: 2,
  });
});

test("core-loop policy accepts explicit operator overrides", () => {
  const policy = getCoreLoopPolicy({
    CORE_LOOP_AI_MODEL: "openai/test-primary",
    CORE_LOOP_FALLBACK_MODEL: "anthropic/test-fallback",
    CORE_LOOP_DEPLOY_PROVIDER: "vercel",
    CORE_LOOP_MAX_REPAIR_ROUNDS: "3",
  });
  assert.equal(policy.primaryModel, "openai/test-primary");
  assert.equal(policy.fallbackModel, "anthropic/test-fallback");
  assert.equal(policy.deploymentProvider, "vercel");
  assert.equal(policy.maxAutomaticRepairRounds, 3);
});

test("only literal true activates the core-loop lane", () => {
  assert.equal(isCoreLoopRequest(true), true);
  assert.equal(isCoreLoopRequest("true"), false);
  assert.equal(isCoreLoopRequest(1), false);
});
