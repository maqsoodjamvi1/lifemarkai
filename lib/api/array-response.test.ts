import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArrayResponse } from "./array-response";

test("normalizeArrayResponse accepts canonical bare arrays", () => {
  const projects = [{ id: "one" }];
  assert.deepEqual(normalizeArrayResponse(projects, "projects"), projects);
});

test("normalizeArrayResponse accepts legacy wrapped arrays", () => {
  const files = [{ path: "app/page.tsx" }];
  assert.deepEqual(normalizeArrayResponse({ files }, "files"), files);
});

test("normalizeArrayResponse rejects malformed payloads", () => {
  assert.deepEqual(normalizeArrayResponse(null, "files"), []);
  assert.deepEqual(normalizeArrayResponse({ files: "not-an-array" }, "files"), []);
});
