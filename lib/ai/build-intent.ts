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

function extractNiche(prompt: string): string | null {
  const patterns = [
    /(?:for|about|called|named)\s+(?:a\s+)?([a-z][\w\s&-]{2,40}?)(?:\s+(?:website|app|system|platform|business)|[.,!?]|$)/i,
    /create\s+(?:a\s+)?([a-z][\w\s&-]{2,40}?)\s+(?:website|landing|app)/i,
    /(?:website|site|app)\s+for\s+([a-z][\w\s&-]{2,40})/i,
    /change\s+(?:this\s+)?(?:website\s+)?(?:services?\s+)?to\s+([a-z][\w\s&-]{2,40})/i,
  ];
  for (const re of patterns) {
    const m = prompt.match(re);
    if (m?.[1]) {
      const niche = m[1].trim().replace(/\s+/g, " ");
      if (niche.length >= 3 && !/^(the|a|an|my|our)$/i.test(niche)) return niche;
    }
  }
  return null;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
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

  "general-app": (niche) => `## Autonomous Application Blueprint
Build a complete application${niche ? ` for **${titleCase(niche)}**` : ""} based on the user's request.

Infer the domain, pages, data models, and UI yourself — do NOT ask clarifying questions.
Include: main layout, 3+ functional pages, realistic mock data, loading/empty/error states.
Minimum 10+ files.`,
};

const STATUS_LABELS: Record<BuildAppType, (niche: string | null, prompt: string) => string> = {
  "marketing-website": (niche) =>
    niche ? `Building ${titleCase(niche)} website…` : "Building your website…",
  ecommerce: (niche) =>
    niche ? `Building ${titleCase(niche)} online store…` : "Building your online store…",
  erp: (niche) =>
    niche ? `Building ${titleCase(niche)} ERP system…` : "Building ERP management system…",
  pos: (niche) =>
    niche ? `Building ${titleCase(niche)} POS system…` : "Building point-of-sale system…",
  crm: (niche) =>
    niche ? `Building ${titleCase(niche)} CRM…` : "Building CRM application…",
  "admin-dashboard": (niche) =>
    niche ? `Building ${titleCase(niche)} admin dashboard…` : "Building management dashboard…",
  saas: (niche) =>
    niche ? `Building ${titleCase(niche)} SaaS app…` : "Building SaaS application…",
  booking: (niche) =>
    niche ? `Building ${titleCase(niche)} booking system…` : "Building booking system…",
  marketplace: (niche) =>
    niche ? `Building ${titleCase(niche)} marketplace…` : "Building marketplace…",
  education: (niche) =>
    niche ? `Building ${titleCase(niche)} learning platform…` : "Building learning platform…",
  social: (niche) =>
    niche ? `Building ${titleCase(niche)} community…` : "Building community platform…",
  "general-app": (niche) =>
    niche ? `Building ${titleCase(niche)} application…` : "Building your application…",
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

  if (ECOMMERCE_KEYWORDS.test(prompt)) appType = "ecommerce";
  else if (ERP_KEYWORDS.test(prompt)) appType = "erp";
  else if (POS_KEYWORDS.test(prompt)) appType = "pos";
  else if (CRM_KEYWORDS.test(prompt)) appType = "crm";
  else if (BOOKING_KEYWORDS.test(prompt)) appType = "booking";
  else if (MARKETPLACE_KEYWORDS.test(prompt)) appType = "marketplace";
  else if (EDUCATION_KEYWORDS.test(prompt)) appType = "education";
  else if (SOCIAL_KEYWORDS.test(prompt)) appType = "social";
  else if (ADMIN_KEYWORDS.test(prompt)) appType = "admin-dashboard";
  else if (SAAS_KEYWORDS.test(prompt)) appType = "saas";
  else if (WEBSITE_KEYWORDS.test(prompt) || (niche && wantsBuild && !APP_KEYWORDS.test(prompt))) {
    appType = "marketing-website";
  } else if (wantsBuild && APP_KEYWORDS.test(prompt)) {
    appType = "admin-dashboard";
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

  return {
    appType,
    niche,
    statusLabel: STATUS_LABELS[appType](niche, prompt),
    blueprint: BLUEPRINTS[appType](niche),
    minFiles: MIN_FILES_BY_TYPE[appType],
  };
}

/** Short directive appended to the user message so models always see the build goal. */
export function buildUserDirective(intent: BuildIntent): string {
  return [
    "---",
    `Autonomous build: ${intent.statusLabel}`,
    `App type: ${intent.appType}${intent.niche ? ` | Niche: ${intent.niche}` : ""}`,
    "Infer brand, pages, modules, and realistic mock data yourself. Do not ask clarifying questions — ship a complete working app.",
  ].join("\n");
}

/** Detect prompts that should run in build mode even if chat is selected. */
export function shouldAutoBuildMode(prompt: string): boolean {
  return /\b(create|build|make|design|develop|rebrand|change)\b/i.test(prompt) &&
    /\b(website|site|app|erp|pos|crm|system|platform|dashboard|portal|landing|management|store|shop|business|marketplace|booking|course|community|forum)\b/i.test(prompt);
}
