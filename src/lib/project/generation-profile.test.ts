import test from "node:test";
import assert from "node:assert/strict";
import { isUpgradeToFullStackIntent,promptNeedsRealBackend,recommendedFrameworkForPrompt,resolveCreationFramework } from "./generation-profile.ts";
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

test("upgrade intent detection", () => {
  assert.equal(isUpgradeToFullStackIntent("upgrade to full-stack"), true);
  assert.equal(isUpgradeToFullStackIntent("please convert this to the full stack version"), true);
  assert.equal(isUpgradeToFullStackIntent("switch to tanstack"), true);
  assert.equal(isUpgradeToFullStackIntent("make the header blue"), false);
  assert.equal(isUpgradeToFullStackIntent("upgrade the design"), false);
});
test("backend-need detection on static projects", () => {
  assert.equal(promptNeedsRealBackend("add user authentication"), true);
  assert.equal(promptNeedsRealBackend("integrate stripe payments"), true);
  assert.equal(promptNeedsRealBackend("add a second dashboard screen"), false);
});
