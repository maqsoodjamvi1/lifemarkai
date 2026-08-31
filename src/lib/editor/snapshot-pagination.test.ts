import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNextCursor, mergeSnapshotPage } from "./snapshot-pagination";

test("computeNextCursor returns null when the page came back short (no more pages)", () => {
  const rows = [{ id: "a", created_at: "2026-01-03T00:00:00Z" }, { id: "b", created_at: "2026-01-02T00:00:00Z" }];
  assert.equal(computeNextCursor(rows, 50), null);
});

test("computeNextCursor returns null for an empty page", () => {
  assert.equal(computeNextCursor([], 50), null);
});

test("computeNextCursor returns the last row's created_at when the page was full", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({
    id: `s${i}`,
    created_at: `2026-01-${String(50 - i).padStart(2, "0")}T00:00:00Z`,
  }));
  assert.equal(computeNextCursor(rows, 50), "2026-01-01T00:00:00Z");
});

test("computeNextCursor is exact at the boundary (limit - 1 rows is not a full page)", () => {
  const rows = Array.from({ length: 49 }, (_, i) => ({ id: `s${i}`, created_at: "2026-01-01T00:00:00Z" }));
  assert.equal(computeNextCursor(rows, 50), null);
});

test("mergeSnapshotPage appends new rows after the existing list, preserving order", () => {
  const existing = [{ id: "a" }, { id: "b" }];
  const incoming = [{ id: "c" }, { id: "d" }];
  assert.deepEqual(mergeSnapshotPage(existing, incoming), [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);
});

test("mergeSnapshotPage drops rows already present in the existing list", () => {
  const existing = [{ id: "a" }, { id: "b" }];
  const incoming = [{ id: "b" }, { id: "c" }];
  assert.deepEqual(mergeSnapshotPage(existing, incoming), [{ id: "a" }, { id: "b" }, { id: "c" }]);
});

test("mergeSnapshotPage handles an empty incoming page (already at the end)", () => {
  const existing = [{ id: "a" }];
  assert.deepEqual(mergeSnapshotPage(existing, []), [{ id: "a" }]);
});

test("mergeSnapshotPage handles an empty existing list (first page load)", () => {
  const incoming = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(mergeSnapshotPage([], incoming), incoming);
});
