import test from "node:test";
import assert from "node:assert/strict";
import { assessRequestScope,formatScopeAssessment } from "./scope-guard.ts";

const FRESH = { userAuthoredFileCount: 0 };
const WORKING_APP = { userAuthoredFileCount: 34 };

// ─── The negative cases matter most ─────────────────────────────────────────
//
// A false refusal on an ordinary request is the failure mode that would make
// this feature hated, so these come first and outnumber the positives. Every
// one of them is a request we must build without comment.

const ORDINARY_REQUESTS = [
  "hi",
  "build me a shop for my bakery",
  "add a login page",
  "make the header sticky",
  "change the primary colour to green",
  "add a checkout flow with Stripe",
  "build an online store with a cart and an admin panel",
  "create a booking system for my salon",
  "add dark mode",
  "fix the broken image on the pricing page",
  "I want a CRM for my sales team",
  "add a dashboard showing revenue and orders",
  // Domain nouns used as SUBJECT MATTER, not as products to build:
  "build a marketing site for a company that sells payment gateway software",
  "a landing page for our Kubernetes monitoring product",
  "a dashboard for our fleet management data",
  // Long but singular — length alone must never trigger sprawl:
  "Build a complete e-commerce store for a coffee roastery. ".repeat(12),
];

test("ordinary requests are never questioned", () => {
  for (const prompt of ORDINARY_REQUESTS) {
    assert.equal(assessRequestScope(prompt, FRESH), null, `FRESH: ${prompt.slice(0, 60)}`);
    assert.equal(assessRequestScope(prompt, WORKING_APP), null, `WORKING: ${prompt.slice(0, 60)}`);
  }
});

test("an empty or whitespace prompt is not a concern", () => {
  assert.equal(assessRequestScope("", FRESH), null);
  assert.equal(assessRequestScope("   \n  ", WORKING_APP), null);
});

// ─── Runtime impossibilities ────────────────────────────────────────────────

test("asking for virtual machines is flagged as a runtime limit", () => {
  const a = assessRequestScope("Add a Firecracker microVM pool to run each user's code", FRESH);
  assert.ok(a);
  assert.equal(a.concerns[0].kind, "runtime");
  assert.match(a.concerns[0].what, /virtual machines/);
});

test("each runtime limit is detected on its own", () => {
  const cases: Array<[string, RegExp]> = [
    ["we need to orchestrate Kubernetes pods per tenant", /container/i],
    ["provision AWS infrastructure with Terraform on signup", /infrastructure/i],
    ["fine-tune a model on the customer's own documents", /training or fine-tuning/i],
    ["ship a native iOS app with SwiftUI", /native mobile/i],
    ["package it as an Electron app with a .dmg installer", /desktop application/i],
    ["a sandboxed code execution engine for user submissions", /untrusted code/i],
    ["build the game in Unreal Engine", /game engine/i],
    ["run an Ethereum node and a validator node", /blockchain node/i],
    ["an RTMP ingest and video transcoding pipeline", /video transcoding/i],
  ];
  for (const [prompt, expected] of cases) {
    const a = assessRequestScope(prompt, FRESH);
    assert.ok(a, prompt);
    assert.match(a.concerns[0].what, expected, prompt);
  }
});

test("a runtime limit is reported even on a brand-new project", () => {
  // Nothing to destroy, but "impossible" is still worth saying before we spend
  // the user's credits producing something that cannot work.
  assert.ok(assessRequestScope("run each build in a Firecracker microVM", FRESH));
});

test("at most two runtime concerns are listed", () => {
  const a = assessRequestScope(
    "Firecracker microVMs, orchestrate Kubernetes pods, Terraform provisioning, fine-tune a model, and a native iOS app",
    FRESH,
  );
  assert.ok(a);
  assert.equal(a.concerns.filter((c) => c.kind === "runtime").length, 2);
});

// ─── Scope sprawl ───────────────────────────────────────────────────────────

