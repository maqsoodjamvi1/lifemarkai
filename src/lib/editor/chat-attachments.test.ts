import { test } from "node:test";
import assert from "node:assert/strict";
import { appendAttachedFile, combineAttachedFiles, MAX_ATTACHED_FILES } from "./chat-attachments";

test("combineAttachedFiles returns null for an empty tray", () => {
  assert.equal(combineAttachedFiles([]), null);
});

test("combineAttachedFiles returns the single file as-is (byte-identical to the old single-slot shape)", () => {
  const file = { name: "notes.txt", content: "hello world" };
  assert.deepEqual(combineAttachedFiles([file]), file);
});

test("combineAttachedFiles merges multiple files into one document with per-file headers", () => {
  const merged = combineAttachedFiles([
    { name: "a.txt", content: "AAA" },
    { name: "b.txt", content: "BBB" },
  ]);
  assert.equal(merged?.name, "2 files");
  assert.ok(merged?.content.includes("--- a.txt ---\nAAA"));
  assert.ok(merged?.content.includes("--- b.txt ---\nBBB"));
  // a.txt's block comes before b.txt's — order is preserved, not shuffled.
  assert.ok((merged?.content.indexOf("a.txt") ?? -1) < (merged?.content.indexOf("b.txt") ?? -1));
});

test("combineAttachedFiles keeps each file's content distinguishable even with duplicate names", () => {
  const merged = combineAttachedFiles([
    { name: "index.ts", content: "// from src/a" },
    { name: "index.ts", content: "// from src/b" },
  ]);
  assert.ok(merged?.content.includes("// from src/a"));
  assert.ok(merged?.content.includes("// from src/b"));
});

test("appendAttachedFile adds to an empty tray", () => {
  const result = appendAttachedFile([], { name: "one.txt", content: "1" });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { name: "one.txt", content: "1" });
});

test("appendAttachedFile refuses to exceed the cap, returning the tray unchanged", () => {
  const full = Array.from({ length: MAX_ATTACHED_FILES }, (_, i) => ({ name: `f${i}.txt`, content: String(i) }));
  const result = appendAttachedFile(full, { name: "overflow.txt", content: "x" });
  assert.equal(result.length, MAX_ATTACHED_FILES);
  assert.deepEqual(result, full);
  // Same array reference is fine either way, but content must be unchanged —
  // specifically the overflow file must NOT appear anywhere in the result.
  assert.ok(!result.some((f) => f.name === "overflow.txt"));
});

test("appendAttachedFile allows exactly up to the cap", () => {
  let files: { name: string; content: string }[] = [];
  for (let i = 0; i < MAX_ATTACHED_FILES; i++) {
    files = appendAttachedFile(files, { name: `f${i}.txt`, content: String(i) });
  }
  assert.equal(files.length, MAX_ATTACHED_FILES);
  const rejected = appendAttachedFile(files, { name: "one-too-many.txt", content: "x" });
  assert.equal(rejected.length, MAX_ATTACHED_FILES);
});

test("appendAttachedFile respects a custom max", () => {
  const result = appendAttachedFile([{ name: "a", content: "1" }], { name: "b", content: "2" }, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "a");
});
