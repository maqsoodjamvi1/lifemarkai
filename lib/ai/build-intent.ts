export type BuildAppType =
  | "marketing-website"
  | "erp"
  | "pos"
  | "crm"
  | "admin-dashboard"
  | "saas"
  | "general-app";

export interface BuildIntent {
  appType: BuildAppType;
  niche: string | null;
  statusLabel: string;
  blueprint: string;
}

const ERP_KEYWORDS = /\b(erp|enterprise resource|inventory management|supply chain|procurement|warehouse|purchase order|bill of materials|bom)\b/i;
const POS_KEYWORDS = /\b(pos|point of sale|cash register|checkout|retail terminal|receipt|barcode scanner|shift report)\b/i;
const CRM_KEYWORDS = /\b(crm|customer relationship|sales pipeline|lead management|deal stage|contact management)\b/i;
const ADMIN_KEYWORDS = /\b(admin panel|admin dashboard|back office|management system|management app|operations dashboard|internal tool|backoffice|business management)\b/i;
const APP_KEYWORDS = /\b(application|app|platform|portal|system|software)\b/i;
const SAAS_KEYWORDS = /\b(saas|subscription|billing portal|multi-tenant|pricing tier)\b/i;
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
  "marketing-website": (niche) => `## Autonomous Marketing Website Blueprint
You are building a complete niche website${niche ? ` for **${titleCase(niche)}**` : ""}. Act like Lovable — infer everything yourself. Do NOT ask questions.

Required pages & sections:
- Header: logo wordmark, nav (Services, About, Contact), CTA button
- Hero: headline + subhead tailored to the niche, primary + secondary CTA
- Services/Features: 3–6 cards with realistic niche-specific copy (not lorem ipsum)
- About: company story, trust signals, stats
- Testimonials or social proof
- Contact: form (name, email, message) + footer with links
- Responsive mobile layout, dark or light theme matching the niche

Brand & design (infer from niche):
- Pick a professional brand name if none given
- Choose accent colors that fit the industry (logistics=cargo red/navy, healthcare=teal, finance=navy/gold)
- Use realistic business copy — company names, service descriptions, phone placeholders

Minimum files: index.html, vite.config.ts, package.json, tailwind.config.js, postcss.config.js, src/main.tsx, src/index.css, src/App.tsx, src/pages/Home.tsx, src/components/Header.tsx, src/components/Hero.tsx, src/components/Footer.tsx, src/data/content.ts`,

  erp: (niche) => `## Autonomous ERP System Blueprint
Build a full ERP-style management application${niche ? ` for **${titleCase(niche)}**` : ""}. This is a business operations system, NOT a marketing site.

Required modules (each = page + components + mock data):
1. **Dashboard** — KPI cards (revenue, orders, inventory, employees), charts, recent activity feed
2. **Inventory** — product table (SKU, qty, warehouse, reorder level), add/edit modal, low-stock alerts
3. **Sales / Orders** — order list with status badges (pending, shipped, delivered), order detail drawer
4. **Purchasing** — purchase orders table, supplier list, approval workflow UI
5. **Customers** — CRM-style customer table with search, filters, detail view
6. **Employees / HR** — employee directory, departments, roles
7. **Reports** — export buttons, date range filter, summary tables
8. **Settings** — company profile, users & roles, preferences

Architecture:
- React Router with sidebar layout (collapsible on mobile)
- \`src/layouts/AppLayout.tsx\` with sidebar nav linking all modules
- \`src/data/mock.ts\` with 20+ realistic rows per entity
- \`src/hooks/use<Entity>.ts\` per domain (useInventory, useOrders, useCustomers…)
- Tables: sortable columns, search, pagination UI, empty/loading states
- Use shadcn-style UI: cards, tables, badges, dialogs, dropdowns via Tailwind

Minimum 15+ files. Every module must be navigable and populated with realistic ${niche ?? "industry"} data.`,

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

  "general-app": (niche) => `## Autonomous Application Blueprint
Build a complete application${niche ? ` for **${titleCase(niche)}**` : ""} based on the user's request.

Infer the domain, pages, data models, and UI yourself — do NOT ask clarifying questions.
Include: main layout, 3+ functional pages, realistic mock data, loading/empty/error states.
Minimum 10+ files.`,
};

const STATUS_LABELS: Record<BuildAppType, (niche: string | null, prompt: string) => string> = {
  "marketing-website": (niche) =>
    niche ? `Building ${titleCase(niche)} website…` : "Building your website…",
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
    };
  }

  if (ERP_KEYWORDS.test(prompt)) appType = "erp";
  else if (POS_KEYWORDS.test(prompt)) appType = "pos";
  else if (CRM_KEYWORDS.test(prompt)) appType = "crm";
  else if (ADMIN_KEYWORDS.test(prompt)) appType = "admin-dashboard";
  else if (SAAS_KEYWORDS.test(prompt)) appType = "saas";
  else if (WEBSITE_KEYWORDS.test(prompt) || (niche && wantsBuild && !APP_KEYWORDS.test(prompt))) {
    appType = "marketing-website";
  } else if (wantsBuild && APP_KEYWORDS.test(prompt)) {
    appType = "admin-dashboard";
  }

  // "change services to cargo" → marketing rebrand
  if (/change|rebrand|update.*(website|site|services|brand)/i.test(prompt)) {
    appType = "marketing-website";
  }

  return {
    appType,
    niche,
    statusLabel: STATUS_LABELS[appType](niche, prompt),
    blueprint: BLUEPRINTS[appType](niche),
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
    /\b(website|site|app|erp|pos|crm|system|platform|dashboard|portal|landing|management|store|shop|business)\b/i.test(prompt);
}
