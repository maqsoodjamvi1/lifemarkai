/**
 * Canonical website header chrome for marketing / storefront / landing sites.
 * Admin/dashboard shells keep sidebar + topbar and are excluded.
 */

import type { SiteChromeSpec } from "../templates/site-archetype.ts";

export const WEBSITE_HEADER_SECTIONS = [
  "top bar (phone, email, social icons)",
  "main header row (logo + menu links on one row, optional CTA)",
] as const;

const ADMIN_OR_APP_SHELL =
  /\b(sidebar|topbar|kpi|dashboard|collapsible sidebar|admin)\b/i;

const NAV_OR_TOP_SECTION =
  /^(sticky\s+)?(nav|navbar|minimal\s+nav|announcement\s+bar|top\s+bar|minimal\s+logo)\b/i;

/** Categories that use the two-row marketing header (not admin shells). */
export const WEBSITE_HEADER_CATEGORIES = new Set([
  "saas",
  "portfolio",
  "ecommerce",
  "blog",
  "agency",
  "event",
  "restaurant",
  "realestate",
  "fitness",
  "medical",
  "education",
  "travel",
  "nonprofit",
  "services",
  "photography",
  "ai",
  "fintech",
  "crypto",
  "mobileapp",
  "devtool",
  "waitlist",
  "podcast",
  "beauty",
  "newsletter",
  "jobboard",
]);

/**
 * Ensure website section blueprints start with top bar + logo/menu row.
 * Leaves admin/dashboard blueprints unchanged.
 */
export function ensureWebsiteHeaderSections(
  sections: string[],
  category?: string,
): string[] {
  if (category && !WEBSITE_HEADER_CATEGORIES.has(category)) return sections;
  if (sections.some((s) => ADMIN_OR_APP_SHELL.test(s))) return sections;

  const rest = sections.filter((s) => !NAV_OR_TOP_SECTION.test(s.trim()));
  return [...WEBSITE_HEADER_SECTIONS, ...rest];
}

/** Prompt block injected into system / design / template refinement prompts. */
export const WEBSITE_HEADER_CONTRACT = `
### WEBSITE HEADER CONTRACT (mandatory for every marketing / landing / storefront / portfolio site)
Do NOT use a single-row-only header. Every public website MUST use this two-tier chrome:

1. **Top bar** (\`h-9\` / \`h-10\`, compact text-xs):
   - Left: contact info — phone + email (use realistic placeholders for the brand)
   - Right: social icons (at least 3: e.g. Facebook, Instagram, Twitter/X, LinkedIn, or YouTube)
   - Subtle contrasting surface (slightly darker/lighter than the main header)
   - Hide or collapse gracefully on very small screens if needed, but keep it on md+

2. **Main header row** (\`h-14\` / \`h-16\`, one horizontal row):
   - Left: **logo** (wordmark or mark + brand name) — never omit
   - Center or right of logo: **primary menu links** on the SAME row (Home, About, Services/Shop, Contact, etc.)
   - Far right: optional primary CTA / cart / account — still on the same row
   - Editor preview width is often tablet-sized (about 640-900px), so primary menu text must be visible on md+; prefer \`hidden md:flex\` for desktop/tablet links and \`md:hidden\` for the hamburger. Avoid hiding all header links until \`lg\` unless there is a labelled menu button.
   - Storefront/e-commerce headers must show Shop / Quick Shop and category links on md+ and duplicate the same links inside the mobile menu.
   - Use \`sticky top-0 z-50\` (PREFERRED) with backdrop-blur + bottom border matching the theme
   - Prefer sticky over \`fixed\` so hero / middle sections / footer keep normal document flow and their Tailwind classes still apply visually
   - If you must use \`fixed\`, ALSO add matching top padding/spacer on the first content section (≈ top-bar + main-row height, e.g. \`pt-28\` / \`pt-32\`) so content is never hidden under the header
   - Mobile: hamburger that opens the same menu links; logo stays visible

Implement as \`src/components/layout/Header.tsx\` (or \`Navbar.tsx\`) and mount it in the ROOT LAYOUT,
so every page gets it: \`src/routes/__root.tsx\` for TanStack Start apps (inside \`<body>\`, wrapping
\`{children}\`), or \`src/App.tsx\` for Vite SPA apps. TanStack Start apps have NO \`App.tsx\`.
Pair it with \`src/components/layout/Footer.tsx\` mounted in the same place — a public site with a
header and no footer is an incomplete build, not a style choice.
Do NOT put contact/social only in the footer — they belong in the top bar as well.

### Layout / CSS preservation (critical — do not break the rest of the page)
- Header edits MUST NOT remove, empty, or restyle away the page middle (hero, sections, main) or Footer.
- NEVER delete, blank, or overwrite \`src/index.css\` / \`app/globals.css\` / \`main.tsx\` CSS imports when changing the header.
- NEVER remove \`<Footer />\` / footer markup, or strip Tailwind classes from main/hero/footer while upgrading the header.
- Keep existing theme tokens, spacing, and section classNames intact — only change the header chrome (and padding-top if switching to fixed).
- When upgrading an existing single-row header to two-tier, patch ONLY the header block (or Header.tsx). Do not rewrite App.tsx end-to-end.

Admin/dashboard apps are exempt (use sidebar + content topbar instead).
`.trim();

