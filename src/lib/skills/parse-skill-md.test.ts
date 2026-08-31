import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkillMd, resolveGithubSkillLocation } from "./parse-skill-md";

test("parseSkillMd reads name/description from front-matter", () => {
  const md = `---
name: my-skill
description: Use when doing X
---
# My Skill

Do the thing carefully.`;
  const result = parseSkillMd(md);
  assert.equal(result?.name, "my-skill");
  assert.equal(result?.description, "Use when doing X");
  assert.match(result!.prompt, /Do the thing carefully/);
});

test("parseSkillMd strips quotes around front-matter values", () => {
  const md = `---
name: "quoted-name"
description: 'single quoted'
---
Body text.`;
  const result = parseSkillMd(md);
  assert.equal(result?.name, "quoted-name");
  assert.equal(result?.description, "single quoted");
});

test("parseSkillMd parses a comma-separated tags line", () => {
  const md = `---
name: tagged
tags: ui, forms,  validation
---
Body.`;
  const result = parseSkillMd(md);
  assert.deepEqual(result?.tags, ["ui", "forms", "validation"]);
});

test("parseSkillMd falls back to a slugified H1 when name is missing from front-matter", () => {
  const md = `# Dark Mode Toggle

Add a dark mode toggle to the settings page.`;
  const result = parseSkillMd(md);
  assert.equal(result?.name, "dark-mode-toggle");
});

test("parseSkillMd falls back to the first non-heading line as description when unset", () => {
  const md = `# My Skill

This is the first real line.
More text.`;
  const result = parseSkillMd(md);
  assert.equal(result?.description, "This is the first real line.");
});

test("parseSkillMd returns null when there's no front-matter name and no H1", () => {
  const md = "Just some text with no heading and no front-matter.";
  assert.equal(parseSkillMd(md), null);
});

test("parseSkillMd handles content with no front-matter block at all (body is the whole content)", () => {
  const md = `# Plain Skill
Some instructions.`;
  const result = parseSkillMd(md);
  assert.equal(result?.name, "plain-skill");
  assert.match(result!.prompt, /Some instructions/);
});

test("resolveGithubSkillLocation resolves a bare repo URL to SKILL.md on main, with a master fallback", () => {
  const loc = resolveGithubSkillLocation("https://github.com/acme/skills-repo");
  assert.equal(loc?.owner, "acme");
  assert.equal(loc?.repo, "skills-repo");
  assert.equal(loc?.branch, "main");
  assert.equal(loc?.rawUrl, "https://raw.githubusercontent.com/acme/skills-repo/main/SKILL.md");
  assert.equal(loc?.fallbackRawUrl, "https://raw.githubusercontent.com/acme/skills-repo/master/SKILL.md");
});

test("resolveGithubSkillLocation resolves a /tree/<branch>/<path> subdirectory URL with no fallback", () => {
  const loc = resolveGithubSkillLocation("https://github.com/acme/skills-repo/tree/dev/skills/my-skill");
  assert.equal(loc?.branch, "dev");
  assert.equal(loc?.rawUrl, "https://raw.githubusercontent.com/acme/skills-repo/dev/skills/my-skill/SKILL.md");
  // A branch was explicitly chosen, so there's nothing to fall back to.
  assert.equal(loc?.fallbackRawUrl, null);
});

test("resolveGithubSkillLocation handles a /blob/<branch>/<path>/SKILL.md URL by stripping the filename", () => {
  const loc = resolveGithubSkillLocation("https://github.com/acme/skills-repo/blob/main/skills/my-skill/SKILL.md");
  assert.equal(loc?.rawUrl, "https://raw.githubusercontent.com/acme/skills-repo/main/skills/my-skill/SKILL.md");
});

test("resolveGithubSkillLocation strips a trailing .git from the repo name", () => {
  const loc = resolveGithubSkillLocation("https://github.com/acme/skills-repo.git");
  assert.equal(loc?.repo, "skills-repo");
  assert.equal(loc?.rawUrl, "https://raw.githubusercontent.com/acme/skills-repo/main/SKILL.md");
});

test("resolveGithubSkillLocation returns null for a non-GitHub URL", () => {
  assert.equal(resolveGithubSkillLocation("https://gitlab.com/acme/skills-repo"), null);
});

test("resolveGithubSkillLocation returns null for a malformed URL", () => {
  assert.equal(resolveGithubSkillLocation("not a url"), null);
});
