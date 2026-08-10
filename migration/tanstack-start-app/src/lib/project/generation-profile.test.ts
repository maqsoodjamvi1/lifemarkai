import test from "node:test";
import assert from "node:assert/strict";
import { recommendedFrameworkForPrompt,resolveCreationFramework } from "./generation-profile.ts";
test("ERP and CRM creation use the instant static SPA profile (MuseCode parity)", () => {
  assert.equal(recommendedFrameworkForPrompt("Create an ERP for wholesale inventory"),"static");
  assert.equal(recommendedFrameworkForPrompt("Build a CRM with a deal pipeline"),"static");
});
test("prompts needing a real backend go full-stack", () => {
  assert.equal(recommendedFrameworkForPrompt("Build a CRM with user authentication"),"tanstack-start");
  assert.equal(recommendedFrameworkForPrompt("An app with Stripe payments and a database"),"tanstack-start");
  assert.equal(recommendedFrameworkForPrompt("Realtime multi-tenant inventory with roles"),"tanstack-start");
});
test("simple browser apps remain static", () => assert.equal(recommendedFrameworkForPrompt("Build a mortgage calculator"),"static"));
test("an explicit framework selection wins", () => assert.equal(resolveCreationFramework("Build an ERP","react",true),"react"));
