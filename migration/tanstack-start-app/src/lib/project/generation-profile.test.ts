import test from "node:test";
import assert from "node:assert/strict";
import { recommendedFrameworkForPrompt,resolveCreationFramework } from "./generation-profile.ts";
test("ERP and CRM creation use the full-stack profile", () => {
  assert.equal(recommendedFrameworkForPrompt("Create an ERP for wholesale inventory"),"tanstack-start");
  assert.equal(recommendedFrameworkForPrompt("Build a CRM with a deal pipeline"),"tanstack-start");
});
test("simple browser apps remain static", () => assert.equal(recommendedFrameworkForPrompt("Build a mortgage calculator"),"static"));
test("an explicit framework selection wins", () => assert.equal(resolveCreationFramework("Build an ERP","react",true),"react"));
