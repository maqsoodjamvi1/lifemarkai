import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_SYSTEM_PROMPT } from "./chat.ts";
import { PLAN_SYSTEM_PROMPT } from "./plan.ts";
import { buildStaticGenerationPrompt } from "./static-build.ts";
import { SUPABASE_BACKEND_PROMPT } from "./backend-supabase.ts";

test("chat and plan prompts stay focused and mode-specific", () => {
  assert.ok(CHAT_SYSTEM_PROMPT.length < 2_500);
  assert.ok(PLAN_SYSTEM_PROMPT.length < 1_500);
  assert.match(CHAT_SYSTEM_PROMPT, /Mode: Chat/);
  assert.doesNotMatch(CHAT_SYSTEM_PROMPT, /PLAN_READY/);
  assert.match(PLAN_SYSTEM_PROMPT, /PLAN_READY/);
  assert.doesNotMatch(PLAN_SYSTEM_PROMPT, /files array/);
});

test("static build prompt keeps the actual request at the attention edge", () => {
  const request = "Build a calm landing page for a dental practice";
  const prompt = buildStaticGenerationPrompt(request, []);
  assert.match(prompt, /plain HTML, CSS, and JavaScript only/);
  assert.ok(prompt.endsWith(request));
});

test("Supabase backend instructions are isolated from frontend mode prompts", () => {
  assert.match(SUPABASE_BACKEND_PROMPT, /Enable RLS/);
  assert.doesNotMatch(CHAT_SYSTEM_PROMPT, /service-role/);
  assert.doesNotMatch(PLAN_SYSTEM_PROMPT, /service-role/);
});
