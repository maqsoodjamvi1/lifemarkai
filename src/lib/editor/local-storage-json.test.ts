import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readJSON, readString, writeJSON, writeString, removeKey } from "./local-storage-json.ts";

// No jsdom in this test runner — stub a minimal localStorage on globalThis.
function withStubbedStorage<T>(run: (store: Map<string, string>) => T): T {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { localStorage?: unknown; window?: unknown };
  const prevStorage = g.localStorage;
  const prevWindow = g.window;
  g.window = {};
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  try {
    return run(store);
  } finally {
    g.localStorage = prevStorage;
    g.window = prevWindow;
  }
}

test("readJSON returns the fallback for a missing key, and the parsed value once written", () => {
  withStubbedStorage(() => {
    assert.deepEqual(readJSON("k", ["fallback"]), ["fallback"]);
    writeJSON("k", ["a", "b"]);
    assert.deepEqual(readJSON("k", []), ["a", "b"]);
  });
});

test("readJSON falls back on corrupt JSON instead of throwing", () => {
  withStubbedStorage((store) => {
    store.set("k", "{not json");
    assert.deepEqual(readJSON("k", { safe: true }), { safe: true });
  });
});

test("readString / writeString / removeKey round-trip a raw string", () => {
  withStubbedStorage(() => {
    assert.equal(readString("k"), null);
    writeString("k", "hello");
    assert.equal(readString("k"), "hello");
    removeKey("k");
    assert.equal(readString("k"), null);
  });
});

test("writes no-op instead of throwing when localStorage.setItem throws (private mode / quota)", () => {
  const g = globalThis as unknown as { localStorage?: unknown; window?: unknown };
  const prevStorage = g.localStorage;
  const prevWindow = g.window;
  g.window = {};
  g.localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
    removeItem: () => { throw new Error("nope"); },
  };
  try {
    assert.doesNotThrow(() => writeJSON("k", { a: 1 }));
    assert.doesNotThrow(() => writeString("k", "x"));
    assert.doesNotThrow(() => removeKey("k"));
  } finally {
    g.localStorage = prevStorage;
    g.window = prevWindow;
  }
});

test("all reads fall back to their default when window is undefined (SSR)", () => {
  const g = globalThis as unknown as { window?: unknown };
  const prevWindow = g.window;
  delete g.window;
  try {
    assert.deepEqual(readJSON("k", { ssr: true }), { ssr: true });
    assert.equal(readString("k", "default"), "default");
  } finally {
    g.window = prevWindow;
  }
});
