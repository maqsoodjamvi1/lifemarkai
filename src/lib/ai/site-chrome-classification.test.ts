/**
 * Who gets marketing chrome — and who must never.
 *
 * Marketing header/footer are not a style preference: ensureWebsiteChrome
 * WRITES SOURCE FILES and mounts them in the root shell. Injecting them into a
 * staff-only tool leaves the user deleting generated code — a clinic's patient
 * records under a "Careers · Press · Privacy" footer and a phone/email/social
 * top bar.
 *
 *   node --import tsx --test src/lib/ai/site-chrome-classification.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyBuildIntent, isAppShellAppType } from "./build-intent.ts";
import { needsWebsiteChrome } from "./website-chrome.ts";
import { siteFooterSource, siteHeaderSource } from "../templates/site-chrome.ts";
import { WEBSITE_FOOTER_CONTRACT } from "./website-header-contract.ts";

const SHELL = [
  { path: "src/routes/__root.tsx", content: "export default function R(){return <div><main/></div>;}", language: "typescriptreact" },
  { path: "src/routes/index.tsx", content: "export default function I(){return <div/>;}", language: "typescriptreact" },
];

test("every staff-only product type is exempt from marketing chrome", () => {
  // Before the fix this module kept its own four-name list while the
  // classifier's had grown to twelve, so these eight were silently chromed.
  const staffOnly = [
    "School management system",
    "Build a clinic system with patients and appointments",
    "Build an HR portal with employees and payroll",
    "Build a helpdesk with tickets and SLAs",
    "Build an ERP with inventory and purchase orders",
    "Build a point of sale for a cafe",
    "Build a CRM with leads and deals",
  ];
  for (const request of staffOnly) {
    const appType = classifyBuildIntent(request).appType;
    assert.ok(isAppShellAppType(appType), `${request} should be an app shell (got ${appType})`);
    assert.equal(needsWebsiteChrome(SHELL, { appType }), false, request);
  }
});

test("public sites still get chrome — the exemption must not over-reach", () => {
  for (const request of [
    "Build a landing page for a bakery",
    "Build a portfolio site for a photographer",
    "Build an online store selling sneakers",
  ]) {
    const appType = classifyBuildIntent(request).appType;
    assert.equal(needsWebsiteChrome(SHELL, { appType }), true, request);
  }
});

test("the exemption is driven by the classifier, not a local copy of the list", () => {
  // Any app type the classifier calls an app shell must be exempt — this fails
  // the moment someone adds a vertical to build-intent.ts and forgets a second
  // list somewhere, which is exactly how the original drift happened.
  for (const request of [
    "Build a hotel front desk with rooms and reservations",
    "Build a logistics dispatch board with shipments and drivers",
    "Build a project board with sprints and tickets",
    "Build a bookkeeping system with ledgers and journal entries",
  ]) {
    const appType = classifyBuildIntent(request).appType;
    if (!isAppShellAppType(appType)) continue; // classification is tested elsewhere
    assert.equal(needsWebsiteChrome(SHELL, { appType }), false, `${request} (${appType})`);
  }
});

test("the footer contract describes the footer the injector actually builds", () => {
  // The VITE_RULES lesson: a hand-written description of generated output
  // drifts. If the synthesised footer changes shape, this fails.
  const footer = siteFooterSource("Harbour Lane");
  for (const [claim, present] of [
    ["social icons", /Facebook|Instagram|Linkedin/],
    ["link columns", /Careers|Press|Privacy|Terms/],
    ["tel: link", /href="tel:/],
    ["mailto: link", /href="mailto:/],
    ["dynamic copyright", /getFullYear\(\)/],
    ["four-column grid", /lg:grid-cols-4/],
    ["generous padding", /py-14/],
  ] as const) {
    assert.match(footer, present, `synthesised footer lost its ${claim}`);
  }
  // …and the contract must keep naming those same things.
  assert.match(WEBSITE_FOOTER_CONTRACT, /tel:/);
  assert.match(WEBSITE_FOOTER_CONTRACT, /mailto:/);
  assert.match(WEBSITE_FOOTER_CONTRACT, /lg:grid-cols-4/);
  assert.match(WEBSITE_FOOTER_CONTRACT, /getFullYear\(\)/);
  assert.match(WEBSITE_FOOTER_CONTRACT, /Admin\/dashboard apps are exempt/);
});

test("header and footer contracts are a matched pair", () => {
  const header = siteHeaderSource("Harbour Lane");
  assert.match(header, /tel:|mailto:/); // top bar carries contact, per the header contract
});
