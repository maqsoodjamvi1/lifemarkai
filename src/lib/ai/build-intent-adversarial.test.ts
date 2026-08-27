/**
 * Adversarial classification — the cases where the ARTIFACT and the INDUSTRY
 * name different products.
 *
 * Every row here is a prompt in which one product word is a red herring: the
 * customer's line of business ("a CRM consultancy"), a feature that belongs to
 * a bigger system ("inventory" inside an online store), or a public surface
 * attached to an operational app ("CRM SaaS with a pricing page"). The rule the
 * classifier encodes is that naming the artifact beats naming the industry,
 * and the head noun beats the modifier.
 *
 *   node --import tsx --test src/lib/ai/build-intent-adversarial.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { type BuildAppType, classifyBuildIntent } from "./build-intent.ts";

const expect = (prompt: string, appType: BuildAppType) =>
  assert.equal(classifyBuildIntent(prompt).appType, appType, prompt);

test("the client's industry never becomes the product", () => {
  // These two were the observed failures: SITE_FUNCTIONAL_OVERRIDE listed
  // crm/erp/pos, so merely naming the customer's trade cancelled the site
  // guard and the classifier built the consultancy's own CRM.
  expect("Landing page for a CRM consultancy", "marketing-website");
  expect("Website for an ERP company", "marketing-website");
  expect("Marketing site for an accounting firm", "marketing-website");
  expect("One-pager for a logistics provider", "marketing-website");
  expect("Homepage for a POS vendor", "marketing-website");
  expect("Website for a school", "marketing-website");
});

test("a real request for the system still classifies as the system", () => {
  // The guard above must not swallow these: here the system name is the head
  // noun and what follows is a preposition or a feature list.
  expect("CRM for a real-estate agency", "crm");
  expect("Build a CRM with leads and deals", "crm");
  expect("ERP for an ecommerce warehouse", "erp");
  expect("Build a point of sale for a cafe", "pos");
});

test("the artifact noun beats the domain vocabulary around it", () => {
  expect("Online store with inventory management", "ecommerce");
  expect("Build a portfolio site for a photographer", "portfolio");
  expect("School management system", "school");
});

test("a public surface on an operational product keeps the product", () => {
  // "CRM SaaS with public pricing page" is a CRM that also has marketing
  // routes — not a marketing site. The generator handles the hybrid shell;
  // the classification must not flip to the smaller product.
  expect("CRM SaaS with public pricing page", "crm");
  expect("Build a booking app with a public landing page", "booking");
});
