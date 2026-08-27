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
import { buildAutoStyleBrief, shouldOfferDesignPreviews } from "./design-previews.ts";

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
