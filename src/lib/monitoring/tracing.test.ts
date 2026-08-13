import assert from "node:assert/strict";
import test from "node:test";
import { createTraceContext,parseTraceparent,traceparent } from "./tracing";

test("creates and parses valid W3C trace context", () => {
  const context = createTraceContext();
  assert.match(context.traceId, /^[a-f0-9]{32}$/);
  assert.match(context.spanId, /^[a-f0-9]{16}$/);
  assert.deepEqual(parseTraceparent(traceparent(context)), context);
});

test("preserves trace id and rotates span id for a child", () => {
  const parent = createTraceContext();
  const child = createTraceContext(parent);
  assert.equal(child.traceId, parent.traceId);
  assert.notEqual(child.spanId, parent.spanId);
});

test("rejects malformed and zero identifiers", () => {
  assert.equal(parseTraceparent("invalid"), null);
  assert.equal(parseTraceparent("00-00000000000000000000000000000000-0000000000000000-01"), null);
});