/**
 * The footer half of the site chrome contract.
 *
 * The header had a mandatory, detailed contract; the footer had NOTHING — the
 * header contract's only mention was one line telling the model to "pair it
 * with Footer.tsx". So the shape of a footer was left entirely to the model
 * while `ensureWebsiteChrome` stood ready to synthesise a very specific
 * four-column one, and the two had no reason to agree. A model-authored footer
 * satisfied `hasSiteFooter()` and shipped whatever it happened to be — most
 * often a single centred copyright line under a page full of real content.
 *
 * The sections below describe the SAME shape `siteFooterSource()` builds
 * (templates/site-chrome.ts), so a model-authored footer and a synthesised one
 * are interchangeable. A test pins that correspondence.
 */
export const WEBSITE_FOOTER_CONTRACT = `
### WEBSITE FOOTER CONTRACT (mandatory for every marketing / landing / storefront / portfolio site)
A single centred copyright line is NOT a footer. Every public site ships a multi-column footer:

1. **Brand column** — wordmark/brand name, one or two sentences of real positioning copy
   (never Lorem ipsum), and at least 3 social icons (lucide-react).
2. **Link columns** — two or three, each with a bold heading and 3-5 real links:
   navigation ("Home, About, Services, Contact") and company ("Careers, Press, Privacy, Terms").
   Anchor links (\`#about\`) are fine on a one-page site; multi-page sites use real routes.
3. **Contact column** — address, phone (\`tel:\` link) and email (\`mailto:\` link), each with a
   lucide icon. Use realistic values for the brand, never "123 Main St" or "email@example.com".
4. **Bottom bar** — separated by a top border: \`© {new Date().getFullYear()} Brand. All rights
   reserved.\` on one side, secondary note on the other.

Layout: \`grid gap-10 sm:grid-cols-2 lg:grid-cols-4\` inside a \`max-w-6xl\` container, generous
vertical padding (\`py-14\`), a top border separating it from the page, and a surface that
contrasts with the page background. Theme-aware in both light and dark.

Implement as \`src/components/layout/Footer.tsx\` and mount it in the ROOT LAYOUT beside the
header — \`src/routes/__root.tsx\` for TanStack Start, \`src/App.tsx\` for Vite SPA — so every page
gets it. A site with a header and no footer is an incomplete build.

Admin/dashboard apps are exempt (a staff tool needs no marketing footer).
`.trim();

// ─── Archetype-aware contracts ───────────────────────────────────────────────
// The two contracts above describe ONE shape — contact-forward local-business
// chrome — and shipped to all 26 site categories. The renderers below take the
// archetype's spec instead, so a SaaS page is never told a phone number is
// mandatory and a storefront is told about search and cart. Both read the same
// SiteChromeSpec the injector builds from, so contract and generated component
// cannot drift.

