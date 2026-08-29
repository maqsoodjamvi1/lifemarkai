import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToAnnotation, signature, diffForSync, type Annotation } from "./pin-annotations";

test("rowToAnnotation returns null for a non-pin comment (no pin_x/pin_y)", () => {
  const row = {
    id: "row-1",
    content: "just a thread comment",
    created_at: "2026-01-01T00:00:00Z",
    resolved: false,
  };
  assert.equal(rowToAnnotation(row), null);
});

test("rowToAnnotation maps a pin row, preferring client_id over the server id", () => {
  const row = {
    id: "server-uuid",
    client_id: "ann_123",
    pin_x: 42.5,
    pin_y: 10,
    pin_color: "blue",
    content: "fix this button",
    created_at: "2026-01-01T00:00:00Z",
    resolved: false,
  };
  const ann = rowToAnnotation(row);
  assert.deepEqual(ann, {
    id: "ann_123",
    x: 42.5,
    y: 10,
    text: "fix this button",
    color: "blue",
    createdAt: "2026-01-01T00:00:00Z",
    resolved: false,
  });
});

test("rowToAnnotation falls back to the server id when client_id is missing", () => {
  const row = {
    id: "server-uuid",
    client_id: null,
    pin_x: 1,
    pin_y: 2,
    content: "note",
    created_at: "2026-01-01T00:00:00Z",
    resolved: false,
  };
  assert.equal(rowToAnnotation(row)?.id, "server-uuid");
});

test("rowToAnnotation defaults pin_color to yellow when unset", () => {
  const row = {
    id: "server-uuid",
    pin_x: 1,
    pin_y: 2,
    content: "note",
    created_at: "2026-01-01T00:00:00Z",
    resolved: false,
  };
  assert.equal(rowToAnnotation(row)?.color, "yellow");
});

test("rowToAnnotation treats pin_x: 0 as a real pin, not a missing one", () => {
  // A pin at the very left edge (x=0) must not be mistaken for "no pin".
  const row = {
    id: "server-uuid",
    pin_x: 0,
    pin_y: 0,
    content: "top-left corner",
    created_at: "2026-01-01T00:00:00Z",
    resolved: false,
  };
  const ann = rowToAnnotation(row);
  assert.notEqual(ann, null);
  assert.equal(ann?.x, 0);
  assert.equal(ann?.y, 0);
});

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "ann_1",
    x: 10,
    y: 20,
    text: "hello",
    color: "yellow",
    createdAt: "2026-01-01T00:00:00Z",
    resolved: false,
    ...overrides,
  };
}

test("signature changes when any synced field changes", () => {
  const a = makeAnnotation();
  const b = makeAnnotation({ text: "different" });
  assert.notEqual(signature(a), signature(b));
});

test("signature is stable across unrelated field changes (createdAt/id aren't part of it)", () => {
  const a = makeAnnotation({ id: "ann_1", createdAt: "2026-01-01T00:00:00Z" });
  const b = makeAnnotation({ id: "ann_2", createdAt: "2026-06-01T00:00:00Z" });
  assert.equal(signature(a), signature(b));
});

test("diffForSync sends a brand-new annotation as an upsert", () => {
  const ann = makeAnnotation();
  const { toUpsert, toDeleteIds } = diffForSync([ann], new Map());
  assert.deepEqual(toUpsert, [ann]);
  assert.deepEqual(toDeleteIds, []);
});

test("diffForSync skips an annotation whose signature already matches", () => {
  const ann = makeAnnotation();
  const synced = new Map([[ann.id, signature(ann)]]);
  const { toUpsert, toDeleteIds } = diffForSync([ann], synced);
  assert.deepEqual(toUpsert, []);
  assert.deepEqual(toDeleteIds, []);
});

test("diffForSync re-upserts an annotation whose text changed since last sync", () => {
  const original = makeAnnotation();
  const synced = new Map([[original.id, signature(original)]]);
  const edited = makeAnnotation({ text: "edited text" });
  const { toUpsert, toDeleteIds } = diffForSync([edited], synced);
  assert.deepEqual(toUpsert, [edited]);
  assert.deepEqual(toDeleteIds, []);
});

test("diffForSync deletes an id that was synced but is no longer present", () => {
  const ann = makeAnnotation();
  const synced = new Map([[ann.id, signature(ann)]]);
  const { toUpsert, toDeleteIds } = diffForSync([], synced);
  assert.deepEqual(toUpsert, []);
  assert.deepEqual(toDeleteIds, [ann.id]);
});

test("diffForSync handles a mix of new, unchanged, changed, and deleted in one pass", () => {
  const unchanged = makeAnnotation({ id: "unchanged" });
  const changedBefore = makeAnnotation({ id: "changed", text: "before" });
  const changedAfter = makeAnnotation({ id: "changed", text: "after" });
  const deleted = makeAnnotation({ id: "deleted" });
  const brandNew = makeAnnotation({ id: "new" });

  const synced = new Map([
    [unchanged.id, signature(unchanged)],
    [changedBefore.id, signature(changedBefore)],
    [deleted.id, signature(deleted)],
  ]);

  const { toUpsert, toDeleteIds } = diffForSync([unchanged, changedAfter, brandNew], synced);
  assert.deepEqual(new Set(toUpsert.map((a) => a.id)), new Set(["changed", "new"]));
  assert.deepEqual(toDeleteIds, ["deleted"]);
});
