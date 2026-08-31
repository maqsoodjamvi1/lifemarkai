import { strict as assert } from "node:assert";
import { test } from "node:test";
import { dispatch, listen } from "./preview-events.ts";
import type { PreviewEventName } from "./preview-events.ts";

/**
 * Every `lifemark-*` window event name actually dispatched or listened for
 * in src/components/editor today, as of this file's writing — found via:
 *
 *   grep -rn "dispatchEvent(new CustomEvent(\"lifemark-\|addEventListener(\"lifemark-" src/components/editor
 *
 * This list exists so preview-events.ts's registry can't silently drift
 * from reality: adding a 30th event to the real code without adding it
 * here just means the registry is incomplete (not wrong), but REMOVING or
 * TYPO'ING an entry in the registry breaks this test immediately, since
 * TypeScript won't let `KNOWN_EVENT_NAMES` contain a name that isn't a key
 * of PreviewEventPayloads.
 */
const KNOWN_EVENT_NAMES: PreviewEventName[] = [
  "lifemark-preview-status",
  "lifemark-preview-path",
  "lifemark-preview-pages",
  "lifemark-live-preview-url",
  "lifemark-preview-history",
  "lifemark-preview-device",
  "lifemark-preview-navigate",
  "lifemark-refresh-preview",
  "lifemark-exit-version-preview",
  "lifemark-preview-version",
  "lifemark-preview-heal-start",
  "lifemark-preview-heal-done",
  "lifemark-preview-heal-failed",
  "lifemark-preview-settled",
  "lifemark-preview-reverting",
  "lifemark-show-preview-toolbar",
  "lifemark-request-screenshot",
  "lifemark-screenshot-ready",
  "lifemark-jump-to-comment-element",
  "lifemark-preview-annotations-clear",
  "lifemark-preview-annotations-undo",
  "lifemark-preview-annotations-redo",
  "lifemark-preview-annotations-meta",
  "lifemark-free-edit-quota",
  "lifemark-files-changed",
  "lifemark-intelligence-done",
  "lifemark-intelligence-run",
  "lifemark-deploy-started",
  "lifemark-open-file-at-line",
  "lifemark-open-diff",
  "lifemark-seed-browser-tests",
];

test("the registry lists exactly 31 known events (update this count deliberately, not by accident)", () => {
  assert.equal(KNOWN_EVENT_NAMES.length, 31);
});

test("the registry has no duplicate event names", () => {
  assert.equal(new Set(KNOWN_EVENT_NAMES).size, KNOWN_EVENT_NAMES.length);
});

// No jsdom in this test runner — stub a minimal window/CustomEvent.
function withStubbedWindow<T>(run: () => T): T {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const g = globalThis as unknown as { window?: unknown; CustomEvent?: unknown };
  const prevWindow = g.window;
  const prevCustomEvent = g.CustomEvent;
  class StubCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  g.CustomEvent = StubCustomEvent;
  g.window = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (e: { type: string }) => {
      for (const fn of listeners.get(e.type) ?? []) fn(e);
    },
  };
  try {
    return run();
  } finally {
    g.window = prevWindow;
    g.CustomEvent = prevCustomEvent;
  }
}

test("dispatch/listen round-trip a payload for an event with a detail", () => {
  withStubbedWindow(() => {
    let received: unknown;
    const stop = listen("lifemark-preview-history", (detail) => { received = detail; });
    dispatch("lifemark-preview-history", { dir: "back" });
    assert.deepEqual(received, { dir: "back" });
    stop();
  });
});

test("dispatch/listen round-trip an event with no detail", () => {
  withStubbedWindow(() => {
    let calls = 0;
    const stop = listen("lifemark-preview-heal-start", () => { calls += 1; });
    dispatch("lifemark-preview-heal-start");
    assert.equal(calls, 1);
    stop();
  });
});

test("listen's cleanup function actually removes the listener", () => {
  withStubbedWindow(() => {
    let calls = 0;
    const stop = listen("lifemark-preview-heal-done", () => { calls += 1; });
    stop();
    dispatch("lifemark-preview-heal-done");
    assert.equal(calls, 0);
  });
});
