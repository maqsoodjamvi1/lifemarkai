import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessProjectBackend,
  canReadProjectFiles,
  canWriteProjectFiles,
} from "./access.ts";

test("viewers can read files and Cloud data, not write", () => {
  assert.equal(canReadProjectFiles("viewer"), true);
  assert.equal(canAccessProjectBackend("viewer"), true);
  assert.equal(canWriteProjectFiles("viewer"), false);
});

test("editors can write Cloud data", () => {
  assert.equal(canWriteProjectFiles("editor"), true);
  assert.equal(canAccessProjectBackend("editor"), true);
});

test("public-link visitors cannot open Cloud Database", () => {
  assert.equal(canReadProjectFiles("public"), true);
  assert.equal(canAccessProjectBackend("public"), false);
  assert.equal(canWriteProjectFiles("public"), false);
});
