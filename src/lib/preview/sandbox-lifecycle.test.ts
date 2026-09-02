import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSandboxLifecycle,
  isIdleReclaimText,
  MAX_RESUME_COLD_BOOTS,
  planResumeAfterPause,
} from "./sandbox-lifecycle.ts";

const base = {
  enabled: true,
  loading: false,
  previewUrl: null as string | null,
  phase: null as string | null,
  error: null as string | null,
};

test("no backend is unavailable", () => {
  assert.equal(
    deriveSandboxLifecycle({ ...base, enabled: false }),
    "unavailable",
  );
});

test("loading or creating is booting", () => {
  assert.equal(deriveSandboxLifecycle({ ...base, loading: true, phase: "creating" }), "booting");
  assert.equal(deriveSandboxLifecycle({ ...base, loading: true, phase: "installing" }), "booting");
  assert.equal(deriveSandboxLifecycle({ ...base, loading: false, phase: "starting" }), "booting");
});

test("ready URL plus phase ready is ready", () => {
  assert.equal(
    deriveSandboxLifecycle({
      ...base,
      previewUrl: "https://p.preview.example",
      phase: "ready",
    }),
    "ready",
  );
});

test("explicit paused wins over leftover error text", () => {
  assert.equal(
    deriveSandboxLifecycle({
      ...base,
      error: "Sandbox expired",
      paused: true,
    }),
    "paused",
  );
});

test("resuming wins over paused", () => {
  assert.equal(
    deriveSandboxLifecycle({
      ...base,
      paused: true,
      resuming: true,
    }),
    "resuming",
  );
});

test("idle reclaim copy maps to paused, not failed", () => {
  assert.equal(
    deriveSandboxLifecycle({
      ...base,
      error: "Container no longer exists.",
      phaseDetail: "expired",
    }),
    "paused",
  );
  assert.ok(isIdleReclaimText("Sandbox has already finished with status timeout"));
});

test("app_error is failed, not a pause/resume loop", () => {
  assert.equal(
    deriveSandboxLifecycle({
      ...base,
      phase: "app_error",
      error: "Your app failed to build.",
    }),
    "failed",
  );
});

test("project error without reclaim is failed", () => {
  assert.equal(
    deriveSandboxLifecycle({
      ...base,
      error: "Your app did not finish starting.",
      phase: "error",
    }),
    "failed",
  );
});

test("resume prefers warm reconnect then one cold boot then failed", () => {
  assert.equal(planResumeAfterPause({ reconnectHasUrl: true, reconnectWaking: false, coldBootsUsed: 0 }), "reconnect");
  assert.equal(planResumeAfterPause({ reconnectHasUrl: false, reconnectWaking: true, coldBootsUsed: 0 }), "reconnect");
  assert.equal(planResumeAfterPause({ reconnectHasUrl: false, reconnectWaking: false, coldBootsUsed: 0 }), "cold");
  assert.equal(
    planResumeAfterPause({ reconnectHasUrl: false, reconnectWaking: false, coldBootsUsed: MAX_RESUME_COLD_BOOTS }),
    "failed",
  );
  assert.equal(MAX_RESUME_COLD_BOOTS, 1);
});
