import { describe,it,beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
FEATURE_FLAGS,
FEATURE_FLAG_NAMES,
describeFeatureFlags,
featureFlagSnapshot,
featureFlagState,
isFeatureEnabled,
} from "./features.ts";

const OWNED = [
  ...FEATURE_FLAG_NAMES.flatMap((name) => [
    FEATURE_FLAGS[name].env,
    `${FEATURE_FLAGS[name].env}_ROLLOUT`,
    `${FEATURE_FLAGS[name].env}_INTERNAL`,
    FEATURE_FLAGS[name].publicEnv,
  ]),
  "LIFEMARK_INTERNAL_USER_IDS",
].filter(Boolean) as string[];

function clearFlagEnv() {
  for (const key of OWNED) delete process.env[key];
}

describe("feature flags — everything is off until someone says otherwise", () => {
  beforeEach(clearFlagEnv);

  it("defaults every flag to false with no env set", () => {
    const snapshot = featureFlagSnapshot();
    for (const name of FEATURE_FLAG_NAMES) {
      assert.equal(snapshot[name], false, `${name} must default to off`);
    }
  });

  it("treats an unparseable value as unset rather than enabled", () => {
    process.env.VERCEL_AI_SDK_ENABLED = "maybe";
    assert.equal(isFeatureEnabled("vercelAiSdk"), false);
  });

  it("accepts the usual truthy spellings", () => {
    for (const value of ["1", "true", "TRUE", " yes ", "on", "enabled"]) {
      process.env.VERCEL_WORKFLOW_ENABLED = value;
      assert.equal(isFeatureEnabled("vercelWorkflow"), true, `${value} should enable`);
    }
  });
});

describe("feature flags — explicit off is the rollback lever", () => {
  beforeEach(clearFlagEnv);

  /**
   * The plan promises "gateway failure can be reversed with one environment
   * flag". That only holds if OFF outranks the internal allowlist and the
   * rollout percentage. If a 100% rollout could survive the kill switch, the
   * documented rollback would silently do nothing during an incident.
   */
  it("beats a 100% rollout and the internal allowlist", () => {
    process.env.VERCEL_AI_GATEWAY_ENABLED = "false";
    process.env.VERCEL_AI_GATEWAY_ENABLED_ROLLOUT = "100";
    process.env.VERCEL_AI_GATEWAY_ENABLED_INTERNAL = "true";
    process.env.LIFEMARK_INTERNAL_USER_IDS = "user-1";

    const state = featureFlagState("vercelAiGateway", { userId: "user-1", internal: true });
    assert.equal(state.enabled, false);
    assert.equal(state.reason, "env-off");
  });
});

describe("feature flags — internal allowlist", () => {
  beforeEach(clearFlagEnv);

  it("enables only for listed users, and only when _INTERNAL is set", () => {
    process.env.LIFEMARK_INTERNAL_USER_IDS = "user-1, user-2";
    assert.equal(isFeatureEnabled("vercelSandbox", { userId: "user-1" }), false);

    process.env.VERCEL_SANDBOX_ENABLED_INTERNAL = "true";
    assert.equal(isFeatureEnabled("vercelSandbox", { userId: "user-1" }), true);
    assert.equal(isFeatureEnabled("vercelSandbox", { userId: "user-2" }), true);
    assert.equal(isFeatureEnabled("vercelSandbox", { userId: "stranger" }), false);
    assert.equal(isFeatureEnabled("vercelSandbox", {}), false);
  });
});

describe("feature flags — percentage rollout", () => {
  beforeEach(clearFlagEnv);

  /**
   * A build calls generateAI() many times. If the bucket were re-rolled per
   * call, one build would run half on the new adapter and half on the old —
   * which is exactly the state Phase 4's "no duplicate generation charges"
   * criterion is trying to avoid. Same user must mean same answer.
   */
  it("is stable for the same identity", () => {
    process.env.VERCEL_AI_SDK_ENABLED_ROLLOUT = "50";
    const first = isFeatureEnabled("vercelAiSdk", { userId: "user-42" });
    for (let i = 0; i < 25; i++) {
      assert.equal(isFeatureEnabled("vercelAiSdk", { userId: "user-42" }), first);
    }
  });

  it("stays off when there is no identity to hash", () => {
    process.env.VERCEL_AI_SDK_ENABLED_ROLLOUT = "99";
    const state = featureFlagState("vercelAiSdk", {});
    assert.equal(state.enabled, false);
    assert.equal(state.reason, "rollout-no-identity");
  });

  it("falls back to projectId when no user is present", () => {
    process.env.VERCEL_AI_SDK_ENABLED_ROLLOUT = "100";
    assert.equal(isFeatureEnabled("vercelAiSdk", { projectId: "proj-1" }), true);
  });

  it("covers everyone at 100 and no one at 0", () => {
    process.env.VERCEL_QUEUE_ENABLED_ROLLOUT = "100";
    assert.equal(isFeatureEnabled("vercelQueue", { userId: "anyone" }), true);
    process.env.VERCEL_QUEUE_ENABLED_ROLLOUT = "0";
    assert.equal(isFeatureEnabled("vercelQueue", { userId: "anyone" }), false);
  });

  it("clamps out-of-range percentages instead of trusting them", () => {
    process.env.VERCEL_QUEUE_ENABLED_ROLLOUT = "-10";
    assert.equal(featureFlagState("vercelQueue", { userId: "u" }).rolloutPercent, 0);
    process.env.VERCEL_QUEUE_ENABLED_ROLLOUT = "10000";
    assert.equal(featureFlagState("vercelQueue", { userId: "u" }).rolloutPercent, 100);
  });

  it("spreads users across buckets rather than sending everyone one way", () => {
    process.env.VERCEL_AI_SDK_ENABLED_ROLLOUT = "50";
    const ids = Array.from({ length: 400 }, (_, i) => `user-${i}`);
    const on = ids.filter((userId) => isFeatureEnabled("vercelAiSdk", { userId })).length;
    assert.ok(on > 120 && on < 280, `expected roughly half enabled, got ${on}/400`);
  });
});

describe("feature flag metadata", () => {
  it("documents an env var and a rollback note for every flag", () => {
    for (const state of describeFeatureFlags()) {
      const definition = FEATURE_FLAGS[state.name];
      assert.match(definition.env, /^VERCEL_[A-Z_]+$/);
      assert.ok(definition.rollback.length > 20, `${state.name} needs a real rollback note`);
      assert.ok(definition.phase >= 1);
    }
  });

  it("uses a unique env var per flag", () => {
    const envs = FEATURE_FLAG_NAMES.map((name) => FEATURE_FLAGS[name].env);
    assert.equal(new Set(envs).size, envs.length);
  });
});
