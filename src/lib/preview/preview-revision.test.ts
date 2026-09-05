import assert from "node:assert/strict";
import test from "node:test";
import { attachPreviewRevision, isPreviewFrameMessage } from "./preview-revision.ts";

test("revision changes update the observer module without rewriting the entry", () => {
  const initial = attachPreviewRevision([{ path: "vite.config.ts", content: "custom" }, { path: "index.html", content: "<body><div id='root'></div></body>" }], "first");
  const updated = attachPreviewRevision(initial.files, "second");
  assert.equal(initial.requiresReload, false);
  assert.equal(updated.files.find((f) => f.path === "index.html")?.content, initial.files.find((f) => f.path === "index.html")?.content);
  assert.match(updated.files.find((f) => f.path === "__lifemark_preview_revision.js")!.content, /second/);
});
test("paint evidence must come from the current window and origin", () => {
  const frame = {} as Window;
  assert.equal(isPreviewFrameMessage({ source: frame, origin: "https://preview.test" }, frame, "https://preview.test/path"), true);
  assert.equal(isPreviewFrameMessage({ source: {} as Window, origin: "https://preview.test" }, frame, "https://preview.test"), false);
  assert.equal(isPreviewFrameMessage({ source: frame, origin: "https://other.test" }, frame, "https://preview.test"), false);
  assert.equal(isPreviewFrameMessage({ source: null, origin: "https://preview.test" }, null, "https://preview.test"), false);
});
