/**
 * "Public website" is not one product.
 *
 * The chrome contract used to declare a phone + email + social top bar and
 * Home · About · Services · Contact nav mandatory for all 26 site categories,
 * and the injector mounted exactly that when a site shipped without a header.
 * A `tel:` link on a developer tool is the visible symptom; the cause is one
 * shape standing in for four.
 *
 *   node --import tsx --test src/lib/templates/site-archetype.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyBuildIntent } from "../ai/build-intent.ts";
import {
  type SiteArchetype,
  SITE_CHROME_SPECS,
  siteArchetypeForBuild,
  siteArchetypeForCategory,
  siteChromeSpec,
} from "./site-archetype.ts";
import { siteFooterSource, siteHeaderSource } from "./site-chrome.ts";
import {
  renderWebsiteFooterContract,
  renderWebsiteHeaderContract,
} from "../ai/website-header-contract.ts";

const archetypeFor = (prompt: string): SiteArchetype =>
  siteArchetypeForBuild(prompt, classifyBuildIntent(prompt).appType);

test("the subject picks the chrome when the app type only names the artifact", () => {
  // All of these classify as marketing-website — correctly, they ARE landing
  // pages — but a plumber's chrome on a devtool is the bug.
  assert.equal(archetypeFor("Build a SaaS landing page for a developer tool"), "product");
  assert.equal(archetypeFor("Build a waitlist page for an AI startup"), "product");
  assert.equal(archetypeFor("Build a landing page for a fintech platform"), "product");
  assert.equal(archetypeFor("Build a landing page for a plumbing company"), "local-business");
  assert.equal(archetypeFor("Build a landing page for a bakery"), "local-business");
  assert.equal(archetypeFor("Build a website for a dental clinic"), "local-business");
});

test("app type wins where it is already specific", () => {
  assert.equal(archetypeFor("Build an online store selling sneakers"), "commerce");
  assert.equal(archetypeFor("Build a blog about cooking"), "editorial");
  assert.equal(archetypeFor("Build a portfolio site for a photographer"), "editorial");
});

test("designer-template categories map too — 26 categories, not 26 identical headers", () => {
  for (const category of ["saas", "devtool", "crypto", "waitlist", "jobboard"]) {
    assert.equal(siteArchetypeForCategory(category), "product", category);
  }
  for (const category of ["blog", "portfolio", "photography", "podcast", "newsletter"]) {
    assert.equal(siteArchetypeForCategory(category), "editorial", category);
  }
  assert.equal(siteArchetypeForCategory("ecommerce"), "commerce");
  // Everything unmapped keeps the historical shape — never a regression.
  for (const category of ["restaurant", "medical", "realestate", "fitness", undefined]) {
    assert.equal(siteArchetypeForCategory(category), "local-business", String(category));
  }
});

test("only a local business gets a phone/email/social top bar", () => {
  for (const archetype of Object.keys(SITE_CHROME_SPECS) as SiteArchetype[]) {
    const spec = siteChromeSpec(archetype);
    const header = siteHeaderSource("Acme", archetype);
    const contract = renderWebsiteHeaderContract(spec);
    if (archetype === "local-business") {
      assert.match(header, /href="tel:/, archetype);
      assert.match(contract, /phone \+ email/, archetype);
    } else {
      assert.doesNotMatch(header, /href="tel:/, `${archetype} header must not carry a phone number`);
      assert.match(contract, /NO contact top bar/, archetype);
    }
  }
});

test("the generated component and the contract come from the same spec", () => {
  // The drift guard: a nav label or footer heading changed in one place and not
  // the other is the exact failure this whole module exists to prevent.
  for (const archetype of Object.keys(SITE_CHROME_SPECS) as SiteArchetype[]) {
    const spec = siteChromeSpec(archetype);
    const header = siteHeaderSource("Acme", archetype);
    const headerContract = renderWebsiteHeaderContract(spec);
    for (const label of spec.nav) {
      assert.ok(header.includes(label), `${archetype} header missing nav "${label}"`);
      assert.ok(headerContract.includes(label), `${archetype} contract missing nav "${label}"`);
    }
    for (const action of [spec.cta, spec.secondaryCta]) {
      if (!action) continue;
      assert.ok(header.includes(action.label), `${archetype} header missing "${action.label}"`);
      assert.ok(headerContract.includes(action.label), `${archetype} contract missing "${action.label}"`);
    }
    const footer = siteFooterSource("Acme", archetype);
    const footerContract = renderWebsiteFooterContract(spec);
    for (const column of spec.footerColumns) {
      assert.ok(footer.includes(column.heading), `${archetype} footer missing column "${column.heading}"`);
      assert.ok(footerContract.includes(column.heading), `${archetype} contract missing column "${column.heading}"`);
    }
  }
});

test("commerce chrome carries the utilities a storefront actually needs", () => {
  const spec = siteChromeSpec("commerce");
  assert.ok(spec.search && spec.cart);
  const contract = renderWebsiteHeaderContract(spec);
  assert.match(contract, /search input/);
  assert.match(contract, /cart button/);
});

test("only local-business and commerce footers publish a street address and phone", () => {
  for (const archetype of ["product", "editorial"] as SiteArchetype[]) {
    assert.doesNotMatch(siteFooterSource("Acme", archetype), /href="tel:/, archetype);
  }
  for (const archetype of ["local-business", "commerce"] as SiteArchetype[]) {
    assert.match(siteFooterSource("Acme", archetype), /href="tel:/, archetype);
  }
});
