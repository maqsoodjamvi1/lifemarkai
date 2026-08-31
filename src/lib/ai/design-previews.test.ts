/**
 * The visual-direction picker and the auto-style brief both existed to give
 * public-facing builds a distinct look — a "bold vs warm editorial" 3-way
 * choice, or an auto-picked "Playful Pop"/"Mono Brutalist" palette. Neither
 * belongs on a staff-only operational tool, which is why both gated on a
 * local `ADMIN_APP_TYPES = new Set(["erp", "pos", "crm"])`.
 *
 * That set is the same duplicate-classifier bug already found and fixed
 * twice this session (website-chrome.ts, then a stale APP_SHELL_TYPES copy)
 * — a hand-picked stand-in for the real 12-member app-shell set in
 * build-intent.ts. It missed 9 of the 12: healthcare, hr, accounting,
 * logistics, helpdesk, school, hotel, project-management, admin-dashboard.
 * A hospital scheduling build or a school administration tool was still
 * offered the 3-direction picker and could get handed "Playful Pop" chunky
 * borders and bright primary colors — fighting the operational density
 * language adminDensityLanguage() establishes for exactly those types.
 *
 *   node --import tsx --test src/lib/ai/design-previews.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyBuildIntent, isAppShellAppType } from "./build-intent.ts";
import {
  buildAutoStyleBrief,
  buildDesignPreviewSystemPrompt,
  buildFallbackDesignPreviews,
  getDesignPreviewContext,
  shouldOfferDesignPreviews,
} from "./design-previews.ts";

// Anchored to the same real prompts admin-archetype.test.ts already verifies
// classify to each of the 12 app-shell types — not re-guessing wording here.
const APP_SHELL_PROMPTS = [
  "Build an ERP with inventory and purchase orders",
  "Build a bookkeeping system with ledgers and journal entries",
  "School management system with students and grades",
  "Build an HR portal with employees and payroll",
  "Build a helpdesk with tickets and SLAs",
  "Build a CRM with leads and deals",
  "Build a project board with sprints and tickets",
  "Build a logistics dispatch board with shipments and drivers",
  "Build a clinic system with patients and appointments",
  "Build a hotel front desk with rooms and reservations",
  "Build a point of sale for a cafe",
];

test("every app-shell prompt is confirmed app-shell before asserting on it", () => {
  for (const prompt of APP_SHELL_PROMPTS) {
    assert.ok(isAppShellAppType(classifyBuildIntent(prompt).appType), prompt);
  }
});

test("no staff-only build is offered the public-facing 3-direction picker", () => {
  for (const prompt of APP_SHELL_PROMPTS) {
    assert.equal(shouldOfferDesignPreviews(prompt, 0), false, prompt);
  }
});

test("no staff-only build gets an auto-picked bright/playful palette", () => {
  for (const prompt of APP_SHELL_PROMPTS) {
    assert.equal(buildAutoStyleBrief(prompt, "seed"), null, prompt);
  }
});

test("public-facing builds keep both — the fix must not over-reach", () => {
  const publicPrompts = [
    "Build a marketing landing page for a coffee shop",
    "Build an online storefront for handmade candles",
  ];
  for (const prompt of publicPrompts) {
    assert.equal(isAppShellAppType(classifyBuildIntent(prompt).appType), false, prompt);
    assert.equal(shouldOfferDesignPreviews(prompt, 0), true, prompt);
    assert.notEqual(buildAutoStyleBrief(prompt, "seed"), null, prompt);
  }
});

test("existing projects can still request the design picker explicitly", () => {
  assert.equal(
    shouldOfferDesignPreviews("Show me design directions for this landing page", 24),
    true,
  );
  assert.equal(
    shouldOfferDesignPreviews("Change the website design to something more premium", 24),
    true,
  );
});

test("existing feature work is not interrupted by the design picker", () => {
  assert.equal(
    shouldOfferDesignPreviews("Add a calendar filter to the todo list", 24),
    false,
  );
});

test("operational builds offer app-shell directions only when explicitly requested", () => {
  assert.equal(
    shouldOfferDesignPreviews("Show me design directions for a CRM with leads and deals", 0),
    true,
  );
  assert.equal(
    shouldOfferDesignPreviews("Choose a design for an ERP with inventory and purchase orders", 0),
    true,
  );
  assert.equal(shouldOfferDesignPreviews("Build a CRM with leads and deals", 0), false);
});

test("landing pages and admin apps receive different structural contracts", () => {
  const landing = "Build a modern bakery landing page";
  const admin = "Show me design directions for a CRM with leads and deals";

  assert.equal(getDesignPreviewContext(landing).surface, "public-site");
  assert.equal(getDesignPreviewContext(admin).surface, "app-shell");

  const landingPrompt = buildDesignPreviewSystemPrompt(landing);
  const adminPrompt = buildDesignPreviewSystemPrompt(admin);
  assert.match(landingPrompt, /PUBLIC-FACING SITE/);
  assert.match(landingPrompt, /NEVER render an admin sidebar/);
  assert.match(adminPrompt, /OPERATIONAL APP SHELL/);
  assert.match(adminPrompt, /NEVER render a marketing hero/);
});

test("fallback frames differ by product structure, not only palette", () => {
  const landingHtml = buildFallbackDesignPreviews(
    "Build a modern bakery landing page",
    "same-seed",
  ).map((direction) => direction.previewHtml).join(" ");
  const adminHtml = buildFallbackDesignPreviews(
    "Show me design directions for an ERP with inventory and purchase orders",
    "same-seed",
  ).map((direction) => direction.previewHtml).join(" ");

  assert.match(landingHtml, /Story Work Contact/);
  assert.doesNotMatch(landingHtml, /Overview.*Records.*Reports/);
  assert.match(adminHtml, /Overview.*Records.*Reports/);
  assert.doesNotMatch(adminHtml, /Explore the experience/);
});
