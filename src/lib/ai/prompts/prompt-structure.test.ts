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

// ── Prompt accuracy — the prompt must describe what the platform enforces ────
// Each assertion below pins a contradiction that actually shipped: a prompt
// telling the model one thing while the scaffold, installer, or parser did
// another. See lovable-vite-scaffold.ts renderViteSetupPrompt() and
// prompts/auto-fix.ts for the history.
import { buildGenerationPrompt, NEXT_APP_GENERATION_SYSTEM_PROMPT } from "../system-prompts.ts";
import { AUTO_FIX_EDITS_SYSTEM_PROMPT, AUTO_FIX_SYSTEM_PROMPT } from "./auto-fix.ts";
import { LOVABLE_VITE_DEPENDENCIES } from "../../templates/lovable-vite-scaffold.ts";

test("the react build prompt is rendered from the scaffold, not a drifted copy", () => {
  const prompt = buildGenerationPrompt("Build a bakery site", [], 80000, "react");
  // The exact versions project creation writes — the React pin above all,
  // because the old hand-written copy said ^18.3.1 against a React-19 base.
  assert.ok(prompt.includes(`"react": "${LOVABLE_VITE_DEPENDENCIES.react}"`));
  assert.doesNotMatch(prompt, /"react": "\^18/);
  // The real Vite plugin and the alias the import rules mandate.
  assert.match(prompt, /@vitejs\/plugin-react-swc/);
  assert.match(prompt, /"@": path\.resolve/);
  // tailwind.config.ts (TypeScript), never a .js template two sections after
  // the import rules demand .ts.
  assert.doesNotMatch(prompt, /### tailwind\.config\.js \(always generate/);
});

test("repair contracts match their parsers: files-only route vs edits-preferred loop", () => {
  // http/fix.ts parses only a files array — its prompt must not offer edits.
  assert.doesNotMatch(AUTO_FIX_SYSTEM_PROMPT, /"edits"/);
  // self-verify validates an edits batch first — its prompt must say so, and
  // must state the all-or-nothing anchor rule the parser enforces.
  assert.match(AUTO_FIX_EDITS_SYSTEM_PROMPT, /"edits"/);
  assert.match(AUTO_FIX_EDITS_SYSTEM_PROMPT, /all-or-nothing/);
  assert.match(AUTO_FIX_EDITS_SYSTEM_PROMPT, /VERBATIM/);
});

test("no prompt reopens the package allowlist it sits next to", () => {
  for (const prompt of [
    buildGenerationPrompt("Build a store", [], 80000, "react"),
    buildGenerationPrompt("Build a store", [], 80000, "tanstack-start"),
    NEXT_APP_GENERATION_SYSTEM_PROMPT,
    AUTO_FIX_SYSTEM_PROMPT,
    AUTO_FIX_EDITS_SYSTEM_PROMPT,
  ]) {
    assert.doesNotMatch(prompt, /[Aa]ny npm package may be added/);
  }
});
