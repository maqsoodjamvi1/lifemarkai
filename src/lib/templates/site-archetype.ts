/**
 * Site chrome archetypes — because "public website" is not one product.
 *
 * The chrome contract used to say "Every public website MUST use this two-tier
 * chrome" with a phone + email top bar and Home · About · Services · Contact
 * nav, and the injector mounted exactly that when a site shipped without a
 * header. Measured: a SaaS developer-tool landing page, an AI waitlist page and
 * a plumbing company all received the identical mandate. That chrome is right
 * for a local business and wrong for most of the 26 site categories the
 * platform recognises — a `tel:` link and a "Services" tab on a devtool reads
 * as a template nobody adjusted.
 *
 * Four archetypes cover the real spread:
 *
 *   local-business  contact-forward. Phone/email/social top bar, Home/About/
 *                   Services/Contact, "Get in touch". Restaurants, clinics,
 *                   trades, agencies, gyms, real estate. The historical default.
 *   product         no phone anywhere. Product/Pricing/Docs/Blog with Sign in
 *                   + Get started. SaaS, devtools, AI, fintech, waitlists.
 *   commerce        utility-forward. Search, category nav, cart and account.
 *                   Storefronts and marketplaces.
 *   editorial       minimal. Wordmark, a few section links, subscribe/social.
 *                   Blogs, portfolios, photography, podcasts, newsletters.
 *
 * ONE SPEC DRIVES BOTH the prompt contract the model reads and the component
 * the injector synthesises, so the instruction and the generated file cannot
 * disagree — the same rule this codebase already applies to the package
 * allowlist and the Vite scaffold.
 */

import type { BuildAppType } from "../ai/build-intent.ts";

export type SiteArchetype = "local-business" | "product" | "commerce" | "editorial";

export interface FooterColumn {
  heading: string;
  links: readonly string[];
}

export interface SiteChromeSpec {
  archetype: SiteArchetype;
  /** How the prompt names this shape. */
  label: string;
  /** Phone + email + social strip above the main header row. */
  contactTopBar: boolean;
  nav: readonly string[];
  /** Primary action in the header. */
  cta: { label: string; href: string } | null;
  /** Quieter action beside it (sign-in, account). */
  secondaryCta: { label: string; href: string } | null;
  /** Header utilities: search box, cart button. */
  search: boolean;
  cart: boolean;
  footerColumns: readonly FooterColumn[];
  /** Address / phone / email column in the footer. */
  footerContact: boolean;
  /** One line of guidance for the footer's brand blurb. */
  footerBlurb: string;
}

const LOCAL_BUSINESS: SiteChromeSpec = {
  archetype: "local-business",
  label: "Local business / service site",
  contactTopBar: true,
  nav: ["Home", "About", "Services", "Contact"],
  cta: { label: "Get in touch", href: "#contact" },
  secondaryCta: null,
  search: false,
  cart: false,
  footerColumns: [
    { heading: "Explore", links: ["Home", "About", "Services", "Contact"] },
    { heading: "Company", links: ["Careers", "Press", "Privacy", "Terms"] },
  ],
  footerContact: true,
  footerBlurb: "what the business does and who it serves, in the owner's voice",
};

const PRODUCT: SiteChromeSpec = {
  archetype: "product",
  label: "Product / SaaS site",
  // A phone number on a developer tool reads as an untouched template. Support
  // lives at a docs link or an email in the footer, never a call-us strip.
  contactTopBar: false,
  nav: ["Product", "Pricing", "Docs", "Blog"],
  cta: { label: "Get started", href: "#get-started" },
  secondaryCta: { label: "Sign in", href: "#sign-in" },
  search: false,
  cart: false,
  footerColumns: [
    { heading: "Product", links: ["Features", "Pricing", "Changelog", "Roadmap"] },
    { heading: "Developers", links: ["Docs", "API reference", "Status", "Community"] },
    { heading: "Company", links: ["About", "Blog", "Careers", "Privacy"] },
  ],
  footerContact: false,
  footerBlurb: "the problem the product solves, in one concrete sentence",
};

const COMMERCE: SiteChromeSpec = {
  archetype: "commerce",
  label: "Storefront / marketplace site",
  contactTopBar: false,
  nav: ["Shop", "New in", "Collections", "Sale"],
  cta: null,
  secondaryCta: { label: "Account", href: "#account" },
  search: true,
  cart: true,
  footerColumns: [
    { heading: "Shop", links: ["New in", "Best sellers", "Collections", "Gift cards"] },
    { heading: "Help", links: ["Shipping", "Returns", "Size guide", "Track order"] },
    { heading: "Company", links: ["About", "Stores", "Careers", "Privacy"] },
  ],
  footerContact: true,
  footerBlurb: "what the store sells and what makes it worth buying from",
};