/** Rules that hold whatever the site is. Kept verbatim from the original contract. */
const CHROME_INVARIANTS = `
### Layout / CSS preservation (critical — do not break the rest of the page)
- Header edits MUST NOT remove, empty, or restyle away the page middle (hero, sections, main) or Footer.
- NEVER delete, blank, or overwrite \`src/index.css\` / \`app/globals.css\` / \`main.tsx\` CSS imports when changing the header.
- NEVER remove \`<Footer />\` / footer markup, or strip Tailwind classes from main/hero/footer while upgrading the header.
- Keep existing theme tokens, spacing, and section classNames intact — only change the header chrome (and padding-top if switching to fixed).
- Use \`sticky top-0 z-50\` (PREFERRED) with backdrop-blur + a bottom border matching the theme. Prefer sticky over \`fixed\` so hero / middle sections / footer keep normal document flow; if you must use \`fixed\`, ALSO add matching top padding on the first content section.
- Editor preview width is often tablet-sized (about 640-900px): primary menu text must be visible on md+. Prefer \`hidden md:flex\` for desktop/tablet links and \`md:hidden\` for the hamburger. Avoid hiding all header links until \`lg\`.
- Mobile: a hamburger that opens the SAME links; the logo stays visible.

Mount the header and the footer in the ROOT LAYOUT so every page gets both —
\`src/routes/__root.tsx\` for TanStack Start (inside \`<body>\`, wrapping \`{children}\`),
\`src/App.tsx\` for Vite SPA apps. TanStack Start apps have NO \`App.tsx\`.
A public site with a header and no footer is an incomplete build, not a style choice.

Admin/dashboard apps are exempt from all of the above (sidebar + content topbar instead).
`.trim();

export function renderWebsiteHeaderContract(spec: SiteChromeSpec): string {
  const rows: string[] = [];
  if (spec.contactTopBar) {
    rows.push(`1. **Top bar** (\`h-9\` / \`h-10\`, compact text-xs) — contact-forward, because visitors to this kind of site call or email:
   - Left: phone + email (realistic values for the brand, never "123 Main St" or "email@example.com")
   - Right: at least 3 social icons (lucide-react)
   - A subtly contrasting surface; may hide below \`md\`, but keep it on md+`);
  } else {
    rows.push(`1. **NO contact top bar.** Do NOT put a phone number, email strip or social-icon row above the header. This is a ${spec.label.toLowerCase()}: a "call us" strip reads as an unedited template. Contact belongs in the footer.`);
  }

  const utilities: string[] = [];
  if (spec.search) utilities.push("a search input (expands on mobile)");
  if (spec.cart) utilities.push("a cart button showing item count");
  const actions = [spec.secondaryCta, spec.cta]
    .filter((a): a is { label: string; href: string } => !!a)
    .map((a) => `**${a.label}**`);

  rows.push(`${spec.contactTopBar ? "2" : "2"}. **Main header row** (\`h-14\` / \`h-16\`, ONE horizontal row):
   - Left: **logo** (wordmark or mark + brand name) — never omit
   - Menu links on the SAME row: ${spec.nav.map((n) => `\`${n}\``).join(", ")} (adapt the labels to the actual product; keep the shape)
${utilities.length > 0 ? `   - Utilities: ${utilities.join(" and ")}\n` : ""}   - Far right: ${actions.length > 0 ? `${actions.join(" then ")} — still on the same row` : "keep it clean; no marketing CTA is required"}`);

  return `
### WEBSITE HEADER CONTRACT — ${spec.label}
Do NOT use a generic single-row-only header. This site uses:

${rows.join("\n\n")}

${CHROME_INVARIANTS}
`.trim();
}

export function renderWebsiteFooterContract(spec: SiteChromeSpec): string {
  const columns = spec.footerColumns
    .map((c, i) => `${i + 2}. **${c.heading}** — ${c.links.map((l) => `\`${l}\``).join(", ")} (real links, adapted to the product)`)
    .join("\n");

  return `
### WEBSITE FOOTER CONTRACT — ${spec.label}
A single centred copyright line is NOT a footer. Ship a multi-column footer:

1. **Brand column** — wordmark, one or two sentences on ${spec.footerBlurb} (never Lorem ipsum), and at least 3 social icons (lucide-react).
${columns}
${spec.footerContact ? `${spec.footerColumns.length + 2}. **Contact column** — address, phone (\`tel:\` link) and email (\`mailto:\` link), each with a lucide icon and realistic values for the brand.` : `${spec.footerColumns.length + 2}. **No address/phone column** — this is a ${spec.label.toLowerCase()}; a single support email link is enough.`}
${spec.footerColumns.length + 3}. **Bottom bar** — separated by a top border: \`© {new Date().getFullYear()} Brand. All rights reserved.\` on one side, a secondary note on the other.

Layout: \`grid gap-10 sm:grid-cols-2 lg:grid-cols-4\` in a \`max-w-6xl\` container, generous vertical
padding (\`py-14\`), a top border separating it from the page, and a surface that contrasts with the
page background. Theme-aware in both light and dark.

Implement as \`src/components/layout/Footer.tsx\` and mount it in the ROOT LAYOUT beside the header.

Admin/dashboard apps are exempt (a staff tool needs no marketing footer).
`.trim();
}