test("an explicit subsystem inventory is flagged", () => {
  const prompt =
    "I want an AI software-engineering platform with 30+ major subsystems covering everything a modern developer needs, including collaborative editing, deployment, billing and analytics. " +
    "It should be enterprise grade and handle very large teams with fine-grained permissions across every surface of the product.";
  const a = assessRequestScope(prompt, WORKING_APP);
  assert.ok(a);
  const sprawl = a.concerns.find((c) => c.kind === "sprawl");
  assert.ok(sprawl);
  assert.match(sprawl.what, /30/);
});

test("naming four separate products in a long prompt is flagged", () => {
  const prompt =
    "We need a single platform for the whole group. It should include an online store for our retail arm, " +
    "a CRM for the sales team to track their pipeline, an LMS so staff can take training courses, and a " +
    "helpdesk with support tickets for customers. Everything should share one login and one admin area, " +
    "with reporting across all of it and role-based permissions for each department in the company.";
  assert.ok(prompt.length >= 300);
  const a = assessRequestScope(prompt, FRESH);
  assert.ok(a);
  assert.ok(a.concerns.some((c) => c.kind === "sprawl"));
});

test("three products is under the threshold and builds without comment", () => {
  const prompt =
    "We need a platform for the group. It should include an online store for our retail arm, a CRM for " +
    "the sales team to track their pipeline, and a helpdesk with support tickets for customers. " +
    "Everything should share one login and one admin area, with reporting across all of it and " +
    "role-based permissions for each department in the company as we grow over the next year.";
  assert.ok(prompt.length >= 300);
  assert.equal(assessRequestScope(prompt, FRESH), null);
});

test("a short prompt is never sprawl, however many domains it names", () => {
  // Length is the guard against treating a terse comparison as a roadmap.
  const prompt = "like an online store, a CRM, an LMS and a helpdesk";
  assert.ok(prompt.length < 300);
  assert.equal(assessRequestScope(prompt, FRESH), null);
});

test("a single-digit module count is not an inventory", () => {
  const prompt =
    "Build an admin dashboard with 6 modules: users, billing, reports, settings, audit log and " +
    "notifications. Each should have its own page with a table, filters and a detail drawer, and they " +
    "should all share the sidebar navigation and the same design language across the whole product. " +
    "Use the existing colour tokens and keep the layout consistent with the rest of the application.";
  assert.ok(prompt.length >= 300);
  assert.equal(assessRequestScope(prompt, FRESH), null);
});

// ─── Destructive rewrites ───────────────────────────────────────────────────

test("start over is questioned when there is work to lose", () => {
  const a = assessRequestScope("scrap it and start from scratch with a new design", WORKING_APP);
  assert.ok(a);
  const d = a.concerns.find((c) => c.kind === "destructive");
  assert.ok(d);
  assert.match(d.why, /34 files of your work/);
  assert.match(a.question, /replace what's there, or add to it/);
});

test("start over on an empty project is not destructive", () => {
  assert.equal(assessRequestScope("let's start from scratch", FRESH), null);
});

test("the file count is pluralised correctly", () => {
  const a = assessRequestScope("delete everything and rebuild", { userAuthoredFileCount: 1 });
  assert.ok(a);
  assert.match(a.concerns[0].why, /1 file of your work/);
});

// ─── The question adapts to what was found ──────────────────────────────────

test("destructive concerns win the question even alongside others", () => {
  const a = assessRequestScope(
    "scrap it and start from scratch, and add Firecracker microVMs this time",
    WORKING_APP,
  );
  assert.ok(a);
  assert.match(a.question, /replace what's there/);
});

test("a runtime-only concern asks about building the workable parts", () => {
  const a = assessRequestScope("add a native iOS app too", WORKING_APP);
  assert.ok(a);
  assert.match(a.question, /parts that do work here/);
});

// ─── Rendering ──────────────────────────────────────────────────────────────

test("the rendered message names each concern and ends with an override", () => {
  const a = assessRequestScope("run each build in a Firecracker microVM", FRESH);
  assert.ok(a);
  const text = formatScopeAssessment(a);
  assert.match(text, /^Before I touch anything/);
  assert.match(text, /virtual machines/);
  assert.match(text, /no hypervisor underneath it/);
  assert.match(text, /attempt it as written/);
  // The override offer must survive any future edit to the copy — without it
  // this stops being a question and becomes a refusal.
  assert.ok(text.includes("I'll go ahead"));
});
