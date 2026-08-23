import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOnboardingSteps } from "./onboarding-flow.ts";

test("first incomplete step is active", () => {
  const steps = computeOnboardingSteps({
    hasGoal: true,
    planApproved: false,
    buildFinished: false,
    previewReady: false,
    published: false,
  });
  assert.equal(steps[0].done, true);
  assert.equal(steps[1].active, true);
  assert.equal(steps[1].id, "plan");
});

test("all done none active", () => {
  const steps = computeOnboardingSteps({
    hasGoal: true,
    planApproved: true,
    buildFinished: true,
    previewReady: true,
    published: true,
  });
  assert.ok(steps.every((s) => s.done && !s.active));
});
