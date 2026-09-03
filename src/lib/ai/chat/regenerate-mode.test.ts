import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRegenerateMode } from "./regenerate-mode.ts";

test("regenerate rebuilds when the assistant actually wrote files", () => {
  assert.equal(
    resolveRegenerateMode({ userMode: "chat", assistantFilesChanged: ["src/App.tsx"] }),
    "build",
  );
});

test("regenerate keeps chat for a Q&A turn with no files", () => {
  assert.equal(
    resolveRegenerateMode({ userMode: "chat", assistantFilesChanged: [] }),
    "chat",
  );
});

test("regenerate keeps plan and agent when no files changed", () => {
  assert.equal(resolveRegenerateMode({ userMode: "plan" }), "plan");
  assert.equal(resolveRegenerateMode({ userMode: "agent" }), "agent");
});
