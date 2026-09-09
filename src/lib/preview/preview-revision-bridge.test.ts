import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { PREVIEW_REVISION_BRIDGE } from "./preview-revision-bridge.ts";

function guest() {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const frames: Array<() => void> = [];
  const messages: unknown[] = [];
  const parent = { postMessage: (message: unknown) => messages.push(message) };
  const window = { parent, addEventListener: (type: string, fn: (event: Record<string, unknown>) => void) => handlers.set(type, fn) };
  const root = { querySelectorAll: () => [1], innerText: "Bakery", getBoundingClientRect: () => ({ height: 100 }) };
  runInNewContext(PREVIEW_REVISION_BRIDGE, {
    window,
    document: { body: root, getElementById: () => null, querySelector: () => null },
    requestAnimationFrame: (fn: () => void) => frames.push(fn),
  });
  return {
    emit: (type: string, data: Record<string, unknown> = {}) => handlers.get(type)?.(data),
    challenge: (revision: string) => handlers.get("message")?.({ source: parent, data: { type: "lifemark-preview-verify-revision", revision } }),
    paint: () => { while (frames.length) frames.shift()!(); },
    messages,
  };
}

test("a hidden frame cannot acknowledge before painting; a renewed challenge can finish later", () => {
  const g = guest();
  g.emit("lifemark-preview-revision", { detail: "a" });
  g.emit("load");
  g.challenge("a");
  assert.equal(g.messages.length, 0);
  g.challenge("a");
  g.paint();
  assert.ok(g.messages.length > 0);
  assert.equal((g.messages[0] as { revision: string }).revision, "a");
});

test("revision receipt and an errored update are not paint success", () => {
  const g = guest();
  g.emit("lifemark-preview-revision", { detail: "a" });
  g.challenge("a");
  g.paint();
  assert.equal(g.messages.length, 0);
  g.emit("lifemark-preview-update-error");
  g.emit("lifemark-preview-update-end");
  g.paint();
  assert.equal(g.messages.length, 0);
});

test("a newer revision cannot satisfy an old challenge", () => {
  const g = guest();
  g.emit("lifemark-preview-revision", { detail: "b" });
  g.emit("load");
  g.challenge("a");
  g.paint();
  assert.equal(g.messages.length, 0);
});
