export type BuildAppType =
  | "marketing-website"
  | "ecommerce"
  | "erp"
  | "pos"
  | "crm"
  | "admin-dashboard"
  | "saas"
  | "booking"
  | "marketplace"
  | "education"
  | "social"
  // ── Vertical systems ────────────────────────────────────────────────────
  // Each of these was previously answered by a generic blueprint ("admin
  // dashboard", "booking") that produced a plausible but domain-blind app: a
  // clinic build with no patient chart, a fleet build with no dispatch board.
  // A vertical gets its own type when its ENTITIES differ, not just its words.
  | "healthcare"
  | "hr"
  | "accounting"
  | "logistics"
  | "helpdesk"
  | "school"
  | "hotel"
  | "project-management"
  | "real-estate"
  | "restaurant"
  | "events"
  | "fitness"
  | "blog"
  | "portfolio"
  | "general-app";

export interface BuildIntent {
  appType: BuildAppType;
  niche: string | null;
  statusLabel: string;
  blueprint: string;
  /** Minimum file count a real version of this app type should have. */
  minFiles: number;
}

/**
 * Per-type minimum file counts — the quality gate uses these to detect a build
 * that came out too thin (e.g. only the scaffold) and trigger an enrichment pass.
 * Keep in sync with each blueprint's stated "Minimum N files".
 */
export const MIN_FILES_BY_TYPE: Record<BuildAppType, number> = {
  "marketing-website": 18,
  ecommerce: 22,
  erp: 24,
  pos: 12,
  crm: 12,
  "admin-dashboard": 12,
  saas: 14,
  booking: 12,
  marketplace: 14,
  education: 13,
  social: 12,
  healthcare: 16,
  hr: 16,
  accounting: 16,
  logistics: 16,
  helpdesk: 13,
  school: 16,
  hotel: 15,
  "project-management": 14,
  "real-estate": 15,
  restaurant: 15,
  events: 13,
  fitness: 14,
  blog: 12,
  portfolio: 10,
  "general-app": 10,
};

const ECOMMERCE_KEYWORDS = /\b(e-?commerce|ecomerce|ecoomerce|online store|online shop|web ?shop|storefront|shopping cart|add to cart|product catalog|product listing|stripe checkout|sell products?|store with cart|shop with cart|clothing store|shoe store|fashion store|electronics store|grocery store)\b/i;
const ERP_KEYWORDS = /\b(erp|enterprise resource|inventory management|supply chain|procurement|warehouse|purchase order|bill of materials|bom)\b/i;
// POS = in-person retail terminal. Note: bare "checkout"/"cart" are intentionally
// NOT here — those belong to e-commerce. POS needs explicit point-of-sale terms.
const POS_KEYWORDS = /\b(pos|point[- ]of[- ]sale|cash register|retail terminal|receipt printer|barcode scanner|shift report|cashier station)\b/i;
const CRM_KEYWORDS = /\b(crm|customer relationship|sales pipeline|lead management|deal stage|contact management)\b/i;
const ADMIN_KEYWORDS = /\b(admin panel|admin dashboard|back office|management system|management app|operations dashboard|internal tool|backoffice|business management)\b/i;
const APP_KEYWORDS = /\b(application|app|platform|portal|system|software)\b/i;
const SAAS_KEYWORDS = /\b(saas|subscription|billing portal|multi-tenant|pricing tier)\b/i;
const BOOKING_KEYWORDS = /\b(booking|appointment|reservation|reserve|scheduling app|time slot|calendar booking|salon booking|clinic booking|table booking|rental)\b/i;
const MARKETPLACE_KEYWORDS = /\b(marketplace|multi-vendor|multi vendor|buyers and sellers|listings platform|classifieds|peer-to-peer|p2p platform)\b/i;
const EDUCATION_KEYWORDS = /\b(lms|learning platform|course platform|e-?learning|online courses?|student portal|school portal|quiz app|tutoring)\b/i;
const SOCIAL_KEYWORDS = /\b(social network|social app|community platform|forum|discussion board|feed app|follow(ers)? system|posts and comments)\b/i;
const BUILDER_KEYWORDS = /\b(chat-to-app|app builder|lovable|builder ui|lovable-style|lovable clone)\b/i;
const WEBSITE_KEYWORDS = /\b(website|landing page|marketing site|company site|business site|homepage|portfolio|rebrand|rebranding|brand)\b/i;

