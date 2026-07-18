import assert from "node:assert/strict";
import test from "node:test";
import { createStreamedFilePathTracker } from "./stream-file-paths";

test("tracks file paths split across streaming chunks", () => {
  const tracker = createStreamedFilePathTracker();

  assert.equal(tracker.append('{"path":"src/App'), false);
  assert.equal(tracker.append('.tsx"}'), true);
  assert.deepEqual(tracker.getPaths(), ["src/App.tsx"]);
});

test("deduplicates paths and normalizes separators", () => {
  const tracker = createStreamedFilePathTracker();

  tracker.append('{"path":"\\\\src\\\\App.tsx"}');
  assert.equal(tracker.add("/src/App.tsx"), false);
  assert.deepEqual(tracker.getPaths(), ["src/App.tsx"]);
});

test("ignores name values that begin with a slash", () => {
  const tracker = createStreamedFilePathTracker();

  assert.equal(tracker.append('{"name":"/not-a-file"}'), false);
  assert.deepEqual(tracker.getPaths(), []);
});

test("ignores descriptive names but accepts root files", () => {
  const tracker = createStreamedFilePathTracker();

  assert.equal(tracker.append('{"name":"Marketing website"}'), false);
  assert.equal(tracker.append('{"name":"package.json"}'), true);
  assert.deepEqual(tracker.getPaths(), ["package.json"]);
});

test("tracks XML file updates as well as JSON file objects", () => {
  const tracker = createStreamedFilePathTracker();

  assert.equal(tracker.append('<file_update path="src/components/He'), false);
  assert.equal(tracker.append('ro.tsx">'), true);
  assert.deepEqual(tracker.getPaths(), ["src/components/Hero.tsx"]);
});
