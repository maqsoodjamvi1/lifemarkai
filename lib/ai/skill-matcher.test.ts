/**
 * Unit tests for lib/ai/skill-matcher.
 *
 *   node --test lib/ai/skill-matcher.test.ts
 *
 * Calibration check: these tests pin the scoring thresholds so future tweaks
 * to weights/stopwords surface as test failures rather than silent regressions
 * in production chat behavior.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchSkills,
  renderSkillBlock,
  scoreSkill,
  type SkillCandidate,
} from "./skill-matcher.ts";

const ADD_AUTH: SkillCandidate = {
  id: "s1",
  name: "Add authentication",
  description: "Set up Supabase email + Google OAuth login with protected routes.",
  prompt: "<auth playbook body>",
  tags: ["auth", "supabase", "oauth"],
};

const DARK_MODE: SkillCandidate = {
  id: "s2",
  name: "Add dark mode",
  description: "Add a dark/light theme toggle using shadcn's next-themes.",
  prompt: "<dark mode playbook body>",
  tags: ["theme", "ui", "tailwind"],
};

const SEO: SkillCandidate = {
  id: "s3",
  name: "Improve SEO",
  description: "Add metadata, sitemap.xml, robots.txt, and Open Graph tags.",
  prompt: "<seo playbook body>",
  tags: ["seo", "meta", "og"],
};

const ALL = [ADD_AUTH, DARK_MODE, SEO];

test("matches a skill by name overlap", () => {
  const matches = matchSkills("please add authentication to my app", ALL);
  assert.equal(matches.length >= 1, true);
  assert.equal(matches[0].skill.id, "s1");
  assert.ok(matches[0].score > 0.2);
});

test("matches by description terms when name terms are absent", () => {
  const matches = matchSkills("set up Supabase Google login flow", ALL);
  // Should match Add auth even though "auth" isn't in the prompt.
  assert.equal(matches[0]?.skill.id, "s1");
});

test("matches by tag", () => {
  const matches = matchSkills("I want a theme toggle for my homepage", ALL);
  assert.equal(matches[0]?.skill.id, "s2");
});

test("returns empty when nothing is similar", () => {
  const matches = matchSkills("show me a recipe for banana bread", ALL);
  assert.deepEqual(matches, []);
});

test("returns empty for empty/whitespace prompt", () => {
  assert.deepEqual(matchSkills("", ALL), []);
  assert.deepEqual(matchSkills("   ", ALL), []);
});

test("returns empty when no candidates supplied", () => {
  assert.deepEqual(matchSkills("add auth", []), []);
});

test("respects topN", () => {
  // A prompt with multiple hits — should return at most topN regardless.
  const matches = matchSkills(
    "add authentication, dark mode, and improve SEO",
    ALL,
    { topN: 1 },
  );
  assert.equal(matches.length, 1);
});

test("respects threshold", () => {
  // Weak match — passing a tiny threshold should pull more in, a huge one should pull none.
  const lowBar = matchSkills("supabase", ALL, { threshold: 0.05, topN: 5 });
  const highBar = matchSkills("supabase", ALL, { threshold: 0.9 });
  assert.ok(lowBar.length >= 1);
  assert.equal(highBar.length, 0);
});

test("scoreSkill explains reasons", () => {
  const { score, reason } = scoreSkill("add authentication with google", ADD_AUTH);
  assert.ok(score > 0);
  assert.ok(reason.length > 0);
  assert.ok(/name|description|tag/.test(reason));
});

test("renderSkillBlock includes name + body and skips when empty", () => {
  assert.equal(renderSkillBlock([]), "");
  const block = renderSkillBlock([
    { skill: ADD_AUTH, score: 0.5, reason: "test" },
  ]);
  assert.ok(block.includes("Add authentication"));
  assert.ok(block.includes("<auth playbook body>"));
  assert.ok(block.includes("# Auto-attached skills"));
});

test("ties broken alphabetically by skill name", () => {
  // Two skills with identical descriptions → same score → alpha-order.
  // Use real multi-character words because the tokenizer drops length<=1 tokens.
  const A: SkillCandidate = { id: "a", name: "Bravo Skill", description: "build banana bread recipe", prompt: "" };
  const B: SkillCandidate = { id: "b", name: "Alpha Skill", description: "build banana bread recipe", prompt: "" };
  const matches = matchSkills("build banana bread recipe", [A, B]);
  assert.equal(matches[0]?.skill.name, "Alpha Skill");
});

test("stopwords don't inflate score on a generic prompt", () => {
  // "Please add the authentication" should match, but a bare "the the the" should not.
  const realPrompt = matchSkills("please add the authentication", ALL);
  const stopwordOnly = matchSkills("the the the and and a", ALL);
  assert.ok(realPrompt.length >= 1);
  assert.deepEqual(stopwordOnly, []);
});
