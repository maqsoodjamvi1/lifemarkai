import test from "node:test";
import assert from "node:assert/strict";
import { resolvePromptMode } from "./editor-intelligence.ts";

test("resolvePromptMode keeps hello in chat on an empty project", () => {
  const mode = resolvePromptMode("hello", {
    fileCount: 0,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "build",
  });

  assert.equal(mode, "chat");
});

test("resolvePromptMode keeps vague website request in chat on an empty project", () => {
  const mode = resolvePromptMode("build a website", {
    fileCount: 0,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "build",
  });

  assert.equal(mode, "chat");
});

test("resolvePromptMode allows build when a specific feature is described", () => {
  const mode = resolvePromptMode("build a website with a product catalog and checkout", {
    fileCount: 0,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "build",
  });

  assert.equal(mode, "build");
});

test("resolvePromptMode allows explicit build slash command even on empty project", () => {
  const mode = resolvePromptMode("/build a website", {
    fileCount: 0,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "build",
  });

  assert.equal(mode, "build");
});
