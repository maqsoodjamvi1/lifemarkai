import assert from "node:assert/strict";
import { test } from "node:test";
import { LIVE_STREAM_CONTENT_MAX, streamedFileEventToUpdate } from "./streamed-file-event.ts";

test("streamedFileEventToUpdate applies JSON build file content", () => {
  const update = streamedFileEventToUpdate({
    streamedFile: "src/App.tsx",
    content: "export default function App() { return null; }",
    language: "tsx",
  });
  assert.deepEqual(update, {
    path: "src/App.tsx",
    kind: "full",
    content: "export default function App() { return null; }",
    language: "tsx",
  });
});

test("streamedFileEventToUpdate ignores path-only events (no live content)", () => {
  assert.equal(streamedFileEventToUpdate({ streamedFile: "src/App.tsx" }), null);
});

test("streamedFileEventToUpdate skips oversized payloads", () => {
  assert.equal(
    streamedFileEventToUpdate({
      streamedFile: "src/huge.ts",
      content: "x".repeat(LIVE_STREAM_CONTENT_MAX + 1),
    }),
    null,
  );
});
