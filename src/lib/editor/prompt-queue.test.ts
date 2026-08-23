import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPromptQueue,
  enqueuePrompt,
  dequeuePrompt,
  removePrompt,
  reorderPrompt,
} from "./prompt-queue.ts";

test("enqueue and dequeue FIFO by default", () => {
  let q = createPromptQueue();
  q = enqueuePrompt(q, "first");
  q = enqueuePrompt(q, "second");
  const a = dequeuePrompt(q);
  assert.equal(a.next?.text, "first");
  const b = dequeuePrompt(a.rest);
  assert.equal(b.next?.text, "second");
  assert.equal(b.rest.length, 0);
});

test("higher priority sorts first", () => {
  let q = createPromptQueue();
  q = enqueuePrompt(q, "low", 0);
  q = enqueuePrompt(q, "high", 10);
  assert.equal(dequeuePrompt(q).next?.text, "high");
});

test("remove and reorder", () => {
  let q = createPromptQueue();
  q = enqueuePrompt(q, "a");
  q = enqueuePrompt(q, "b");
  q = enqueuePrompt(q, "c");
  const idB = q[1].id;
  q = removePrompt(q, idB);
  assert.equal(q.length, 2);
  q = reorderPrompt(q, q[1].id, "up");
  assert.equal(q[0].text, "c");
});
