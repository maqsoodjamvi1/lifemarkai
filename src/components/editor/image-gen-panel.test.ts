import assert from "node:assert/strict";
import test from "node:test";
import { extensionForDataUrl } from "./image-gen-panel.tsx";

// Regression coverage for the image-persistence fix: generated images used to
// live only in React state (never written to project_files, never shown in
// the Media gallery, lost on reload). Persisting derives a project_files
// path from the data: URL's declared mime type — this is the part of that
// fix with no network/DB dependency, so it's covered directly.
test("extensionForDataUrl maps common image mime types to file extensions", () => {
  assert.equal(extensionForDataUrl("data:image/png;base64,AAAA"), "png");
  assert.equal(extensionForDataUrl("data:image/jpeg;base64,AAAA"), "jpg");
  assert.equal(extensionForDataUrl("data:image/webp;base64,AAAA"), "webp");
});

test("extensionForDataUrl defaults to png for an unrecognized or malformed URL", () => {
  assert.equal(extensionForDataUrl("https://example.com/generated.png"), "png");
  assert.equal(extensionForDataUrl("not a data url"), "png");
});
