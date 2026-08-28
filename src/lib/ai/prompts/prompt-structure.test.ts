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
import { buildDesignSystem, buildGenerationPrompt, NEXT_APP_GENERATION_SYSTEM_PROMPT } from "../system-prompts.ts";
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

// ── The prompt describes the product being built, and only that product ─────
// Measured before this gate: "a landing page for a bakery" shipped the
// admin/ERP data-density language ("no hero sections, no marketing CTAs"), the
// storefront image mandate ("a store without images is a FAILED build") and the
// website header contract — ~7% of the prompt instructing two products the user
// never asked for, contradicting the marketing blueprint beside it.
const ADMIN_BLOCK = /— operational design language/;
const SHOP_BLOCK = /images are MANDATORY/;
const HEADER_BODY = /WEBSITE HEADER CONTRACT — /;
const SHELL_BULLET = /staff-only tool: use the sidebar/;

const promptFor = (request: string) => buildGenerationPrompt(request, [], 80000, "tanstack-start");

test("a marketing build gets site chrome and NO operational or storefront blocks", () => {
  for (const request of ["landing page for a bakery", "Build a portfolio site for a photographer"]) {
    const prompt = promptFor(request);
    assert.doesNotMatch(prompt, ADMIN_BLOCK, request);
    assert.doesNotMatch(prompt, SHOP_BLOCK, request);
    assert.match(prompt, HEADER_BODY, request);
  }
});

test("a staff-only tool gets density language and NO marketing header contract", () => {
  for (const request of ["Build an ERP with inventory and purchase orders", "School management system"]) {
    const prompt = promptFor(request);
    assert.match(prompt, ADMIN_BLOCK, request);
    assert.doesNotMatch(prompt, HEADER_BODY, request);
    // …and the bullet that pointed at that contract must not dangle.
    assert.doesNotMatch(prompt, /See below\./, request);
    assert.match(prompt, SHELL_BULLET, request);
  }
});

test("the storefront image mandate ships only where a product grid is the point", () => {
  assert.match(promptFor("Build an online store selling sneakers"), SHOP_BLOCK);
  assert.doesNotMatch(promptFor("Build a CRM with leads and deals"), SHOP_BLOCK);
});

// The hero-composition guidance ("the hero is the page's thesis") only makes
// sense on a public-facing page — an app-shell build is told the OPPOSITE by
// its own admin-density language a few lines later ("no hero sections"). This
// pins that it is gated structurally (like SHOP_BLOCK above), not left for
// instruction order to sort out.
const HERO_BLOCK = /hero is the page's thesis/;

test("hero composition guidance ships only on public-facing builds", () => {
  for (const request of ["landing page for a bakery", "Build a portfolio site for a photographer"]) {
    assert.match(promptFor(request), HERO_BLOCK, request);
  }
  for (const request of ["Build an ERP with inventory and purchase orders", "Build a point of sale for a cafe"]) {
    const prompt = promptFor(request);
    assert.doesNotMatch(prompt, HERO_BLOCK, request);
    // the admin block says the opposite, explicitly, for every archetype —
    // even POS/terminal, whose own density text is touch-target-focused
    // rather than repeating "no hero sections" verbatim.
    assert.match(prompt, /Use INSTEAD of hero\/marketing patterns/, request);
  }
});

test("an unknown product still gets the complete design system", () => {
  // The screenshot-to-code and standalone Next paths pass no app type; gating
  // must only ever narrow a KNOWN product, never a guess.
  const all = buildDesignSystem();
  assert.match(all, ADMIN_BLOCK);
  assert.match(all, SHOP_BLOCK);
  assert.match(all, HEADER_BODY);
});
