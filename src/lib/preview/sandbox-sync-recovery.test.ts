import assert from "node:assert/strict";
import test from "node:test";
import { needsSandboxSyncRecovery } from "./sandbox-sync-recovery.ts";

test("recognizes stopped and paused Docker containers as recoverable", () => {
  for (const error of ["Container is not running.", "Container abc is not running", "Container is paused", "Sandbox has already completed", "Invalid sandbox for this project"]) {
    assert.equal(needsSandboxSyncRecovery(error), true, error);
  }
});

test("does not reconnect for source, permission, rate-limit, or install failures", () => {
  for (const error of [undefined, "Live environment is locked", "Rate limited", "Invalid file content", "npm install failed"]) {
    assert.equal(needsSandboxSyncRecovery(error), false, error);
  }
});
