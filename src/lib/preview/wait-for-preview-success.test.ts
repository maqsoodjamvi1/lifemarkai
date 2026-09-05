import assert from "node:assert/strict";
import test from "node:test";
import {
  announcePreviewSettled,
  clearPreviewSettled,
  waitForPreviewSuccess,
} from "./wait-for-preview-success.ts";

test("waitForPreviewSuccess accepts a settle that landed milliseconds earlier", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  announcePreviewSettled(true, host);
  assert.equal(await waitForPreviewSuccess(2_000, host), true);
  clearPreviewSettled();
});

test("waitForPreviewSuccess resolves on lifemark-preview-settled ok", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  const pending = waitForPreviewSuccess(2_000, host);
  host.dispatchEvent(new CustomEvent("lifemark-preview-settled", { detail: { ok: true } }));
  assert.equal(await pending, true);
});

test("waitForPreviewSuccess ignores settled ok:false and still accepts a later success", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  const pending = waitForPreviewSuccess(2_000, host);
  host.dispatchEvent(new CustomEvent("lifemark-preview-settled", { detail: { ok: false } }));
  host.dispatchEvent(new CustomEvent("lifemark-preview-settled", { detail: { ok: true } }));
  assert.equal(await pending, true);
});

test("waitForPreviewSuccess rejects unvalidated iframe success postMessage", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  const pending = waitForPreviewSuccess(20, host);
  host.dispatchEvent(
    new MessageEvent("message", {
      data: { source: "lifemark-preview", type: "success" },
    }),
  );
  assert.equal(await pending, false);
});

test("waitForPreviewSuccess times out when neither signal arrives", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  assert.equal(await waitForPreviewSuccess(20, host), false);
});

test("waitForPreviewSuccess with notBeforeMs ignores a settle from the previous generation", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  announcePreviewSettled(true, host);
  const notBefore = Date.now() + 5_000;
  assert.equal(await waitForPreviewSuccess(30, host, notBefore), false);
  clearPreviewSettled();
});

test("waitForPreviewSuccess with notBeforeMs ignores an early iframe success postMessage", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  const notBefore = Date.now() + 5_000;
  const pending = waitForPreviewSuccess(40, host, notBefore);
  host.dispatchEvent(
    new MessageEvent("message", {
      data: { source: "lifemark-preview", type: "success" },
    }),
  );
  assert.equal(await pending, false);
  clearPreviewSettled();
});

test("waitForPreviewSuccess does not treat sandbox lifecycle as rendered content", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  const pending = waitForPreviewSuccess(20, host);
  host.dispatchEvent(new CustomEvent("lifemark-preview-lifecycle", { detail: { lifecycle: "ready" } }));
  assert.equal(await pending, false);
});

test("waitForPreviewSuccess with notBeforeMs ignores a stale lifecycle ready", async () => {
  const host = new EventTarget();
  clearPreviewSettled();
  const notBefore = Date.now() + 5_000;
  const pending = waitForPreviewSuccess(40, host, notBefore);
  host.dispatchEvent(new CustomEvent("lifemark-preview-lifecycle", { detail: { lifecycle: "ready" } }));
  assert.equal(await pending, false);
});
