import assert from "node:assert/strict";
import test from "node:test";
import { ClientGenerationCancelled, createStreamSink, isClientGenerationCancelled } from "./sse-stream.ts";

test("createStreamSink enqueues and closes an active stream", () => {
  const chunks: Uint8Array[] = [];
  let closed = false;
  const controller = {
    enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    close: () => { closed = true; },
  } as unknown as ReadableStreamDefaultController<Uint8Array>;
  const sink = createStreamSink(controller, new TextEncoder(), new AbortController().signal);

  assert.equal(sink.safeEnqueue(new Uint8Array([1, 2])), true);
  sink.safeClose();

  assert.equal(chunks.length, 1);
  assert.equal(closed, true);
  assert.equal(sink.isClientGone(), true);
  assert.equal(sink.safeEnqueue(new Uint8Array([3])), false);
});

test("createStreamSink stops writing after client abort", () => {
  let disconnects = 0;
  let enqueueCalls = 0;
  const controller = {
    enqueue: () => { enqueueCalls += 1; },
    close: () => undefined,
  } as unknown as ReadableStreamDefaultController<Uint8Array>;
  const abortController = new AbortController();
  const sink = createStreamSink(
    controller,
    new TextEncoder(),
    abortController.signal,
    () => { disconnects += 1; },
  );

  abortController.abort();

  assert.equal(sink.isClientGone(), true);
  assert.equal(sink.safeEnqueue(new Uint8Array([1])), false);
  assert.equal(enqueueCalls, 0);
  assert.equal(disconnects, 1);
});

test("ClientGenerationCancelled is detected after Stop", () => {
  assert.equal(isClientGenerationCancelled(new ClientGenerationCancelled()), true);
  assert.equal(isClientGenerationCancelled(new Error("CLIENT_CANCELLED")), false);
});
