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

test("a healthy or still-booting sandbox is the only live origin", () => {
  assert.equal(selectPreviewEngine({ ...base, sandboxEnabled: true, sandboxError: false }), "sandbox");
});

test("a sandbox with a settled error stays on the sandbox origin", () => {
  assert.equal(
    selectPreviewEngine({ ...base, sandboxEnabled: true, sandboxError: true }),
    "sandbox",
  );
});

test("WebContainer is never the product engine, even when opted in", () => {
  assert.equal(
    selectPreviewEngine({
      ...base,
      sandboxEnabled: false,
      explicitWebContainerFallback: true,
    }),
    "unavailable",
  );
});

test("product path never returns srcdoc or webcontainer", () => {
  const engines = [
    selectPreviewEngine({ ...base, sandboxEnabled: true }),
    selectPreviewEngine({ ...base, sandboxEnabled: false }),
    selectPreviewEngine({ ...base, sandboxEnabled: false, staticRuntime: true, webContainerEnabled: true }),
  ];
  for (const engine of engines) {
    assert.notEqual(engine, "webcontainer");
    assert.notEqual(engine, "srcdoc");
    assert.notEqual(engine, "static");
  }
});

test("without a sandbox there is no fake srcdoc/static engine", () => {
  assert.equal(
    selectPreviewEngine({ ...base, sandboxEnabled: false, staticRuntime: true }),
    "unavailable",
  );
});
