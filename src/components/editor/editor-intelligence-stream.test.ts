import assert from "node:assert/strict";
import test from "node:test";
import { drainSseData } from "./editor-intelligence-stream";

test("keeps an incomplete SSE frame for the next chunk", () => {
  const result = drainSseData('data: {"type":"done"}');
  assert.deepEqual(result.data, []);
  assert.equal(result.remainder, 'data: {"type":"done"}');
});

test("flushes the final SSE event when the response closes without a blank line", () => {
  const result = drainSseData('data: {"type":"done"}', true);
  assert.deepEqual(result.data, ['{"type":"done"}']);
  assert.equal(result.remainder, "");
});

test("normalizes CRLF and combines multi-line SSE data", () => {
  const result = drainSseData("event: message\r\ndata: first\r\ndata: second\r\n\r\n");
  assert.deepEqual(result.data, ["first\nsecond"]);
  assert.equal(result.remainder, "");
});
