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

test("resolvePromptMode keeps thanks in chat on build tab after real work exists", () => {
  const mode = resolvePromptMode("thanks!", {
    fileCount: 3,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "build",
  });

  assert.equal(mode, "chat");
});

test("resolvePromptMode keeps hello in chat on build tab after real work exists", () => {
  const mode = resolvePromptMode("hello", {
    fileCount: 5,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "build",
  });

  assert.equal(mode, "chat");
});

test("resolvePromptMode builds ERP when explicitly requested on greenfield", () => {
  const mode = resolvePromptMode("create an erp for my warehouse", {
    fileCount: 0,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "build",
  });

  assert.equal(mode, "build");
});

test("resolvePromptMode promotes explicit ERP from chat tab to build", () => {
  const mode = resolvePromptMode("create an erp for inventory", {
    fileCount: 0,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "chat",
  });

  assert.equal(mode, "build");
});

test("resolvePromptMode keeps vague website request in chat tab on greenfield", () => {
  const mode = resolvePromptMode("build a website", {
    fileCount: 0,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "chat",
  });

  assert.equal(mode, "chat");
});

test("resolvePromptMode keeps informational questions on build tab in chat", () => {
  const mode = resolvePromptMode("why is the cart empty?", {
    fileCount: 4,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "build",
  });

  assert.equal(mode, "chat");
});

test("resolvePromptMode uses full-file build output for an automatic chat edit", () => {
  const mode = resolvePromptMode("change the hero title to Welcome", {
    fileCount: 8,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "chat",
  });

  assert.equal(mode, "build");
});

test("resolvePromptMode preserves explicitly selected patch mode", () => {
  const mode = resolvePromptMode("change the hero title to Welcome", {
    fileCount: 8,
    hasPreviewError: false,
    hasCredits: true,
    currentMode: "patch",
  });

  assert.equal(mode, "patch");
});

test("shouldClarifyBeforeBuild triggers for new ERP request", async () => {
  const { shouldClarifyBeforeBuild } = await import("./build-intent.ts");
  assert.equal(
    shouldClarifyBeforeBuild("create an erp for inventory", 0),
    true,
  );
  assert.equal(
    shouldClarifyBeforeBuild("create an erp for inventory", 0, { userOptOut: true }),
    false,
  );
  assert.equal(shouldClarifyBeforeBuild("hello", 0), false);
});

test("shouldClarifyBeforeBuild triggers on a verb-less description of a new app (confirmed live bug)", async () => {
  // The dashboard's own prompt box is labeled "Describe the app you want to
  // build" beside a button labeled "Build" — real users routinely type a
  // bare noun-phrase description with no "build"/"create"/"make" verb at
  // all, because the surrounding UI already established the intent. This
  // exact prompt reproduced live: Clarify silently never fired on it and the
  // project went straight to a full build with zero design/scope questions.
  const { shouldClarifyBeforeBuild } = await import("./build-intent.ts");
  assert.equal(
    shouldClarifyBeforeBuild(
      "A fitness coaching landing page for a personal trainer, with a hero, pricing plans, and a booking form",
      0,
    ),
    true,
  );
  // Still correctly skips non-build content on a fresh project.
  assert.equal(shouldClarifyBeforeBuild("what does this button do?", 0), false);
  assert.equal(shouldClarifyBeforeBuild("thanks!", 0), false);
  assert.equal(shouldClarifyBeforeBuild("", 0), false);
});
