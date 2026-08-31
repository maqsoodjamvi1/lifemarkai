import assert from "node:assert/strict";
import test from "node:test";
import { createSandboxProgress } from "./progress.ts";

test("sandbox progress normalizes provider phases into stable UI states", () => {
  assert.deepEqual(createSandboxProgress("installing", "Installing dependencies"), {
    type: "sandbox_progress",
    phase: "installing",
    state: "running",
    detail: "Installing dependencies",
  });
  assert.equal(createSandboxProgress("ready").state, "ready");
  assert.equal(createSandboxProgress("app_error").state, "error");
  assert.equal(createSandboxProgress("backend_unreachable").state, "error");
});
