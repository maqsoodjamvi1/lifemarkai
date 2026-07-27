/**
 * Canonical website header chrome for marketing / storefront / landing sites.
 * Admin/dashboard shells keep sidebar + topbar and are excluded.
 */

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

Implement as \`src/components/layout/Header.tsx\` (or \`Navbar.tsx\`) and mount it at the top of \`App.tsx\` / root layout.
Do NOT put contact/social only in the footer — they belong in the top bar as well.

### Layout / CSS preservation (critical — do not break the rest of the page)
- Header edits MUST NOT remove, empty, or restyle away the page middle (hero, sections, main) or Footer.
- NEVER delete, blank, or overwrite \`src/index.css\` / \`app/globals.css\` / \`main.tsx\` CSS imports when changing the header.
- NEVER remove \`<Footer />\` / footer markup, or strip Tailwind classes from main/hero/footer while upgrading the header.
- Keep existing theme tokens, spacing, and section classNames intact — only change the header chrome (and padding-top if switching to fixed).
- When upgrading an existing single-row header to two-tier, patch ONLY the header block (or Header.tsx). Do not rewrite App.tsx end-to-end.

Admin/dashboard apps are exempt (use sidebar + content topbar instead).
`.trim();
