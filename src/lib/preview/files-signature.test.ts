import assert from "node:assert/strict";
import { test } from "node:test";
import { filesContentSignature, previewFileText } from "./files-signature.ts";

test("previewFileText never throws on circular values", () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.equal(typeof previewFileText(circular), "string");
  assert.equal(previewFileText(undefined), "");
  assert.equal(previewFileText("src/App.tsx"), "src/App.tsx");
});

test("filesContentSignature accepts missing paths without throwing", () => {
  const sig = filesContentSignature([
    { path: undefined as unknown as string, content: "x" },
    { path: "b.tsx", content: "y" },
    { path: "a.tsx", content: null as unknown as string },
  ]);
  assert.equal(typeof sig, "string");
  assert.ok(sig.includes("a.tsx"));
  assert.ok(sig.includes("b.tsx"));
});