// ── Vertical systems ──────────────────────────────────────────────────────
//
// DESIGN RULE for every regex below: match on what the app DOES, never on the
// industry noun alone. "A landing page for a dental clinic" and "a patient
// records system for a dental clinic" name the same industry and want opposite
// apps — the first is a brochure, the second is an EMR. Bare "clinic",
// "restaurant", "gym", "hotel" therefore appear NOWHERE in these patterns;
// only functional phrases ("patient records", "kitchen display", "member
// check-in", "front desk") do. This is what keeps every marketing-website case
// classifying as a website after adding fourteen new verticals.
const HEALTHCARE_KEYWORDS = /\b(emr|ehr|electronic (medical|health) record|patient records?|patient portal|patient management|clinic management|hospital management|medical practice|telemedicine|prescriptions?|medical charts?|patient charts?|doctor(?:'s)? (?:portal|dashboard)|health records?)\b/i;
const HR_KEYWORDS = /\b(hrms|hris|applicant tracking|\bats\b|recruitment (?:system|platform|tool)|hiring pipeline|payroll|employee onboarding|leave management|attendance (?:system|tracker)|performance review|hr (?:system|portal|platform|management)|staff management|timesheet)\b/i;
const ACCOUNTING_KEYWORDS = /\b(accounting (?:system|software|app)|bookkeeping|general ledger|chart of accounts|journal entr|expense (?:tracker|management|report)|invoicing (?:app|system|tool)|invoice generator|billing system|accounts (?:payable|receivable)|balance sheet|profit and loss|p&l|tax filing|payment reconciliation)\b/i;
const LOGISTICS_KEYWORDS = /\b(fleet management|shipment tracking|delivery tracking|dispatch|courier|route planning|route optimi[sz]ation|freight|last[- ]mile|waybill|consignment|trucking|transport management|logistics (?:system|platform|dashboard)|driver (?:app|portal|tracking)|parcel tracking)\b/i;
const HELPDESK_KEYWORDS = /\b(helpdesk|help desk|service desk|support tickets?|ticket (?:system|queue)|customer support (?:portal|system|platform)|\bsla\b|knowledge base|live chat support|complaint management)\b/i;
const SCHOOL_KEYWORDS = /\b(school management|student information system|\bsis\b|gradebook|grade book|report cards?|attendance register|class timetable|admission management|fee management|parent portal|teacher portal|school (?:erp|administration)|management system for a school)\b/i;
const HOTEL_KEYWORDS = /\b(hotel management|property management system|\bpms\b|front desk|guest check[- ]?in|housekeeping|room (?:booking|inventory|availability)|occupancy rate|hospitality (?:system|platform)|resort management|hostel management|guest folio)\b/i;
const PROJECT_KEYWORDS = /\b(project management|task (?:management|tracker|board)|kanban board|sprint (?:board|planning)|scrum|product backlog|issue tracker|bug tracker|gantt|milestone tracking|jira|trello|asana|time tracking (?:app|tool))\b/i;
const REAL_ESTATE_KEYWORDS = /\b(real[- ]estate|property listings?|property portal|property search|realtor|\bmls\b|house listings?|apartment listings?|rental listings?|listing agent|open house|estate agency)\b/i;
const RESTAURANT_KEYWORDS = /\b(restaurant menu|menu management|food ordering|food delivery|online ordering|order food|kitchen display|kitchen order|table reservation|restaurant management|dine[- ]in|takeaway|take[- ]out ordering|digital menu|qr menu)\b/i;
const EVENTS_KEYWORDS = /\b(event management|event ticketing|ticket sales|sell tickets|\brsvp\b|attendee|event registration|conference (?:app|platform|site)|venue booking|event planner|guest list)\b/i;
const FITNESS_KEYWORDS = /\b(gym management|membership management|member check[- ]?in|workout (?:tracker|plan|log)|fitness (?:tracker|app)|training plan|class booking|personal training (?:system|platform)|exercise log|nutrition tracker)\b/i;
const BLOG_KEYWORDS = /\b(blog|\bcms\b|content management system|publishing platform|magazine site|news site|newsroom|articles? (?:site|platform)|editorial)\b/i;
const PORTFOLIO_KEYWORDS = /\b(portfolio (?:site|website|page)|personal (?:site|website)|resume (?:site|website|builder)|cv (?:site|website)|showcase my work|freelancer? portfolio|photographer portfolio|designer portfolio)\b/i;

/**
 * Unambiguous "I want a marketing website" phrasing.
 *
 * Checked FIRST, before every vertical, and this ordering is the whole reason
 * the vertical expansion is safe: "a landing page for a dental clinic", "a
 * fitness studio landing page", "a website for my restaurant" all name an
 * industry a vertical would otherwise claim. Saying "landing page" or
 * "website" is an explicit statement about the ARTIFACT, and it wins.
 */
const SITE_INTENT_KEYWORDS = /\b(landing page|marketing site|company site|business site|brochure site|one[- ]pager|one[- ]page site|homepage|web ?site)\b/i;

/**
 * …unless the same prompt also asks for transactional or back-office behaviour.
 * "A website where customers order food online" wants a real ordering app that
 * happens to be called a website. Deliberately NARROW — words like "schedule",
 * "services" and "pricing" appear on ordinary brochure sites and must not
 * cancel the site guard.
 */
const SITE_FUNCTIONAL_OVERRIDE =
  /\b(order online|online ordering|order food|add to cart|shopping cart|checkout|admin (?:panel|dashboard)|dashboard|back ?office|inventory|manage (?:my |our |the )?(?:orders?|bookings?|patients?|employees?|projects?|inventory|listings?|members?)|point[- ]of[- ]sale|\berp\b|\bcrm\b|\bpos\b)\b/i;

/**
 * Reduce a raw capture to the INDUSTRY phrase.
 *
 * The capture patterns are greedy about what follows the preposition, so
 * "for a dental clinic with appointments and prescriptions" arrived whole and
 * surfaced in the UI as "Building Dental Clinic With Appointments And
 * Prescriptions clinic system…" and in the blueprint as a nonsense bold name.
 * Everything after a clause connector describes the FEATURES, not the
 * business, so the niche ends there. Brand names are a separate concern —
 * `site-chrome.deriveBrand` extracts those from the "called X" part.
 */
function cleanNiche(raw: string): string | null {
  const stopped = raw
    .trim()
    .replace(/\s+/g, " ")
    // "for my plumbing business" → "plumbing business", not "my plumbing".
    .replace(/^(?:my|our|the|a|an|this)\s+/i, "")
    .split(
      /\s+(?:with|that|which|where|when|so|having|include|including|featuring|plus|called|named|to|and)\s+/i,
    )[0]
    .replace(/[.,!?;:]+$/, "")
    .replace(
      /\s+(?:with|that|which|and|for|to|having|where|plus|including|featuring|so|in|on|at|of)$/i,
      "",
    )
    .trim();
  // Three words is enough to name any industry ("wholesale distribution
  // business", "independent coffee roastery"); more is a run-on sentence.
  const words = stopped.split(" ").filter(Boolean).slice(0, 3);
  const niche = words.join(" ");
  if (niche.length < 3) return null;
  if (/^(the|a|an|my|our|this|that|some|any|new|it|us|them)$/i.test(niche)) return null;
  return niche;
}

function extractNiche(prompt: string): string | null {
  const patterns = [
    /(?:for|about|called|named)\s+(?:a\s+)?([a-z][\w\s&-]{2,40}?)(?:\s+(?:website|app|system|platform|business)|[.,!?]|$)/i,
    /create\s+(?:a\s+)?([a-z][\w\s&-]{2,40}?)\s+(?:website|landing|app)/i,
    /(?:website|site|app)\s+for\s+([a-z][\w\s&-]{2,40})/i,
    /change\s+(?:this\s+)?(?:website\s+)?(?:services?\s+)?to\s+([a-z][\w\s&-]{2,40})/i,
    // "manage my bakery business", "track our salon inventory" — the noun
    // between the verb and the business-word is the niche.
    /\b(?:manage|track|run)\s+(?:my\s+|our\s+)?([a-z][\w\s&-]{2,30}?)\s+(?:business|store|shop|company|inventory|sales|operations)\b/i,
    // "for my boutique" (end of clause) — common in casual prompts.
    /\bfor\s+my\s+([a-z][\w\s&-]{2,30}?)(?:[.,!?]|$)/i,
  ];
  for (const re of patterns) {
    const m = prompt.match(re);
    if (m?.[1]) {
      const niche = cleanNiche(m[1]);
      if (niche) return niche;
    }
  }
  return null;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Weighted-scoring RESCUE for vague "vibe" prompts — runs ONLY when the
 * explicit keyword chain above it found nothing (general-app) or fell through
 * to the weak build-verb+app-word admin default. It never overrides a chain
 * decision, so every validated classification keeps its exact result.
 *
 * The idea (and most of the vocabulary) comes from an external rewrite that
 * scored EVERY prompt this way — that version was rejected because (a) its
 * explicit-name check used substring matching, so "posts" classified as POS
 * and "interpreter" as ERP, and (b) full-time scoring regressed cases the
 * ordered chain resolves deliberately ("online store with inventory
 * management" → ERP instead of ecommerce). As a fallback behind the chain,
 * with word-boundary plural-tolerant patterns, the good part survives: a
 * prompt like "something for teachers to give quizzes and track grades"
 * lands on education instead of a generic app.
 */
const VAGUE_SIGNALS: Array<{ type: BuildAppType; regex: RegExp; weight: number }> = [
  { type: "pos", regex: /\b(cashiers?|registers?|receipts?|tills?|barcodes?)\b/i, weight: 2 },
  { type: "erp", regex: /\b(suppliers?|warehouses?|stock|reorder|logistics|production|procurement|invoices?|invoicing)\b/i, weight: 2 },
  { type: "crm", regex: /\b(leads?|deals?|pipelines?|prospects?|follow[- ]?ups?|opportunit(y|ies))\b/i, weight: 2 },
  { type: "ecommerce", regex: /\b(carts?|checkout|shipping)\b/i, weight: 2 },
  { type: "ecommerce", regex: /\b(stores?|shops?|sell(ing)?|products?)\b/i, weight: 1 },
  { type: "booking", regex: /\b(appointments?|reservations?|slots?|availability|schedul(e|es|ing)|calendars?)\b/i, weight: 2 },
  { type: "marketplace", regex: /\b(listings?|sellers?|buyers?|vendors?|auctions?|bids?|classifieds?)\b/i, weight: 2 },
  { type: "education", regex: /\b(courses?|lessons?|quiz(zes)?|assignments?|grades?|certificates?|instructors?|students?|teachers?)\b/i, weight: 2 },
  { type: "social", regex: /\b(posts?|comments?|likes?|followers?|follow(ing)?|friends?|feeds?|profiles?|groups?|share|sharing)\b/i, weight: 2 },
  { type: "admin-dashboard", regex: /\b(dashboards?|analytics|metrics|kpis?|monitoring)\b/i, weight: 2 },
  { type: "saas", regex: /\b(subscriptions?|billing|tenants?|pricing tiers?)\b/i, weight: 2 },
  // Vertical vocabulary — same rules: distinct terms, functional not industry.
  { type: "healthcare", regex: /\b(patients?|prescriptions?|diagnos(?:is|es)|vitals?|clinics?|doctors?|nurses?)\b/i, weight: 2 },
  { type: "hr", regex: /\b(employees?|payroll|leave|timesheets?|candidates?|hiring|onboarding|staff)\b/i, weight: 2 },
  { type: "accounting", regex: /\b(invoices?|expenses?|ledgers?|receipts?|bookkeeping|balances?|taxe?s?)\b/i, weight: 2 },
  { type: "logistics", regex: /\b(shipments?|deliver(?:y|ies)|drivers?|fleets?|routes?|parcels?|dispatch)\b/i, weight: 2 },
  { type: "helpdesk", regex: /\b(tickets?|complaints?|support|agents?|escalations?)\b/i, weight: 2 },
  { type: "school", regex: /\b(attendance|report cards?|guardians?|classes|sections?|admissions?|fees?)\b/i, weight: 2 },
  { type: "hotel", regex: /\b(rooms?|guests?|check[- ]?in|check[- ]?out|occupancy|housekeeping)\b/i, weight: 2 },
  { type: "project-management", regex: /\b(tasks?|projects?|sprints?|backlogs?|milestones?|deadlines?|assignees?)\b/i, weight: 2 },
  { type: "real-estate", regex: /\b(properties|propert(?:y)|listings?|tenants?|landlords?|rents?|apartments?)\b/i, weight: 2 },
  { type: "restaurant", regex: /\b(menus?|dishes|orders?|kitchens?|tables?|recipes?|cuisines?)\b/i, weight: 2 },
  { type: "events", regex: /\b(events?|tickets?|attendees?|venues?|registrations?|guests?)\b/i, weight: 2 },
  { type: "fitness", regex: /\b(workouts?|members?|trainers?|exercises?|classes|memberships?)\b/i, weight: 2 },
  { type: "blog", regex: /\b(articles?|posts?|authors?|drafts?|categor(?:y|ies)|publish(?:ing)?)\b/i, weight: 2 },
  { type: "portfolio", regex: /\b(portfolios?|resumes?|\bcv\b|my work|case stud(?:y|ies))\b/i, weight: 2 },
];

/** Niche-word associations — a small nudge, not a decider. */
const NICHE_TYPE_BOOSTS: Array<{ type: BuildAppType; regex: RegExp }> = [
  { type: "ecommerce", regex: /\b(fashion|clothing|shoes?|electronics|grocery|boutique|jewell?ery|furniture)\b/i },
  { type: "booking", regex: /\b(salon|spa|barber|rental|consultation)\b/i },
  { type: "education", regex: /\b(course|tutor|academy|training)\b/i },
  { type: "marketplace", regex: /\b(vendor|seller|buyer|classified|auction)\b/i },
  { type: "social", regex: /\b(community|forum|network|club)\b/i },
  { type: "healthcare", regex: /\b(clinic|dentist|doctor|medical|hospital|pharmacy|vet(erinary)?)\b/i },
  { type: "restaurant", regex: /\b(restaurant|cafe|café|bakery|pizzeria|diner|bistro|food)\b/i },
  { type: "fitness", regex: /\b(gym|fitness|yoga|crossfit|pilates)\b/i },
  { type: "hotel", regex: /\b(hotel|resort|hostel|guest ?house|homestay)\b/i },
  { type: "real-estate", regex: /\b(real ?estate|property|realty|housing)\b/i },
  { type: "logistics", regex: /\b(logistics|courier|freight|trucking|transport|cargo)\b/i },
  { type: "school", regex: /\b(school|college|institute)\b/i },
];

const VAGUE_SCORE_THRESHOLD = 4;

function rescueVagueIntent(prompt: string, niche: string | null): BuildAppType | null {
  const scores = new Map<BuildAppType, number>();
  for (const { type, regex, weight } of VAGUE_SIGNALS) {
    // Count DISTINCT vocabulary hits, not just "regex matched": one stray
    // domain word ("orders") is noise, but "leads, follow-ups AND prospects"
    // is a CRM prompt. Two distinct terms clear the threshold; one does not.
    const seen = new Set<string>();
    const g = new RegExp(regex.source, "gi");
    for (const m of prompt.matchAll(g)) {
      seen.add(m[0].toLowerCase().replace(/s$/, ""));
    }
    if (seen.size > 0) {
      const hits = Math.min(seen.size, 3);
      scores.set(type, (scores.get(type) ?? 0) + weight * hits);
    }
  }
  if (niche) {
    for (const { type, regex } of NICHE_TYPE_BOOSTS) {
      if (regex.test(niche)) scores.set(type, (scores.get(type) ?? 0) + 3);
    }
  }
  let best: BuildAppType | null = null;
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return bestScore >= VAGUE_SCORE_THRESHOLD ? best : null;
}

const BLUEPRINTS: Record<BuildAppType, (niche: string | null) => string> = {
  "marketing-website": (niche) => `## Autonomous Complete Website Blueprint
You are building a complete, production-style niche website${niche ? ` for **${titleCase(niche)}**` : ""}. Act like Lovable — infer everything yourself. Do NOT ask questions. A "website" is never a single landing page unless the user explicitly says one-page.

Required site map (5–10 linked pages):
1. **Home** — hero, trust indicators, 3–6 services/features, featured work/products, testimonials, CTA, footer.
2. **Services / Solutions** — detailed service cards, process timeline, pricing/plan teaser or consultation CTA.
3. **About** — company story, mission, team/leadership cards, stats, certifications/partners.
4. **Portfolio / Case Studies / Gallery** — 6–9 realistic items with detail links/cards, outcomes, industry tags.
5. **Blog / Resources / News** — article list with categories and 3+ seeded posts.
6. **Contact / Lead Capture** — validated form, office/contact details, FAQ, map-style info card.
Optional extra pages when the niche fits: Pricing, Careers, FAQ, Industries, Product Catalog.

Each page must be reachable through React Router nav and footer links; App.tsx wires routes only. Home and Services must each have 5+ rich sections.

Database-backed behavior:
- Include Supabase-ready persistence even for websites: lead/contact submissions, newsletter subscribers, blog/resources, case studies/portfolio items, testimonials, and optional service inquiries.
- Generate \`supabase/migrations/001_website_schema.sql\` with tables, indexes, RLS enabled, owner/public-safe policies where appropriate.
- Generate \`src/lib/supabase.ts\` (env-based client) and \`src/lib/data-source.ts\` or hooks that read from Supabase when env vars exist, with seeded local fallback data so preview still works without credentials.
- Contact/newsletter forms must call the data layer and show loading/success/error states, not be dead buttons.

Brand & design (infer from niche):
- Pick a professional brand name if none given
- Choose accent colors that fit the industry (logistics=cargo red/navy, healthcare=teal, finance=navy/gold)
- Use realistic business copy — company names, service descriptions, phone placeholders

Minimum 18+ files: scaffold + layout + UI primitives + 5–10 page files + data/hooks + Supabase migration. A website with only Home/About/Contact sections in one file is a failed build.`,

  ecommerce: (niche) => `## Autonomous Database-Backed E-Commerce Store Blueprint
Build a complete, polished online store${niche ? ` for **${titleCase(niche)}**` : ""} — a customer-facing storefront with commerce data models, NOT a POS terminal or admin panel. This must look and behave like a real shop with lots of products and multiple rich sections, never a thin one-page placeholder.

Required storefront pages:
1. **Home / Storefront** — sticky header (logo, nav, search, cart icon with item count), hero banner with a promo headline + CTA, "Shop by category" tiles, a FEATURED PRODUCTS grid (at least 8 products), a value-props row (free shipping · easy returns · secure checkout), a newsletter signup, and a rich multi-column footer.
2. **Shop / Category listing** — filter sidebar (category, price range, rating), a sort dropdown, and a responsive product-card grid (image placeholder, name, price, star rating, Add-to-cart button).
3. **Product detail** — large image placeholder + thumbnails, title, price, star rating + review count, quantity selector, Add-to-cart, a description, and a "You may also like" related row.
4. **Cart** — line items with quantity steppers and remove, plus an order summary (subtotal, shipping, tax, total) and a "Proceed to checkout" button.
5. **Checkout** — contact + shipping form, an order summary, a mock Stripe payment step, and a success/confirmation screen with an order number.
6. **Orders / Account** — customer order history/status lookup using email/order number.
7. **Admin Products** — product/inventory table, create/edit product modal, stock/status badges.
8. **Admin Orders** — orders table with status workflow (pending/paid/fulfilled/cancelled), order detail drawer.

Architecture:
- React Router for all pages above; cart state in \`src/hooks/useCart.ts\` (add / remove / updateQty / total) — interactions must actually work, not dead buttons.
- \`src/data/products.ts\` — at least 12 realistic ${niche ?? "retail"} products across 4+ categories, each with name, price (in cents), description, category, rating, and an emoji or image placeholder. Use real product names and copy — never "Item 1" or lorem ipsum.
- Reusable \`src/components/ProductCard.tsx\`, \`CartDrawer.tsx\`, and a shared \`src/components/ui/\` kit (Button, Badge, Card).
- Money via \`formatCurrency\`; ratings as star rows.
- Mock Stripe checkout: a styled, validated payment form that shows a success screen — no real Stripe key, clearly labelled as a demo charge.

Database-backed behavior:
- Generate \`supabase/migrations/001_ecommerce_schema.sql\` with products, categories, customers, carts/cart_items, orders/order_items, payments, reviews, inventory_events, newsletter_subscribers.
- Enable RLS on every table and add safe public read policies for catalog tables plus user/order ownership policies.
- Generate \`src/lib/supabase.ts\`, \`src/lib/store-api.ts\`, and hooks that read/write through Supabase when env vars exist, with seeded local fallback data so preview remains usable.
- Checkout must create a pending order through the data layer, reduce local inventory in preview mode, and show success/error states.

Minimum 22+ files. Every storefront/admin page navigable; the home page must be visually full (hero + categories + 8+ products + value props + footer), not two lines of text.`,

  erp: (niche) => `## Autonomous Database-Backed ERP System Blueprint
Build a full ERP-style management application${niche ? ` for **${titleCase(niche)}**` : ""}. This is a business operations system with persistent data models, NOT a marketing site.

Required modules (each = page + components + mock data):
1. **Dashboard** — KPI cards (revenue, orders, inventory, employees), charts, recent activity feed
2. **Inventory** — product table (SKU, qty, warehouse, reorder level), add/edit modal, low-stock alerts
3. **Sales / Orders** — order list with status badges (pending, shipped, delivered), order detail drawer
4. **Purchasing** — purchase orders table, supplier list, approval workflow UI
5. **Customers** — CRM-style customer table with search, filters, detail view
6. **Employees / HR** — employee directory, departments, roles
7. **Reports** — export buttons, date range filter, summary tables
8. **Settings** — company profile, users & roles, preferences
9. **Finance / Invoices** — invoice table, payment status, aging summary
10. **Audit Log** — timeline of inventory/order/user changes

Architecture:
- React Router with sidebar layout (collapsible on mobile)
- \`src/layouts/AppLayout.tsx\` with sidebar nav linking all modules
- \`src/data/mock.ts\` with 20+ realistic rows per entity
- \`src/hooks/use<Entity>.ts\` per domain (useInventory, useOrders, useCustomers…)
- Tables: sortable columns, search, pagination UI, empty/loading states
- Use the shared src/components/ui kit: cards, tables, badges, dialogs, dropdowns

Database-backed behavior:
- Generate \`supabase/migrations/001_erp_schema.sql\` with companies, users/profiles, roles, products, warehouses, inventory_items, inventory_movements, suppliers, purchase_orders, purchase_order_items, customers, sales_orders, sales_order_items, invoices, employees, audit_logs.
- Enable RLS on every table and include owner/company-scoped policies. Never use a \`role\` column on profiles; use membership/roles tables.
- Generate \`src/lib/supabase.ts\`, \`src/lib/erp-api.ts\`, and domain hooks that read/write through Supabase when env vars exist, with seeded local fallback data so preview remains usable.
- CRUD forms must update the data layer and show optimistic loading/success/error states. Tables must support search/filter/sort locally at minimum.

Minimum 24+ files. Every module must be navigable, data-dense, and populated with realistic ${niche ?? "industry"} data.`,

  pos: (niche) => `## Autonomous POS System Blueprint
Build a Point-of-Sale application${niche ? ` for **${titleCase(niche)}**` : ""}.

Required screens:
1. **Register / Checkout** — product grid, cart sidebar, qty controls, subtotal/tax/total, checkout button
2. **Products** — category tabs, search, product cards with price & stock badge
3. **Orders / Transactions** — history table with receipt #, amount, payment method, timestamp
4. **Customers** — quick customer lookup, loyalty points display
5. **Inventory** — stock levels, low-stock warnings
6. **Reports** — daily sales summary, top products, payment breakdown
7. **Settings** — store info, tax rate, receipt template, staff login UI

Architecture:
- Large touch-friendly UI (min 44px tap targets)
- \`src/stores/cartStore.ts\` or useState cart with add/remove/update qty
- \`src/data/products.ts\` with 30+ realistic ${niche ?? "retail"} products
- Split layout: product area + persistent cart panel
- Mock payment flow modal (cash/card) with success receipt screen

Minimum 12+ files. Must feel like a real POS, not a landing page.`,

  crm: (niche) => `## Autonomous CRM Blueprint
Build a CRM application${niche ? ` for **${titleCase(niche)}**` : ""}.

Required modules:
1. **Pipeline** — kanban board (Lead, Qualified, Proposal, Won, Lost) with draggable-style cards
2. **Contacts** — searchable table, tags, last-contacted date
3. **Companies** — account list with industry, size, deal value
4. **Deals** — deal table with stage, value, owner, close date
5. **Activities** — timeline of calls, emails, meetings
6. **Dashboard** — pipeline value, win rate, activities this week
7. **Settings** — team members, pipeline stages config

Use realistic ${niche ?? "B2B"} company names and deal amounts. Minimum 12+ files.`,

  "admin-dashboard": (niche) => `## Autonomous Admin Dashboard Blueprint
Build an internal management dashboard${niche ? ` for **${titleCase(niche)}**` : ""}.

Required:
- Sidebar navigation with 5+ modules inferred from the user's request
- Data tables with CRUD UI (create/edit/delete modals)
- Dashboard with charts (use simple CSS bar charts or recharts if in allowlist)
- User management with roles (admin, editor, viewer)
- Settings page
- Auth UI shell (login page + protected routes)
- Realistic mock data for the ${niche ?? "business"} domain

Minimum 12+ files. Focus on functional admin UX, not marketing fluff.`,

  saas: (niche) => `## Autonomous SaaS Application Blueprint
Build a SaaS product${niche ? ` for **${titleCase(niche)}**` : ""}.

Required:
- Marketing landing page (hero, features, pricing, CTA)
- Auth pages (login, signup)
- App dashboard (post-login)
- Core feature pages inferred from the niche
- Settings (profile, billing placeholder, team)
- Pricing page with 3 tiers

Minimum 14+ files.`,

  booking: (niche) => `## Autonomous Booking System Blueprint
Build a booking/appointment application${niche ? ` for **${titleCase(niche)}**` : ""}.

Required:
1. **Browse** — service/resource cards (name, duration, price, photo placeholder), category filter
2. **Booking flow** — pick service → pick date (calendar grid) → pick time slot (chips, disabled = taken) → details form → confirmation screen with booking ref
3. **My bookings** — upcoming/past tabs, cancel/reschedule actions
4. **Provider/admin view** — day calendar with booked slots, manage availability, customer list
5. **Settings** — business hours, slot duration, blackout dates

Architecture:
- \`src/data/services.ts\` + \`src/data/bookings.ts\` with realistic ${niche ?? "service"} entries
- \`src/hooks/useBookings.ts\` — create/cancel/reschedule with slot-conflict checks
- Calendar built from CSS grid (no external calendar lib), time slots computed from business hours
- Status badges: confirmed / pending / cancelled / completed

Minimum 12+ files. The full booking flow must work end-to-end with mock data.`,

  marketplace: (niche) => `## Autonomous Marketplace Blueprint
Build a multi-vendor marketplace${niche ? ` for **${titleCase(niche)}**` : ""}.

Required:
1. **Home** — featured listings, category grid, search bar with suggestions
2. **Browse/Search** — filter sidebar (category, price range, rating, location), sort, listing cards
3. **Listing detail** — gallery placeholder, price, seller card (rating, member-since), description, reviews
4. **Seller dashboard** — my listings table, create/edit listing form, orders received, earnings KPI
5. **Buyer flows** — cart or "contact seller" flow, favorites, order history
6. **Reviews** — star ratings + comments on listings and sellers

Architecture:
- \`src/data/listings.ts\` with 25+ realistic ${niche ?? "marketplace"} listings across 5+ categories
- \`src/data/sellers.ts\` — seller profiles with ratings
- \`src/hooks/useListings.ts\` with filter/sort logic; \`useFavorites\`, \`useCart\`
- Two distinct UX surfaces: polished consumer browsing + data-dense seller dashboard

Minimum 14+ files.`,

  education: (niche) => `## Autonomous Learning Platform Blueprint
Build an e-learning/LMS application${niche ? ` for **${titleCase(niche)}**` : ""}.

Required:
1. **Course catalog** — course cards (cover, instructor, duration, level, rating, price/free)
2. **Course detail** — syllabus accordion (modules → lessons), instructor bio, enroll CTA
3. **Lesson player** — lesson content area (video placeholder + text), sidebar lesson list with completion ticks, prev/next
4. **Progress dashboard** — enrolled courses with progress bars, streak, certificates earned
5. **Quiz** — multiple-choice quiz with instant feedback and score screen
6. **Instructor/admin view** — course management table, student progress overview

Architecture:
- \`src/data/courses.ts\` — 8+ realistic ${niche ?? "subject"} courses with full module/lesson trees
- \`src/hooks/useProgress.ts\` — completion tracking per lesson, course % computed
- Progress persisted in state; completion drives dashboard + certificates

Minimum 13+ files.`,

  social: (niche) => `## Autonomous Community Platform Blueprint
Build a social/community application${niche ? ` for **${titleCase(niche)}**` : ""}.

Required:
1. **Feed** — post cards (author, avatar initial, timestamp, content, like/comment counts), composer at top
2. **Post detail** — full post + threaded comments with reply UI
3. **Profiles** — user page with avatar, bio, stats (posts/followers/following), their posts, follow button
4. **Discover** — trending topics/tags, suggested users
5. **Notifications** — likes/comments/follows list with read state

Architecture:
- \`src/data/users.ts\` + \`src/data/posts.ts\` — 10+ users, 25+ realistic ${niche ?? "community"} posts with comments
- \`src/hooks/useFeed.ts\` — like/unlike, add comment, follow/unfollow all working against state
- Relative timestamps ("2h ago"), optimistic like animation, infinite-scroll-style "load more"

Minimum 12+ files. Interactions must actually update state — not dead buttons.`,

  healthcare: (niche) => `## Autonomous Clinic / Patient Management Blueprint
Build a medical practice management system${niche ? ` for **${titleCase(niche)}**` : ""}. Clinical operations software — NOT a clinic marketing site.

Required modules:
1. **Today's schedule** — day view of appointments (time, patient, provider, reason, status: booked/checked-in/in-room/complete), check-in action
2. **Patients** — searchable roster (MRN, name, age, phone, last visit, primary provider), patient detail with chart tabs
3. **Patient chart** — vitals history, problem list, medications, allergies (prominent warning banner), visit notes timeline
4. **Appointments** — calendar + booking dialog with provider/room conflict checks, cancel/reschedule
5. **Prescriptions** — medication list per patient, dosage/frequency/refills, print-style prescription view
6. **Billing / Claims** — visit charges, insurance status badges, outstanding balance summary
7. **Providers** — clinician directory with specialty and working hours
8. **Reports** — visits per week, no-show rate, top diagnoses

Domain rules:
- \`src/data/patients.ts\` — 25+ patients with realistic names, DOB-derived ages, MRNs, conditions
- \`src/data/appointments.ts\` — 30+ appointments spread across recent and upcoming days
- Allergy and drug-interaction warnings render as high-contrast alert banners, never plain text
- All demo data clearly fictional; add a visible "Demo data — not for clinical use" badge in the topbar

Minimum 16+ files.`,

  hr: (niche) => `## Autonomous HR / Recruitment System Blueprint
Build an HR management system${niche ? ` for **${titleCase(niche)}**` : ""}. Internal people-operations software.

Required modules:
1. **People directory** — employee table (name, role, department, manager, start date, status), profile detail
2. **Recruitment / ATS** — job openings list + candidate kanban (Applied → Screening → Interview → Offer → Hired/Rejected) with draggable-style cards
3. **Leave management** — request form, balance per employee, approval queue with approve/reject actions, team calendar
4. **Attendance / Timesheets** — weekly grid with hours per day, submit/approve flow
5. **Payroll** — payslip table (gross, deductions, net), period selector, payslip detail view
6. **Performance** — review cycles, goal list with progress, rating summary
7. **Onboarding** — checklist per new hire with completion state
8. **Reports** — headcount by department, attrition, open roles, time-to-hire

Domain rules:
- \`src/data/employees.ts\` — 30+ employees across 5+ departments with managers wired into a real hierarchy
- \`src/data/candidates.ts\` — 20+ candidates spread across pipeline stages
- Approvals actually mutate state: approving leave updates the balance AND the team calendar

Minimum 16+ files.`,

  accounting: (niche) => `## Autonomous Accounting / Invoicing Blueprint
Build a bookkeeping and invoicing system${niche ? ` for **${titleCase(niche)}**` : ""}.

Required modules:
1. **Dashboard** — cash position, income vs expenses chart, overdue receivables, upcoming bills
2. **Invoices** — invoice table (number, client, issue/due date, amount, status: draft/sent/paid/overdue), create-invoice form with line items that compute subtotal/tax/total live, printable invoice view
3. **Expenses** — expense entry with category, vendor, receipt placeholder, monthly totals by category
4. **Clients / Vendors** — contact records with balance owed and transaction history
5. **Chart of accounts** — account tree (assets, liabilities, equity, income, expenses) with balances
6. **Transactions / Ledger** — journal entries, debit/credit columns that must balance
7. **Reports** — profit & loss, balance sheet, aged receivables (30/60/90 buckets)
8. **Settings** — company details, tax rates, invoice numbering, currency

Domain rules:
- Every number is COMPUTED from \`src/data/transactions.ts\` (60+ entries over recent months) — no hardcoded totals that contradict the ledger
- Money stored in integer cents, formatted through one \`formatCurrency\` helper
- Debits must equal credits; show the imbalance as an error state if they don't

Minimum 16+ files.`,

  logistics: (niche) => `## Autonomous Logistics / Fleet Blueprint
Build a delivery and fleet operations system${niche ? ` for **${titleCase(niche)}**` : ""}.

Required modules:
1. **Dispatch board** — unassigned vs assigned shipments, assign-to-driver action, today's route summary
2. **Shipments** — table (tracking #, origin, destination, status: pending/picked-up/in-transit/out-for-delivery/delivered/failed, ETA), shipment detail with a status TIMELINE
3. **Tracking view** — public-style lookup by tracking number showing the same timeline
4. **Fleet** — vehicle list (plate, type, capacity, odometer, service due), maintenance log
5. **Drivers** — roster with availability, assigned vehicle, deliveries completed today
6. **Routes** — ordered stop list per route with sequence, distance and time estimates
7. **Reports** — on-time rate, deliveries per day, failed-delivery reasons, cost per km

Domain rules:
- \`src/data/shipments.ts\` — 40+ shipments spread across every status with realistic city pairs
- Status changes are recorded as timeline EVENTS with timestamps, not a single overwritten field
- No mapping library: show routes as an ordered stop list with distances, plus a simple CSS lane/progress visual

Minimum 16+ files.`,

  helpdesk: (niche) => `## Autonomous Helpdesk / Support Blueprint
Build a customer support ticketing system${niche ? ` for **${titleCase(niche)}**` : ""}.

Required modules:
1. **Ticket queue** — filterable table (id, subject, requester, priority, status: new/open/pending/resolved/closed, assignee, age), bulk-select actions
2. **Ticket detail** — threaded conversation (customer + agent replies), reply composer, internal note toggle, status/priority/assignee controls in a sidebar
3. **SLA view** — first-response and resolution timers with breach warnings in red
4. **Knowledge base** — article list by category, article detail, "suggest article" panel on the ticket screen
5. **Agents** — roster with open ticket counts and workload balance
6. **Customers** — requester list with ticket history
7. **Reports** — volume by day, average first-response time, resolution rate, CSAT summary

Domain rules:
- \`src/data/tickets.ts\` — 30+ tickets with realistic ${niche ?? "support"} subjects and multi-message threads
- Replying appends to the thread and moves status to "pending" — real state changes, not decoration

Minimum 13+ files.`,

  school: (niche) => `## Autonomous School Management (SIS) Blueprint
Build a school administration system${niche ? ` for **${titleCase(niche)}**` : ""}. Student information system — NOT a course-selling LMS and NOT a school marketing site.

Required modules:
1. **Dashboard** — enrolment count, attendance today, fees outstanding, upcoming exams
2. **Students** — roster (admission no, name, class/section, guardian, contact), student profile with academic history
3. **Attendance** — daily register per class with present/absent/late toggles, monthly percentage per student
4. **Gradebook** — subject-wise marks entry grid per class, computed averages and grade letters
5. **Report cards** — printable per-student term report with subject rows, grades, remarks and attendance summary
6. **Classes & timetable** — weekly timetable grid per class, teacher assignment per period
7. **Teachers** — staff directory with subjects and assigned classes
8. **Fees** — fee structure per class, payment status per student, receipts, outstanding list
9. **Exams** — exam schedule and results publication

Domain rules:
- \`src/data/students.ts\` — 40+ students across 4+ classes with guardians
- Grades and attendance percentages are COMPUTED from records, never hardcoded
- Report card and receipt views use print-friendly layouts (white background, clear borders)

Minimum 16+ files.`,

  hotel: (niche) => `## Autonomous Hotel / Property Management Blueprint
Build a hospitality property management system${niche ? ` for **${titleCase(niche)}**` : ""}.

Required modules:
1. **Front desk** — today's arrivals, departures and in-house guests with check-in / check-out actions
2. **Reservations** — booking list + new-booking dialog (dates, room type, guests, rate) with availability conflict checks
3. **Room rack** — grid of rooms × dates showing occupied/vacant/blocked, colour-coded
4. **Rooms** — inventory by type (single/double/suite) with rate, capacity, amenities, status
5. **Housekeeping** — room status board (clean/dirty/inspected/out-of-order) with assignment to staff
6. **Guests** — profiles with stay history and preferences
7. **Folio / Billing** — per-stay charges (room, food, extras), taxes, invoice and checkout settlement
8. **Reports** — occupancy %, ADR, RevPAR, arrivals forecast

Domain rules:
- \`src/data/rooms.ts\` + \`src/data/reservations.ts\` — 30+ rooms, 40+ reservations spanning past, present and future dates
- Availability logic must actually prevent double-booking the same room for overlapping dates
- Occupancy/ADR/RevPAR are computed from the reservation data

Minimum 15+ files.`,

  "project-management": (niche) => `## Autonomous Project / Task Management Blueprint
Build a project and task tracking application${niche ? ` for **${titleCase(niche)}**` : ""}.

Required modules:
1. **Board** — kanban columns (Backlog, To Do, In Progress, Review, Done) with task cards showing assignee avatar, priority, due date, tags; moving a card updates state
2. **Task detail** — description, checklist of subtasks, comments thread, activity log, attachments placeholder
3. **List view** — sortable/filterable table of every task (project, assignee, status, priority, due date)
4. **Projects** — project list with progress bar, member avatars, deadline, health badge
5. **Timeline / Gantt** — CSS-grid bar chart of tasks across weeks with dependencies as simple connectors
6. **Team** — members with workload (open tasks) and capacity
7. **Dashboard** — burndown-style chart, overdue tasks, completed this week
8. **Settings** — workflow columns, labels, notification preferences

Domain rules:
- \`src/data/tasks.ts\` — 40+ tasks across 4+ projects, spread over all statuses and realistic ${niche ?? "product"} work
- Drag-style reordering may be button-driven (move left/right), but MUST persist to the shared store and be reflected in list, dashboard and timeline

Minimum 14+ files.`,

  "real-estate": (niche) => `## Autonomous Real Estate Platform Blueprint
Build a property listing platform${niche ? ` for **${titleCase(niche)}**` : ""} — a public-facing property search with an agent back office.

Required pages:
1. **Home** — hero with a search bar (location, type, price range, beds), featured listings grid (8+), popular areas, why-choose-us, agent CTA, footer
2. **Search / Listings** — filter sidebar (price, beds, baths, area, property type, status), sort, result cards with photo placeholder, price, address, bed/bath/sqft chips
3. **Property detail** — image gallery placeholder, price, full specs table, description, amenities checklist, map-style location card, mortgage calculator, agent contact form, similar properties
4. **Agents** — agent directory and agent profile with their active listings
5. **Saved / Favourites** — shortlist with compare view
6. **Agent dashboard** — my listings table, create/edit listing form, enquiry inbox, performance stats

Domain rules:
- \`src/data/properties.ts\` — 24+ properties across 4+ neighbourhoods with realistic prices, sizes and photo placeholders
- Filters must genuinely narrow the result set; the mortgage calculator must compute a real monthly payment
- Prices formatted per locale; area in both sqft and m²

Minimum 15+ files.`,

  restaurant: (niche) => `## Autonomous Restaurant Ordering Blueprint
Build a restaurant ordering system${niche ? ` for **${titleCase(niche)}**` : ""} — a customer-facing menu and ordering flow plus a kitchen/admin side.

Required pages:
1. **Menu / Home** — hero, category tabs (Starters, Mains, Sides, Desserts, Drinks), dish cards with photo placeholder, description, price, dietary badges (veg/vegan/gluten-free/spicy)
2. **Dish detail / options** — size and add-on selection that changes the price live, quantity, special-instructions field
3. **Cart & checkout** — line items with modifiers, order type toggle (dine-in / takeaway / delivery), address or table number, time slot, payment mock, order confirmation with an order number and ETA
4. **Order tracking** — status timeline (received → preparing → ready → out for delivery → delivered)
5. **Kitchen display** — incoming orders as cards with items and elapsed timer, "start" and "ready" actions
6. **Admin: menu management** — CRUD for dishes and categories, availability toggle (sold-out)
7. **Admin: orders & reports** — order history table, revenue by day, top dishes

Domain rules:
- \`src/data/menu.ts\` — 30+ dishes across 5+ categories with real ${niche ?? "restaurant"} dish names, never "Item 1"
- Marking a dish sold-out in admin immediately disables it on the customer menu — one shared store
- Modifiers must affect the computed line total

Minimum 15+ files.`,

  events: (niche) => `## Autonomous Event & Ticketing Blueprint
Build an event management and ticketing platform${niche ? ` for **${titleCase(niche)}**` : ""}.

Required pages:
1. **Event listing** — upcoming events grid with date badge, venue, price-from, category filter and search
2. **Event detail** — hero image placeholder, date/time, venue with directions card, agenda/lineup, speakers or performers, ticket type selector (Early Bird / General / VIP) with quantity and live total, FAQ
3. **Checkout** — attendee details per ticket, promo code, payment mock, confirmation with a QR-style ticket code
4. **My tickets** — purchased tickets with the ticket code and add-to-calendar action
5. **Organiser dashboard** — create/edit event form, ticket types and inventory, sales chart, attendee list with check-in toggle
6. **Check-in** — search attendee by name or code, mark arrived, live checked-in counter

Domain rules:
- \`src/data/events.ts\` — 12+ events with realistic ${niche ?? "event"} titles, venues and dates spread across the next months
- Ticket inventory must decrement on purchase and sell-out must disable that tier
- Revenue and attendance figures computed from the orders data

Minimum 13+ files.`,

  fitness: (niche) => `## Autonomous Gym / Fitness Blueprint
Build a fitness studio management and member app${niche ? ` for **${titleCase(niche)}**` : ""}.

Required pages:
1. **Class schedule** — weekly grid of classes (name, trainer, time, duration, spots left), book/cancel actions with capacity enforcement
2. **Members** — roster with membership plan, status (active/expired/frozen), join date, visits this month
3. **Member profile / portal** — plan details, upcoming bookings, attendance streak, progress chart (weight or workouts per week)
4. **Workouts** — workout plan builder (exercise, sets, reps, weight), logging screen with per-set completion
5. **Trainers** — staff with specialities, assigned classes, availability
6. **Check-in** — quick member search and check-in with today's attendance counter
7. **Plans & billing** — membership tiers, renewals due, payment status
8. **Reports** — attendance trends, popular classes, retention, revenue by plan

Domain rules:
- \`src/data/members.ts\` — 30+ members across plans and statuses; \`src/data/classes.ts\` — a full week of classes
- Booking a class decrements spots and appears in the member's upcoming list — one shared store
- Progress charts computed from logged sessions

Minimum 14+ files.`,

  blog: (niche) => `## Autonomous Blog / Publication Blueprint
Build a content publication${niche ? ` about **${titleCase(niche)}**` : ""} with a real editorial back office.

Required pages:
1. **Home / Feed** — featured hero post, latest posts grid with cover placeholder, category, author, read time and excerpt; sidebar with popular posts, categories and newsletter signup
2. **Post detail** — title, author card with avatar initial, published date, read time, formatted article body with headings/quotes/code, tags, share row, related posts, comments with reply form
3. **Category / Tag archive** — filtered listing with count and description
4. **Author page** — bio, avatar, their posts, follower count
5. **Search** — query across titles, excerpts and tags with highlighted matches
6. **Admin: posts** — post table with status (draft/scheduled/published), create/edit form with title, slug, excerpt, cover, category, tags and a markdown-ish body editor, publish action
7. **Admin: comments** — moderation queue with approve/spam/delete

Domain rules:
- \`src/data/posts.ts\` — 12+ full-length posts (real multi-paragraph ${niche ?? "editorial"} prose, never lorem ipsum) across 4+ categories
- Publishing a draft in admin makes it appear on the public feed immediately — one shared store
- Reading time computed from word count

Minimum 12+ files.`,

  portfolio: (niche) => `## Autonomous Portfolio Blueprint
Build a personal portfolio site${niche ? ` for a **${titleCase(niche)}**` : ""} — focused and elegant, not a corporate multi-page site.

Required sections/pages:
1. **Hero** — name, role, one-line positioning, primary CTA (hire me / view work), subtle background treatment
2. **Selected work** — 6+ project cards with cover placeholder, title, role, year and stack tags
3. **Project detail** — problem, approach, outcome with metrics, image placeholders, next-project link
4. **About** — story, skills grouped by area with proficiency indicators, tools, timeline of experience
5. **Testimonials** — 3+ quotes with name, role and company
6. **Contact** — validated form plus direct email and social links
7. Optional: **Resume/CV** — print-friendly experience and education timeline; **Blog** teaser

Design rules:
- Strong typographic hierarchy, generous whitespace, one restrained accent colour, tasteful entrance animations
- Dark/light toggle wired to a theme class
- Fully responsive; work grid collapses to a single column on mobile

Minimum 10+ files. This must look like a designed personal site, not a template dump.`,

  "general-app": (niche) => `## Autonomous Application Blueprint
Build a complete application${niche ? ` for **${titleCase(niche)}**` : ""} based on the user's request.

Infer the domain, pages, data models, and UI yourself — do NOT ask clarifying questions.
Include: main layout, 3+ functional pages, realistic mock data, loading/empty/error states.
Minimum 10+ files.`,
};

/**
 * Status label without word stutter.
 *
 * The naive template produced "Building Dental Clinic clinic system…" and
 * "Building School school system…" — the niche already carried the noun the
 * suffix was about to repeat. Dropping suffix words the niche already contains
 * keeps every label readable whatever the user typed.
 */
function nicheLabel(niche: string | null, suffix: string, fallback: string): string {
  if (!niche) return fallback;
  const owned = new Set(niche.toLowerCase().split(/\s+/).filter(Boolean));
  const tail = suffix
    .split(" ")
    .filter((w) => !owned.has(w.toLowerCase()))
    .join(" ")
    .trim();
  return `Building ${titleCase(niche)}${tail ? ` ${tail}` : ""}…`;
}

const STATUS_LABELS: Record<BuildAppType, (niche: string | null, prompt: string) => string> = {
  "marketing-website": (niche) => nicheLabel(niche, "website", "Building your website…"),
  ecommerce: (niche) => nicheLabel(niche, "online store", "Building your online store…"),
  erp: (niche) => nicheLabel(niche, "ERP system", "Building ERP management system…"),
  pos: (niche) => nicheLabel(niche, "POS system", "Building point-of-sale system…"),
  crm: (niche) => nicheLabel(niche, "CRM", "Building CRM application…"),
  "admin-dashboard": (niche) => nicheLabel(niche, "admin dashboard", "Building management dashboard…"),
  saas: (niche) => nicheLabel(niche, "SaaS app", "Building SaaS application…"),
  booking: (niche) => nicheLabel(niche, "booking system", "Building booking system…"),
  marketplace: (niche) => nicheLabel(niche, "marketplace", "Building marketplace…"),
  education: (niche) => nicheLabel(niche, "learning platform", "Building learning platform…"),
  social: (niche) => nicheLabel(niche, "community", "Building community platform…"),
  healthcare: (niche) => nicheLabel(niche, "clinic system", "Building patient management system…"),
  hr: (niche) => nicheLabel(niche, "HR system", "Building HR management system…"),
  accounting: (niche) => nicheLabel(niche, "accounting system", "Building accounting & invoicing…"),
  logistics: (niche) => nicheLabel(niche, "logistics system", "Building fleet & delivery system…"),
  helpdesk: (niche) => nicheLabel(niche, "support desk", "Building support ticketing system…"),
  school: (niche) => nicheLabel(niche, "school system", "Building school management system…"),
  hotel: (niche) => nicheLabel(niche, "property system", "Building hotel management system…"),
  "project-management": (niche) => nicheLabel(niche, "project tracker", "Building project management app…"),
  "real-estate": (niche) => nicheLabel(niche, "property platform", "Building real estate platform…"),
  restaurant: (niche) => nicheLabel(niche, "ordering system", "Building restaurant ordering system…"),
  events: (niche) => nicheLabel(niche, "event platform", "Building event ticketing platform…"),
  fitness: (niche) => nicheLabel(niche, "fitness app", "Building gym management system…"),
  blog: (niche) => nicheLabel(niche, "publication", "Building blog & publishing platform…"),
  portfolio: (niche) => nicheLabel(niche, "portfolio", "Building your portfolio site…"),
  "general-app": (niche) => nicheLabel(niche, "application", "Building your application…"),
};

/** Classify a build prompt and return architecture guidance for the AI + UI status label. */
export function classifyBuildIntent(prompt: string): BuildIntent {
  const niche = extractNiche(prompt);
  let appType: BuildAppType = "general-app";

  const wantsBuild = /\b(create|build|make|design|develop|generate|rebrand|change)\b/i.test(prompt);

  if (BUILDER_KEYWORDS.test(prompt)) {
    return {
      appType: "general-app",
      niche: extractNiche(prompt),
      statusLabel: "Designing Lovable-inspired builder UI…",
      blueprint: BLUEPRINTS["general-app"](extractNiche(prompt)),
      minFiles: MIN_FILES_BY_TYPE["general-app"],
    };
  }

  // POS is checked BEFORE ecommerce, deliberately. A real POS prompt almost
  // always also contains storefront vocabulary — "product catalog", "shopping
  // cart", "checkout" — because a cashier terminal HAS a catalog, a cart and a
  // checkout. With ecommerce first, "a point of sale system for a retail store
  // with a product catalog grid and shopping cart" classified as ECOMMERCE and
  // the model built an online store with a marketing header (observed live).
  // The POS keywords are explicit terminal terms ("point of sale", "cash
  // register", "cashier station") that never describe an online shop, so when
  // both match, POS is what the user said. Plain e-commerce prompts contain no
  // POS terms and still land on ecommerce below.
  // Same logic for the explicit system names "ERP" and "CRM": a user who says
  // "an ERP for my store with a product catalog" said ERP; only the GENERIC
  // erp/crm vocabulary ("inventory management", "sales pipeline") stays below
  // ecommerce so "online store with inventory management" still builds a shop.
  const explicitErp = /\b(erp|enterprise resource planning)\b/i.test(prompt);
  const explicitCrm = /\b(crm|customer relationship management)\b/i.test(prompt);

  // ── Site-intent guard ───────────────────────────────────────────────────
  // Runs before every vertical. Naming the ARTIFACT ("landing page",
  // "website") is a stronger signal than naming the INDUSTRY, so "a landing
  // page for a dental clinic" is a website, not an EMR — unless the same
  // prompt also asks for transactional or back-office behaviour.
  const wantsPlainSite =
    SITE_INTENT_KEYWORDS.test(prompt) &&
    !SITE_FUNCTIONAL_OVERRIDE.test(prompt) &&
    !explicitErp &&
    !explicitCrm &&
    !POS_KEYWORDS.test(prompt);

  if (wantsPlainSite && PORTFOLIO_KEYWORDS.test(prompt)) appType = "portfolio";
  else if (wantsPlainSite) appType = "marketing-website";
  else if (POS_KEYWORDS.test(prompt)) appType = "pos";
  else if (explicitErp) appType = "erp";
  else if (explicitCrm) appType = "crm";
  // Verticals, most-specific vocabulary first. Each requires functional terms
  // (see the DESIGN RULE above the patterns), so an industry mention alone
  // never reaches here.
  else if (HEALTHCARE_KEYWORDS.test(prompt)) appType = "healthcare";
  else if (SCHOOL_KEYWORDS.test(prompt)) appType = "school";
  else if (HOTEL_KEYWORDS.test(prompt)) appType = "hotel";
  else if (HR_KEYWORDS.test(prompt)) appType = "hr";
  else if (ACCOUNTING_KEYWORDS.test(prompt)) appType = "accounting";
  else if (LOGISTICS_KEYWORDS.test(prompt)) appType = "logistics";
  else if (HELPDESK_KEYWORDS.test(prompt)) appType = "helpdesk";
  else if (PROJECT_KEYWORDS.test(prompt)) appType = "project-management";
  else if (REAL_ESTATE_KEYWORDS.test(prompt)) appType = "real-estate";
  else if (RESTAURANT_KEYWORDS.test(prompt)) appType = "restaurant";
  else if (EVENTS_KEYWORDS.test(prompt)) appType = "events";
  else if (FITNESS_KEYWORDS.test(prompt)) appType = "fitness";
  else if (PORTFOLIO_KEYWORDS.test(prompt)) appType = "portfolio";
  else if (ECOMMERCE_KEYWORDS.test(prompt)) appType = "ecommerce";
  else if (ERP_KEYWORDS.test(prompt)) appType = "erp";
  else if (CRM_KEYWORDS.test(prompt)) appType = "crm";
  else if (BOOKING_KEYWORDS.test(prompt)) appType = "booking";
  else if (MARKETPLACE_KEYWORDS.test(prompt)) appType = "marketplace";
  else if (EDUCATION_KEYWORDS.test(prompt)) appType = "education";
  // Blog before social: "a blog with posts and comments" names the ARTIFACT
  // (blog) and then describes it with social vocabulary. The noun wins, the
  // same way "landing page" wins over the industry it mentions.
  else if (BLOG_KEYWORDS.test(prompt)) appType = "blog";
  else if (SOCIAL_KEYWORDS.test(prompt)) appType = "social";
  else if (ADMIN_KEYWORDS.test(prompt)) appType = "admin-dashboard";
  else if (SAAS_KEYWORDS.test(prompt)) appType = "saas";
  else if (WEBSITE_KEYWORDS.test(prompt) || (niche && wantsBuild && !APP_KEYWORDS.test(prompt))) {
    appType = "marketing-website";
  } else if (wantsBuild && APP_KEYWORDS.test(prompt)) {
    // Weak default: "build an app for X" says nothing about WHAT the app is.
    // Let the vague-prompt scorer upgrade it when domain vocabulary points
    // somewhere specific; keep admin-dashboard when nothing scores.
    appType = rescueVagueIntent(prompt, niche) ?? "admin-dashboard";
  }

  // Nothing matched at all — casual phrasing with no system name or build
  // verb ("something for teachers to give quizzes and track grades"). Score
  // the domain vocabulary before settling for the generic blueprint.
  if (appType === "general-app") {
    appType = rescueVagueIntent(prompt, niche) ?? "general-app";
  }

  // "change services to cargo" / "rebrand the site" → marketing rebrand.
  // (Anchored: the old `/change|rebrand|…/` matched "change" ANYWHERE and
  // reclassified ERP/booking prompts as websites.)
  if (
    /\b(change|rebrand|update)\b[^.]*\b(website|site|services|branding?)\b/i.test(prompt) &&
    (appType === "general-app" || appType === "admin-dashboard")
  ) {
    appType = "marketing-website";
  }

  const blueprint = [
    BLUEPRINTS[appType](niche),
    industryProfileFor(prompt, niche),
    APP_SHELL_APP_TYPES.has(appType) ? APP_SHELL_CONTRACT : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    appType,
    niche,
    statusLabel: STATUS_LABELS[appType](niche, prompt),
    blueprint,
    minFiles: MIN_FILES_BY_TYPE[appType],
  };
}

/**
 * Industry profiles — what a build should be FULL OF, per domain.
 *
 * WHY. App type answers "what shape is this app"; it says nothing about what
 * belongs inside it. Without this, a bakery storefront and an auto-parts
 * storefront generate the same "Product One / Product Two / Premium Package"
 * filler, which is the single most obvious tell that a build is generated
 * rather than designed. Naming real catalogue items, real record types and an
 * industry-appropriate palette costs a few lines of prompt and changes the
 * entire perceived quality of the output.
 *
 * At most ONE profile is injected (first match wins, most specific first), so
 * this never balloons the prompt.
 */
const INDUSTRY_PROFILES: Array<{ match: RegExp; hint: string }> = [
  { match: /\b(bakery|baker|patisserie|cake shop|cupcake)\b/i, hint: "Bakery — sourdough loaves, croissants, cinnamon rolls, custom celebration cakes, seasonal tarts; allergen labels; warm cream/amber palette; early-morning opening hours." },
  { match: /\b(coffee|cafe|café|espresso|roaster)\b/i, hint: "Coffee — single-origin espresso, flat white, cold brew, pour-over, pastries; roast notes and origin tags; deep brown/cream palette." },
  { match: /\b(restaurant|bistro|diner|eatery|kitchen|pizzeria|sushi|steakhouse)\b/i, hint: "Restaurant — starters, mains, sides, desserts, drinks with real dish names and prices; dietary badges (veg/vegan/GF/spicy); dine-in, takeaway and delivery order types." },
  { match: /\b(gym|fitness|crossfit|yoga|pilates|martial arts)\b/i, hint: "Fitness — HIIT, strength, spin, yoga and mobility classes; trainer bios with certifications; membership tiers; class capacity and waitlists; bold dark/energetic accent palette." },
  { match: /\b(salon|spa|barber|beauty|nail|massage)\b/i, hint: "Salon & spa — cut, colour, blow-dry, facial, manicure, massage services with durations and prices; stylist profiles; slot-based booking; soft rose/sage palette." },
  { match: /\b(dental|dentist|orthodon)\b/i, hint: "Dental — check-ups, cleanings, fillings, whitening, orthodontics; treatment plans and tooth-chart notes; recall reminders; clean teal/white clinical palette." },
  { match: /\b(clinic|medical|hospital|doctor|physician|healthcare|health care)\b/i, hint: "Medical — consultations, follow-ups, lab orders, prescriptions; vitals (BP, pulse, temp, weight); allergy warnings; specialities and provider schedules; calm teal/navy clinical palette." },
  { match: /\b(pharmacy|chemist|drugstore)\b/i, hint: "Pharmacy — prescription and OTC lines, batch numbers, expiry dates, stock by shelf, refill reminders, controlled-substance flags; green/white palette." },
  { match: /\b(vet|veterinary|animal clinic|pet)\b/i, hint: "Veterinary — patients are ANIMALS (species, breed, weight, owner); vaccinations, deworming, surgeries, boarding; owner contact on every record; friendly warm palette." },
  { match: /\b(law|legal|attorney|lawyer|advocate|solicitor)\b/i, hint: "Legal — matters/cases with case numbers, practice areas, hearing dates, billable hours, retainers, document checklists; conservative navy/gold palette; formal copy." },
  { match: /\b(real ?estate|property|realtor|realty|housing)\b/i, hint: "Real estate — apartments, villas, plots and commercial units with beds/baths/sqft, neighbourhood, listing status, agent, price history; mortgage estimates." },
  { match: /\b(construction|contractor|builder|architect|interior design)\b/i, hint: "Construction — projects with phases, site visits, BOQ line items, subcontractors, material orders, safety checklists, progress photos; industrial amber/slate palette." },
  { match: /\b(automotive|garage|car (?:repair|service|dealer)|workshop|mechanic|auto ?parts)\b/i, hint: "Automotive — vehicles by make/model/year/VIN/plate, job cards, parts with part numbers, labour hours, service intervals, warranty status; red/graphite palette." },
  { match: /\b(logistics|shipping|courier|freight|trucking|delivery service|transport)\b/i, hint: "Logistics — consignments with tracking numbers, city pairs, weight/volume, vehicles and drivers, route stops, proof-of-delivery, delivery exceptions." },
  { match: /\b(agri|farm|agro|crop|dairy|poultry|livestock)\b/i, hint: "Agriculture — crops/livestock batches, seasons and yields, inputs (seed, feed, fertiliser), harvest and procurement records, warehouse lots, mandi/market rates; green/earth palette." },
  { match: /\b(school|college|university|academy|institute|tuition|coaching)\b/i, hint: "Education — classes/sections, subjects, terms, admission numbers, guardians, attendance registers, grades and report cards, fee structures and receipts." },
  { match: /\b(fashion|clothing|apparel|boutique|garment|shoe|footwear)\b/i, hint: "Fashion — products with size and colour variants, fabric and care details, lookbook collections, size guide, seasonal drops; editorial photography placeholders; refined monochrome palette." },
  { match: /\b(electronics|gadget|mobile|computer|laptop|hardware store)\b/i, hint: "Electronics — SKUs with specs tables, brand and model, warranty period, compatibility notes, comparison view, stock by variant; cool blue/graphite palette." },
  { match: /\b(grocery|supermarket|kirana|mart|fresh produce)\b/i, hint: "Grocery — categories (produce, dairy, bakery, pantry, frozen, household), unit pricing (per kg/litre), expiry and batch tracking, delivery slots, substitutions; fresh green palette." },
  { match: /\b(jewel|jewellery|jewelry|gold|diamond)\b/i, hint: "Jewellery — pieces by metal, purity/karat, gemstone, weight in grams, making charges, certification; luxury black/gold palette; large detail photography." },
  { match: /\b(furniture|home decor|interior|mattress)\b/i, hint: "Furniture — items with dimensions, materials, finishes, room categories, assembly info, delivery lead time, room-scene imagery; warm neutral palette." },
  { match: /\b(travel|tour|holiday|trip|tourism|safari)\b/i, hint: "Travel — packages with itinerary day-by-day, inclusions/exclusions, departure dates, group size, destinations, traveller details, seasonal pricing; vivid photographic palette." },
  { match: /\b(hotel|resort|hostel|guest ?house|homestay|hospitality)\b/i, hint: "Hospitality — room types with rates and occupancy, amenities, seasonal pricing, guest folios, housekeeping status, check-in/out times." },
  { match: /\b(photograph|videograph|studio|creative agency|design agency)\b/i, hint: "Creative — portfolio projects with client, year, deliverables and results; shoot/session bookings; package tiers; large-image layouts with generous whitespace." },
  { match: /\b(consult|advisory|accounting firm|audit|bookkeep)\b/i, hint: "Professional services — engagements/retainers by client, billable hours, deliverable milestones, invoices with payment terms, document requests; navy/slate corporate palette." },
  { match: /\b(bank|fintech|finance|lending|loan|insurance|wealth)\b/i, hint: "Finance — accounts, transactions with running balances, statements, KYC status, interest/EMI schedules, risk flags; strict money formatting and audit trails; navy/teal trust palette." },
  { match: /\b(nonprofit|non-profit|ngo|charity|donation|fundrais)\b/i, hint: "Nonprofit — campaigns with goals and progress bars, donors and recurring giving, volunteers and shifts, impact metrics and stories, receipts; warm optimistic palette." },
  { match: /\b(book ?store|library|publisher)\b/i, hint: "Books — titles with author, ISBN, genre, publisher, edition; lending or purchase flows, due dates and reservations, reading lists; literary serif-accented palette." },
  { match: /\b(florist|flower|nursery|plant shop)\b/i, hint: "Florist — bouquets and arrangements by occasion, stem types, same-day delivery windows, care instructions, seasonal availability; soft botanical palette." },
  { match: /\b(gaming|esports|game studio)\b/i, hint: "Gaming — titles, tournaments and brackets, teams and rosters, match schedules, leaderboards with points, streams; dark neon palette." },
  { match: /\b(music|band|record label|podcast)\b/i, hint: "Music — releases with track listings and durations, artists, tour dates with venues and ticket links, playlists, merch; bold expressive palette." },
  { match: /\b(laundry|dry clean)\b/i, hint: "Laundry — service types by garment (wash, iron, dry clean) with per-piece pricing, pickup and delivery slots, order stages, tagging/barcode per bag." },
  { match: /\b(cleaning|housekeeping service|maid|pest control|plumb|electrician|handyman|hvac)\b/i, hint: "Home services — service catalogue with duration and price, technician scheduling and territories, job status flow, before/after notes, recurring plans; trustworthy blue palette." },
  // Added after a live ERP build for a "wholesale distribution business"
  // matched no profile and fell back to generic filler — the B2B side of
  // commerce was missing entirely.
  { match: /\b(wholesale|distribution|distributor|trading|import|export|supply(?:ing)? company|b2b)\b/i, hint: "Wholesale/distribution — SKUs sold by case/carton with tiered price breaks by quantity, MOQ, dealer and retailer accounts with credit limits and payment terms (Net 30), purchase orders to suppliers, goods-received notes, warehouse bins and batch/lot numbers, dispatch and partial shipments." },
  { match: /\b(manufactur|factory|production line|assembly|fabricat|industrial plant)\b/i, hint: "Manufacturing — bill of materials per finished good, work orders with routing through stations, machine and shift schedules, raw-material consumption, scrap and yield rates, quality-check pass/fail, finished-goods stock; industrial slate/amber palette." },
  { match: /\b(staffing|recruit(?:ment|ing) agency|manpower|placement|headhunt)\b/i, hint: "Staffing — client companies with open mandates, candidate pool with skills and availability, submission and interview stages, placement fees and margins, contractor timesheets and invoicing." },
  { match: /\b(car rental|rent[- ]a[- ]car|vehicle rental|bike rental|equipment rental)\b/i, hint: "Rental — units with daily/weekly rates, availability calendar preventing overlap, pickup and return with condition checklist and fuel/odometer readings, security deposits, damage charges, late fees." },
  { match: /\b(solar|renewable|energy|electricity|utility|water board)\b/i, hint: "Energy/utility — connections or installations per site, capacity in kW, meter readings and consumption history, tariff slabs, billing cycles, outage or service tickets; green/blue palette." },
  { match: /\b(printing|print shop|signage|packaging)\b/i, hint: "Printing — jobs by product (business cards, banners, packaging) with size, material, finish and quantity-based pricing, artwork proof approval stages, press scheduling, delivery dates." },
  { match: /\b(telecom|isp|internet provider|broadband|mobile network)\b/i, hint: "Telecom/ISP — subscribers with plans (speed, data cap, price), connection status, installation appointments, usage history, invoices and dunning, support tickets with outage linkage." },
  { match: /\b(crypto|web3|blockchain|nft|defi|wallet app)\b/i, hint: "Crypto/web3 — assets with symbol, price, 24h change and sparkline, portfolio holdings with cost basis and P&L, transaction history with hashes and confirmations, watchlists; dark palette with precise numeric formatting. Clearly label all data as simulated." },
  { match: /\b(wedding|event planner|catering|banquet)\b/i, hint: "Weddings/events — packages by guest count, venue and date availability, vendor coordination (catering, décor, photography) with booking status, itinerary timeline, payment milestones; elegant serif-accented palette." },
];

function industryProfileFor(prompt: string, niche: string | null): string {
  const haystack = `${niche ?? ""} ${prompt}`;
  for (const { match, hint } of INDUSTRY_PROFILES) {
    if (match.test(haystack)) {
      return `\n## Domain Data Guidance — use REAL ${niche ? titleCase(niche) : "industry"} content\n${hint}\nEvery seeded record must read like it came from a real business in this domain. Generic filler ("Product One", "Service A", "Lorem ipsum", "John Doe" repeated) is a FAILED build.\n`;
    }
  }
  return "";
}

/**
 * App types that must render as an admin panel, not a website.
 *
 * The test is "would a member of the public ever land on this?" — a clinic's
 * patient-records screen, a dispatcher's board and a school's gradebook are
 * staff-only tools and get the sidebar shell. Real estate, restaurant, events,
 * fitness, blog and portfolio all have a public face, so they keep normal site
 * chrome and are deliberately NOT listed here.
 */
const APP_SHELL_APP_TYPES = new Set([
  "pos",
  "erp",
  "crm",
  "admin-dashboard",
  "healthcare",
  "hr",
  "accounting",
  "logistics",
  "helpdesk",
  "school",
  "hotel",
  "project-management",
]);

/**
 * Appended to every management-system blueprint (POS/ERP/CRM/admin).
 *
 * WHY THIS EXISTS — observed on a live POS build: the model produced working
 * Register/Inventory/Dashboard/Receipts pages but rendered them INSIDE the
 * scaffold's marketing chrome (phone/social contact strip on top, "Your
 * Brand" footer with About/Services/Careers links below), used placeholder
 * "Sample Product" rows on two pages while a third had its own rich seed
 * data, and left dead "Edit" buttons. The result read as a website wearing a
 * POS costume. These rules are the difference between that and an admin
 * panel.
 */
const APP_SHELL_CONTRACT = `
## Admin App Shell — MANDATORY (this is a management system, NOT a website)
- Layout: create \`src/layouts/AppLayout.tsx\` with a fixed LEFT SIDEBAR (product name at top, icon + label nav for every module, active-route highlight, collapsible on mobile) and a slim topbar (current page title, search, user avatar chip). EVERY route renders inside this shell.
- The scaffold's website chrome must NOT survive: rewrite \`src/App.tsx\` to render AppLayout and REMOVE the \`<Header />\` / \`<Footer />\` imports. No phone/email contact strip, no social icons, no marketing footer, no Home/About/Services/Contact links anywhere in the app.
- Route "/" REDIRECTS to the main working screen (e.g. /dashboard or /register). An internal tool has no landing page.
- ONE shared data layer read by EVERY page: seed \`src/data/*.ts\` with realistic domain data (30+ products with stock/category/price, 15+ sales/orders with dates spread over recent weeks, customers) and expose it through one store or context. NEVER render placeholder rows like "Sample Product" — every page shows the same seeded entities, and a record created in the UI (a sale at the register, a new product) must immediately appear on every other page that reads that entity (dashboard stats, reports, receipts), because they read the SAME store.
- Data SHAPES must match their consumers exactly: before writing any \`src/data/*.ts\` file, check every page that imports it and export precisely the structure those pages access (\`X.summary.map\` needs an OBJECT with a summary array — not a bare array). Every seeded date must be a valid ISO string (\`"2026-07-14T10:30:00Z"\`), and lists of objects are rendered field-by-field (\`item.name\`), never as \`{item}\`.
- NEVER use \`alert()\`, \`confirm()\`, or \`prompt()\` — they freeze the page. Confirmations and receipts use the ui Dialog/toast components.
- Quotes inside seeded text BREAK THE BUILD: a product named \`19" Server Rack\` written as \`name: "19" Server Rack"\` ends the string early and esbuild rejects the whole module. Write inch and foot marks as words (\`"19-inch Server Rack"\`), and put text containing an apostrophe in double quotes (\`"Chef's Special"\`).
- Real CRUD, not decoration: products (create/edit/delete via dialog forms that mutate the store), sales/orders (created by the register/order flow, viewable, voidable), customers. A visible "Edit" or "Delete" button that does nothing is a FAILED module.
- Reports/dashboard numbers are COMPUTED from the seeded sales data (sum revenue, count orders, rank top products) — never hardcoded figures that contradict the tables.
`;

/** Short directive appended to the user message so models always see the build goal. */
export function buildUserDirective(intent: BuildIntent): string {
  return [
    "---",
    `Autonomous build: ${intent.statusLabel}`,
    `App type: ${intent.appType}${intent.niche ? ` | Niche: ${intent.niche}` : ""}`,
    "Use LifemarkAI's internal editor intelligence lenses (product, architecture, UX, frontend, backend, database, QA, security, deployability) to improve the build, but do not expose them as a separate module or workflow.",
    "Infer brand, pages, modules, and realistic mock data yourself. Do not ask clarifying questions — ship a complete working app.",
  ].join("\n");
}

/**
 * Lovable-agent behavior: detect prompts that are QUESTIONS/investigations,
 * not change requests — in Build mode these should be ANSWERED (chat), never
 * trigger a regeneration. Conservative on purpose: any action verb wins.
 */
export function isInformationalQuery(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false;
  const ACTION =
    /\b(add|create|build|make|fix|change|update|implement|remove|delete|refactor|redesign|improve|convert|rename|install|integrate|deploy|publish|generate|write|set ?up|enable|disable|replace|move|adjust|increase|decrease|restyle|style|translate|optimi[sz]e|clean ?up|revert|undo|apply|swap|hide|show more|redo|rewrite|migrate|connect|configure)\b/i;
  if (ACTION.test(p)) return false;
  const INTERROGATIVE =
    /^(why|what|how|where|when|which|who|does|do|did|is|are|was|were|can|could|will|would|should|explain|describe|tell me|show me|walk me|summari[sz]e|list|compare|review|analy[sz]e|audit|investigate|check|inspect)\b/i;
  return INTERROGATIVE.test(p) || /\?\s*$/.test(p);
}

/**
 * Lovable-agent behavior: micro-edits get SURGICAL patches, not rebuilds.
 * Detects small text/copy/color tweaks that patch mode handles reliably —
 * a 5-minute full regeneration for "change the title to X" is the #1 speed
 * complaint. VERY narrow on purpose: anything structural stays in build.
 */
export function isSmallSurgicalEdit(prompt: string): boolean {
  const p = prompt.trim();
  if (!p || p.length > 220) return false;
  // Structural / additive work stays in build mode (incl. menu/nav edits,
  // which have their own dedicated machinery in the build path).
  if (
    /\b(page|section|layout|redesign|restyle|rebuild|component|feature|module|screen|route|database|table|api|integration|form|animation|responsive|dark mode|theme|navbar|nav ?bar|header|footer|menu|add|create|new|remove|delete|implement|refactor|build|redo|rewrite)\b/i.test(p)
  ) {
    return false;
  }
  const SMALL_VERB = /\b(change|rename|replace|update|edit|correct|set|make)\b/i;
  if (!SMALL_VERB.test(p)) return false;
  const TEXT_TARGET =
    /\b(text|title|heading|headline|label|copy|wording|word|typo|spelling|phone|email|address|price|number|name|tagline|slogan|caption|cta|button text|link text)\b/i;
  const hasQuoted = /["'“”‘’][^"'“”‘’]{2,60}["'“”‘’]/.test(p);
  const COLOR_TWEAK =
    /\bcolou?r\b|\bto\s+(red|blue|green|black|white|purple|violet|orange|pink|teal|gray|grey|gold|navy|#[0-9a-fA-F]{3,8})\b/i;
  return (TEXT_TARGET.test(p) && (hasQuoted || p.length < 120)) || (hasQuoted && p.length < 160) || COLOR_TWEAK.test(p);
}

/** Detect prompts that should run in build mode even if chat is selected. */
export function shouldAutoBuildMode(prompt: string): boolean {
  return /\b(create|build|make|design|develop|rebrand|change)\b/i.test(prompt) &&
    /\b(website|site|app|erp|pos|crm|system|platform|dashboard|portal|landing|management|store|shop|business|marketplace|booking|course|community|forum)\b/i.test(prompt);
}
