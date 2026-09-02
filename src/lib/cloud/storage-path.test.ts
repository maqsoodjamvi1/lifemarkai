import assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeBucketName, isSafeObjectPath } from "./storage-path.ts";

test("isSafeBucketName accepts typical Supabase bucket ids", () => {
  assert.equal(isSafeBucketName("avatars"), true);
  assert.equal(isSafeBucketName("public-assets"), true);
});

test("isSafeBucketName rejects empty or traversal names", () => {
  assert.equal(isSafeBucketName(""), false);
  assert.equal(isSafeBucketName("../etc"), false);
  assert.equal(isSafeBucketName("Has Caps"), false);
});

test("isSafeObjectPath blocks traversal", () => {
  assert.equal(isSafeObjectPath("folder/file.png"), true);
  assert.equal(isSafeObjectPath("../secret"), false);
  assert.equal(isSafeObjectPath("/abs"), false);
});
