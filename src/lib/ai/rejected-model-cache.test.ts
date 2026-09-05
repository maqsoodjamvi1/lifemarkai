import assert from "node:assert/strict";
import test from "node:test";
import { createRejectedModelCache } from "./rejected-model-cache.ts";

test("rejected models are skipped temporarily, then retried", () => {
  let now = 0;
  const cache = createRejectedModelCache(() => now, 100);
  cache.add("unavailable");
  assert.equal(cache.has("unavailable"), true);
  assert.equal(cache.has("working"), false);
  now = 100;
  assert.equal(cache.has("unavailable"), false);
});

test("negative cache is bounded and refreshes repeated rejections", () => {
  const cache = createRejectedModelCache(() => 0, 100, 2);
  cache.add("first"); cache.add("second"); cache.add("first"); cache.add("third");
  assert.equal(cache.has("first"), true);
  assert.equal(cache.has("second"), false);
  assert.equal(cache.has("third"), true);
});
