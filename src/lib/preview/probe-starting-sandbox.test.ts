import assert from "node:assert/strict";
import test from "node:test";
import { probeStartingSandbox } from "./probe-starting-sandbox.ts";

test("a running sandbox is promoted only after its app becomes ready", async () => {
  const base = { ok: true as const, sandboxId: "a", previewUrl: "https://preview.test" };
  assert.equal(await probeStartingSandbox("a", async () => ({ ...base, ready: false })), null);
  assert.equal(await probeStartingSandbox("a", async () => base), null);
  assert.deepEqual(await probeStartingSandbox("a", async () => ({ ...base, ready: true })), { ...base, ready: true });
  assert.equal(await probeStartingSandbox("b", async () => ({ ...base, ready: true })), null);
});

test("concurrent polls share a probe and a transient failure does not poison retries", async () => {
  let calls = 0;
  const fail = async () => { calls++; throw new Error("temporary socket failure"); };
  const first = probeStartingSandbox("concurrent", fail);
  const second = probeStartingSandbox("concurrent", fail);
  assert.equal(first, second);
  assert.deepEqual(await Promise.all([first, second]), [null, null]);
  assert.equal(calls, 1);
  await probeStartingSandbox("concurrent", fail);
  assert.equal(calls, 2);
});
