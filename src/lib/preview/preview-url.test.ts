import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPreviewUrl, resolveEditorPreviewSrc } from "./preview-url.ts";

test("buildPreviewUrl uses same-origin /preview/:id when no public origin is set", () => {
  assert.equal(buildPreviewUrl({ projectId: "proj-1" }), "/preview/proj-1");
});

test("resolveEditorPreviewSrc prefers the sandbox tunnel over /preview", () => {
  assert.equal(
    resolveEditorPreviewSrc({
      projectId: "proj-1",
      sandboxOrigin: "https://sb.example.run",
      iframePath: "/about",
      pageOrigin: "http://localhost:3001",
    }),
    "https://sb.example.run/about",
  );
});

test("resolveEditorPreviewSrc is only the sandbox tunnel — never /preview", () => {
  assert.equal(
    resolveEditorPreviewSrc({
      projectId: "proj-1",
      sandboxOrigin: null,
      pageOrigin: "http://localhost:3001",
    }),
    null,
  );
});

test("resolveEditorPreviewSrc is null without a project or tunnel", () => {
  assert.equal(resolveEditorPreviewSrc({ pageOrigin: "http://localhost:3001" }), null);
});
