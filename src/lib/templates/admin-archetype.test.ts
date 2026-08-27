/**
 * "Internal tool" is not one layout.
 *
 * One operational block used to serve all twelve app-shell types: a `w-64` nav
 * sidebar, "Data table — the core ERP surface", compact padding. Their own
 * blueprints disagree — three are board-first, two are schedule-first, and the
 * POS is a touch terminal whose cart sidebar collides with the mandated nav
 * sidebar. Each expectation below is anchored to the primary screen the
 * blueprint actually asks for.
 *
 *   node --import tsx --test src/lib/templates/admin-archetype.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyBuildIntent, isAppShellAppType } from "../ai/build-intent.ts";
import { buildDesignSystem } from "../ai/system-prompts.ts";
import {
  type AdminArchetype,
  ADMIN_SHELL_SPECS,
  adminArchetypeForAppType,
  adminShellSpec,
} from "./admin-archetype.ts";

const archetypeFor = (prompt: string): AdminArchetype =>
  adminArchetypeForAppType(classifyBuildIntent(prompt).appType);

test("each vertical gets the shape its own blueprint asks for", () => {
  const cases: Array<[string, AdminArchetype]> = [
    // Blueprint screen 1: "Dashboard — KPI cards, charts, recent activity"
    ["Build an ERP with inventory and purchase orders", "records"],
    ["Build a bookkeeping system with ledgers and journal entries", "records"],
    ["School management system with students and grades", "records"],
    // "People directory — employee table + profile detail" / "Ticket queue"
    ["Build an HR portal with employees and payroll", "directory"],
    ["Build a helpdesk with tickets and SLAs", "directory"],
    // "Pipeline — kanban board" / "Board — kanban columns" / "Dispatch board"
    ["Build a CRM with leads and deals", "board"],
    ["Build a project board with sprints and tickets", "board"],
    ["Build a logistics dispatch board with shipments and drivers", "board"],
    // "Today's schedule — day view" / "Front desk — today's arrivals"
    ["Build a clinic system with patients and appointments", "schedule"],
    ["Build a hotel front desk with rooms and reservations", "schedule"],
    // "Register / Checkout — product grid, cart sidebar"
    ["Build a point of sale for a cafe", "terminal"],
  ];
  for (const [prompt, expected] of cases) {
    assert.ok(isAppShellAppType(classifyBuildIntent(prompt).appType), prompt);
    assert.equal(archetypeFor(prompt), expected, prompt);
  }
});

test("board-first products are NOT told a data table is the core surface", () => {
  // The specific regression: CRM, project management and logistics all have a
  // kanban primary screen and were handed the ERP table language.
  for (const prompt of [
    "Build a CRM with leads and deals",
    "Build a project board with sprints and tickets",
    "Build a logistics dispatch board with shipments and drivers",
  ]) {
    const prompt_ = buildDesignSystem(classifyBuildIntent(prompt).appType);
    assert.match(prompt_, /column board is the primary screen/, prompt);
    assert.doesNotMatch(prompt_, /Data table.*the core ERP surface/, prompt);
  }
});

test("a POS terminal inverts the density rule and drops the nav sidebar", () => {
  const pos = buildDesignSystem("pos");
  // Two full sidebars leave no room for the product grid.
  assert.match(pos, /ICON RAIL/);
  assert.doesNotMatch(pos, /Fixed nav sidebar `w-64`/);
  // A cashier taps this; py-2 rows and text-xs controls are a usability failure.
  assert.match(pos, /GENEROUS, not compact/);
  assert.match(pos, /44×44px/);
  assert.match(pos, /cart panel/);
});

test("every other archetype keeps compact density and the w-64 nav sidebar", () => {
  for (const archetype of ["records", "directory", "board", "schedule"] as AdminArchetype[]) {
    const spec = adminShellSpec(archetype);
    assert.match(spec.sidebar, /w-64/, archetype);
    assert.match(spec.density, /Compact/, archetype);
  }
});

test("no operational archetype leaks marketing chrome", () => {
  for (const archetype of Object.keys(ADMIN_SHELL_SPECS) as AdminArchetype[]) {
    const spec = adminShellSpec(archetype);
    assert.match(spec.density, /no marketing CTAs|GENEROUS/i, archetype);
  }
});

test("an unmapped app-shell type falls back to the historical language", () => {
  // records IS what every app-shell type received before archetypes existed,
  // so a vertical added later is never made worse by being unmapped.
  assert.equal(adminArchetypeForAppType("admin-dashboard"), "records");
  assert.equal(adminArchetypeForAppType("some-future-vertical"), "records");
  assert.equal(adminArchetypeForAppType(undefined), "records");
});