const EDITORIAL: SiteChromeSpec = {
  archetype: "editorial",
  label: "Editorial / portfolio site",
  contactTopBar: false,
  nav: ["Work", "Writing", "About", "Contact"],
  cta: { label: "Subscribe", href: "#subscribe" },
  secondaryCta: null,
  search: false,
  cart: false,
  footerColumns: [
    { heading: "Browse", links: ["Latest", "Archive", "Topics", "About"] },
    { heading: "Elsewhere", links: ["RSS", "Newsletter", "Contact"] },
  ],
  footerContact: false,
  footerBlurb: "who is behind the site and what they publish",
};

export const SITE_CHROME_SPECS: Readonly<Record<SiteArchetype, SiteChromeSpec>> = {
  "local-business": LOCAL_BUSINESS,
  product: PRODUCT,
  commerce: COMMERCE,
  editorial: EDITORIAL,
};

/**
 * Archetype from the classifier's app type.
 *
 * Unmapped types fall to local-business — the historical behaviour — so this
 * can only ever make a KNOWN product more accurate, never make an unknown one
 * worse. app-shell types never reach here; site chrome is skipped for them
 * entirely (see website-chrome.ts).
 */
export function siteArchetypeForAppType(appType?: BuildAppType | string): SiteArchetype {
  switch (appType) {
    case "ecommerce":
    case "marketplace":
      return "commerce";
    case "saas":
    case "social":
      return "product";
    case "blog":
    case "portfolio":
      return "editorial";
    default:
      return "local-business";
  }
}

/**
 * Archetype from the 26 designer-template categories (template-refine.ts),
 * which name the product more finely than BuildAppType does.
 */
const CATEGORY_ARCHETYPES: Readonly<Record<string, SiteArchetype>> = {
  saas: "product",
  ai: "product",
  fintech: "product",
  crypto: "product",
  devtool: "product",
  mobileapp: "product",
  waitlist: "product",
  jobboard: "product",
  ecommerce: "commerce",
  blog: "editorial",
  portfolio: "editorial",
  photography: "editorial",
  podcast: "editorial",
  newsletter: "editorial",
};

export function siteArchetypeForCategory(category?: string): SiteArchetype {
  return (category && CATEGORY_ARCHETYPES[category]) || "local-business";
}

export function siteChromeSpec(archetype: SiteArchetype): SiteChromeSpec {
  return SITE_CHROME_SPECS[archetype];
}

/**
 * Subject vocabulary, for when the app type names the ARTIFACT and not the
 * product behind it.
 *
 * "Build a SaaS landing page for a developer tool" classifies as
 * marketing-website — correctly, it IS a landing page — but its chrome should
 * be a product header, not a plumber's. The artifact decides the app type; the
 * subject decides the chrome.
 */
const PRODUCT_SUBJECT =
  /\b(saas|b2b|software|platform|api|sdk|dev(?:eloper)?[- ]?tool|devtool|open[- ]source|startup|waitlist|early access|fintech|crypto|web3|ai (?:startup|tool|product|app)|mobile app|analytics|infrastructure)\b/i;
const COMMERCE_SUBJECT =
  /\b(store|shop|storefront|e-?commerce|marketplace|boutique|catalog(?:ue)?|product page)\b/i;
const EDITORIAL_SUBJECT =
  /\b(blog|portfolio|photograph(?:y|er)|podcast|newsletter|magazine|zine|writer|journal)\b/i;

/**
 * The archetype for a build: app type first (it is the stronger signal), then
 * subject vocabulary for the generic marketing/unknown types. Falls back to
 * local-business, the historical default, so an unrecognised prompt is never
 * made worse.
 */
export function siteArchetypeForBuild(
  prompt: string,
  appType?: BuildAppType | string,
): SiteArchetype {
  const byType = siteArchetypeForAppType(appType);
  if (byType !== "local-business") return byType;
  // Only the generic types consult the subject; a restaurant or real-estate
  // classification is already specific and must not be second-guessed.
  if (appType && appType !== "marketing-website" && appType !== "general-app") return byType;
  if (COMMERCE_SUBJECT.test(prompt)) return "commerce";
  if (EDITORIAL_SUBJECT.test(prompt)) return "editorial";
  if (PRODUCT_SUBJECT.test(prompt)) return "product";
  return "local-business";
}
