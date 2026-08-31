import assert from "node:assert/strict";
import test from "node:test";
import { selectPreviewEngine } from "./use-preview-engine-policy.ts";

const base = {
  hasFiles: true,
  staticRuntime: false,
  sandboxEnabled: false,
  sandboxError: false,
  webContainerEnabled: true,
  explicitWebContainerFallback: true,
  webContainerProjectShape: true,
};

test("no files means unavailable regardless of everything else", () => {
  assert.equal(selectPreviewEngine({ ...base, hasFiles: false, sandboxEnabled: true }), "unavailable");
});

test("a healthy or still-booting sandbox is preferred (unchanged prior behavior)", () => {
  assert.equal(selectPreviewEngine({ ...base, sandboxEnabled: true, sandboxError: false }), "sandbox");
});

// Regression: `sandboxEnabled` is a "credentials configured" flag that stays
// true forever once first observed true (per useSandboxPreview's own
// design) — before this fix, `if (sandboxEnabled) return "sandbox"` pinned
// the engine to "sandbox" for the rest of the session no matter how badly
// or how long it kept failing, leaving the WebContainer fallback
// permanently unreachable even when a caller explicitly requested it.
test("a sandbox with a settled error fails over to WebContainer when the fallback is usable", () => {
  assert.equal(
    selectPreviewEngine({ ...base, sandboxEnabled: true, sandboxError: true }),
    "webcontainer",
  );
});

test("a sandbox error does NOT fail over when WebContainer was never explicitly requested", () => {
  assert.equal(
    selectPreviewEngine({
      ...base,
      sandboxEnabled: true,
      sandboxError: true,
      explicitWebContainerFallback: false,
    }),
    "sandbox",
  );
});

test("a sandbox error does NOT fail over when WebContainer is disabled (e.g. static runtime)", () => {
  assert.equal(
    selectPreviewEngine({ ...base, sandboxEnabled: true, sandboxError: true, webContainerEnabled: false }),
    "sandbox",
  );
});

test("a sandbox error does NOT fail over when the project doesn't have WebContainer's expected shape", () => {
  assert.equal(
    selectPreviewEngine({
      ...base,
      sandboxEnabled: true,
      sandboxError: true,
      webContainerProjectShape: false,
    }),
    "sandbox",
  );
});

test("without a usable WebContainer fallback, an erroring sandbox still returns sandbox (keeps its own error/retry UI reachable)", () => {
  assert.equal(
    selectPreviewEngine({
      ...base,
      sandboxEnabled: true,
      sandboxError: true,
      explicitWebContainerFallback: false,
      webContainerEnabled: false,
      webContainerProjectShape: false,
    }),
    "sandbox",
  );
});

test("no sandbox at all still falls through to static, then WebContainer, as before", () => {
  assert.equal(selectPreviewEngine({ ...base, sandboxEnabled: false, staticRuntime: true }), "static");
  assert.equal(selectPreviewEngine({ ...base, sandboxEnabled: false, staticRuntime: false }), "webcontainer");
});

test("no sandbox and no usable WebContainer fallback is unavailable", () => {
  assert.equal(
    selectPreviewEngine({
      ...base,
      sandboxEnabled: false,
      staticRuntime: false,
      explicitWebContainerFallback: false,
    }),
    "unavailable",
  );
});
