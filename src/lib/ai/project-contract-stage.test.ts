import test from "node:test";
import assert from "node:assert/strict";
import { runProjectContractStage } from "./project-contract-stage.ts";
import { buildFallbackProjectContract, serializeProjectContract } from "./project-contract.ts";

test("contract stage uses the non-streaming provider response, preserving planned routes", async () => {
  const contract = buildFallbackProjectContract("Build a CRM dashboard");
  contract.files.push({ path: "src/routes/contacts.tsx", purpose: "Contacts directory", owner: "product", exports: [{ name: "Route", kind: "named" }], dependsOn: [] });
  contract.routes.push({ path: "/contacts", file: "src/routes/contacts.tsx" });
  let calls = 0;
  const result = await runProjectContractStage({ prompt: "Build a CRM dashboard", projectId: "test", userId: "test", model: "test" }, async (request) => {
    calls++;
    assert.equal(request.stream, undefined);
    return { content: serializeProjectContract(contract), tokensUsed: 42, model: "test" };
  });
  assert.equal(calls, 1);
  assert.equal(result.source, "model");
  assert.equal(result.tokensUsed, 42);
  assert.ok(result.contract.routes.some((route) => route.path === "/contacts"));
});
