import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coerceMessageContent,
  getDisplayMessageContent,
  groupIntoThreads,
  previewSnippet,
  stripInternalChatContext,
} from "./message-utils.ts";
import type { Message } from "@/types/database";

test("coerceMessageContent does not throw on objects or null", () => {
  assert.equal(coerceMessageContent(null), "");
  assert.equal(coerceMessageContent({ message: "hi" }), '{"message":"hi"}');
  assert.equal(coerceMessageContent("hello"), "hello");
});

test("getDisplayMessageContent survives non-string content", () => {
  const text = getDisplayMessageContent({
    role: "assistant",
    content: { files: [{ path: "a.tsx" }] } as unknown as string,
    mode: "build",
  });
  assert.equal(typeof text, "string");
  assert.ok(text.length > 0);
});

test("previewSnippet and stripInternalChatContext accept missing content", () => {
  assert.equal(previewSnippet(undefined), "");
  assert.equal(stripInternalChatContext(null), "");
});

test("groupIntoThreads keeps clarify answers in the opening prompt's thread", () => {
  const msg = (id: string, role: Message["role"], clarify = false): Message =>
    ({
      id,
      project_id: "p",
      role,
      content: id,
      tokens_used: null,
      model: null,
      mode: "chat",
      metadata: clarify ? { clarify: true } : null,
      rating: null,
      created_at: new Date().toISOString(),
    }) as Message;
  const threads = groupIntoThreads([
    msg("hello", "user"),
    msg("q1", "assistant", true),
    msg("a1", "user", true),
    msg("q2", "assistant", true),
    msg("edit", "user"),
  ]);
  assert.equal(threads.length, 2);
  assert.deepEqual(threads[0]?.map((m) => m.id), ["hello", "q1", "a1", "q2"]);
  assert.deepEqual(threads[1]?.map((m) => m.id), ["edit"]);
});
