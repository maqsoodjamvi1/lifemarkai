/**
 * Curated designer starter templates — the "Horizons-style" design baseline.
 *
 * The biggest driver of polished AI output is NOT the model (we already route to
 * Claude Opus/Sonnet) — it's starting from a professionally-designed baseline and
 * having the model *refine* it, instead of generating layout from a blank prompt.
 * Each entry below is a high-quality design system + section blueprint the build
 * prompt anchors to (see lib/ai/template-refine.ts).
 *
 * These are intentionally design specs (tokens + structure + conventions), not
 * full code — they stay model-agnostic and lightweight while giving the model a
 * strong, opinionated frame to fill.
 */

export interface DesignTokens {
  /** Tailwind/CSS color values. */
  colors: {
    background: string;
    surface: string;
    primary: string;
    primaryFg: string;
    accent: string;
    muted: string;
    border: string;
    text: string;
    textMuted: string;
  };
  fonts: { heading: string; body: string };
  radius: string;
  shadow: string;
  /** Visual style adjectives that steer the model. */
  vibe: string[];
}

export interface StarterTemplate {
  id: string;
  name: string;
  category:
    | "saas" | "portfolio" | "ecommerce" | "blog" | "dashboard" | "agency" | "event" | "restaurant"
    | "realestate" | "fitness" | "medical" | "education" | "travel" | "nonprofit" | "services" | "photography"
    | "ai" | "fintech" | "crypto" | "mobileapp" | "devtool" | "waitlist" | "podcast" | "beauty" | "newsletter" | "jobboard"
    | "admin";
  description: string;
  /** Ordered page sections the generated site should include. */
  sections: string[];
  tokens: DesignTokens;
  /** Concrete design directions that make the output feel designed, not generated. */
  designNotes: string[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "saas-aurora",
    name: "Aurora — Modern SaaS",
    category: "saas",
    description: "Gradient-accented SaaS landing for a product launch — hero, social proof, features, pricing, CTA.",
    sections: ["sticky navbar", "hero with gradient + product mockup", "logo cloud", "feature grid (3x)", "how-it-works steps", "testimonials", "pricing (3 tiers)", "FAQ accordion", "CTA band", "footer"],
    tokens: {
      colors: { background: "#0B0B12", surface: "#13131F", primary: "#6D5DFB", primaryFg: "#FFFFFF", accent: "#22D3EE", muted: "#1C1C2A", border: "#262638", text: "#F4F4FB", textMuted: "#A1A1B5" },
      fonts: { heading: "Inter / Geist (700-800, tight tracking)", body: "Inter (400-500)" },
      radius: "1rem (rounded-2xl on cards)",
      shadow: "soft, colored glow on primary CTAs (shadow-[0_0_40px_-10px_#6D5DFB])",
      vibe: ["dark", "premium", "gradient", "spacious", "high-contrast"],
    },
    designNotes: [
      "Hero headline 56-72px, gradient text on one keyword; subhead in textMuted.",
      "Generous vertical rhythm (py-24 sections), max-w-6xl container.",
      "Cards: surface bg, 1px border, subtle inner highlight; hover lifts with translate-y-[-2px].",
      "Use a faux product screenshot in the hero (rounded, bordered, glow).",
      "Primary buttons filled gradient; secondary ghost with border.",
    ],
  },
  {
    id: "portfolio-monogram",
    name: "Monogram — Minimal Portfolio",
    category: "portfolio",
    description: "Editorial, typography-led personal portfolio for a designer/developer.",
    sections: ["minimal nav", "large name + role hero", "selected work grid", "about with portrait", "experience timeline", "contact CTA", "footer"],
    tokens: {
      colors: { background: "#FAFAF7", surface: "#FFFFFF", primary: "#111111", primaryFg: "#FFFFFF", accent: "#E4572E", muted: "#F0EFEA", border: "#E6E4DD", text: "#141414", textMuted: "#6B6B66" },
      fonts: { heading: "Fraunces / Playfair (serif, 600)", body: "Inter (400)" },
      radius: "0.25rem (sharp, editorial)",
      shadow: "none — rely on borders + whitespace",
      vibe: ["light", "editorial", "minimal", "serif-display", "calm"],
    },
    designNotes: [
      "Oversized serif display headings; lots of negative space.",
      "Work grid: 2-col, large imagery, project title + year on hover underline.",
      "Accent color used sparingly (links, one CTA).",
      "Asymmetric layout; left-aligned content, wide margins.",
    ],
  },
  {
    id: "ecommerce-bazaar",
    name: "Bazaar — Storefront",
    category: "ecommerce",
    description: "Clean product-first storefront with category nav, product grid, and cart.",
    sections: ["announcement bar", "nav with search + cart", "hero banner", "category pills", "product grid (cards)", "featured collection", "reviews", "newsletter", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#FFFFFF", primary: "#16A34A", primaryFg: "#FFFFFF", accent: "#F59E0B", muted: "#F5F5F5", border: "#E5E7EB", text: "#111827", textMuted: "#6B7280" },
      fonts: { heading: "Inter (700)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "subtle card shadow on hover (shadow-md)",
      vibe: ["light", "clean", "trustworthy", "product-first"],
    },
    designNotes: [
      "Product cards: square image, title, price, quick-add button on hover.",
      "Sticky add-to-cart, clear price hierarchy.",
      "Trust signals: ratings stars, free-shipping badge.",
      "Grid: 4-col desktop, 2-col mobile.",
    ],
  },
  {
    id: "dashboard-pulse",
    name: "Pulse — Analytics Dashboard",
    category: "dashboard",
    description: "App shell with sidebar, KPI cards, charts, and a data table.",
    sections: ["collapsible sidebar nav", "topbar with search + avatar", "KPI stat cards (4)", "chart area (line + bar)", "recent activity table", "right rail widgets"],
    tokens: {
      colors: { background: "#0F1117", surface: "#171A21", primary: "#3B82F6", primaryFg: "#FFFFFF", accent: "#10B981", muted: "#1E2230", border: "#272B36", text: "#E6E8EE", textMuted: "#9AA0AD" },
      fonts: { heading: "Inter (600)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "flat; separate with borders + surface contrast",
      vibe: ["dark", "data-dense", "professional", "calm contrast"],
    },
    designNotes: [
      "Use recharts for charts; consistent axis/grid styling in muted tones.",
      "KPI cards: label, big number, delta chip (green up / red down).",
      "Table: zebra-free, row hover, sticky header, status badges.",
      "Sidebar: icon + label, active item with primary accent bar.",
    ],
  },
  {
    id: "agency-vertex",
    name: "Vertex — Creative Agency",
    category: "agency",
    description: "Bold, motion-friendly agency site with case studies and services.",
    sections: ["nav", "bold statement hero", "services grid", "case study showcase", "process", "team", "client logos", "contact", "footer"],
    tokens: {
      colors: { background: "#0A0A0A", surface: "#121212", primary: "#E2FB6C", primaryFg: "#0A0A0A", accent: "#FF5C00", muted: "#1A1A1A", border: "#262626", text: "#FAFAFA", textMuted: "#9C9C9C" },
      fonts: { heading: "Clash Display / Space Grotesk (700, huge)", body: "Inter (400)" },
      radius: "1.5rem",
      shadow: "none; use color blocks + scale",
      vibe: ["dark", "bold", "expressive", "oversized type", "lime accent"],
    },
    designNotes: [
      "Huge kinetic headlines (text-7xl+), tight leading.",
      "Marquee of client logos; hover-reveal case study thumbnails.",
      "High-contrast lime primary on near-black; use sparingly for punch.",
      "Rounded-3xl media blocks, generous gaps.",
    ],
  },
  {
    id: "blog-quill",
    name: "Quill — Editorial Blog",
    category: "blog",
    description: "Readable content-first blog with featured post and clean article cards.",
    sections: ["nav", "featured post hero", "category filter", "post grid", "newsletter", "footer"],
    tokens: {
      colors: { background: "#FFFDF9", surface: "#FFFFFF", primary: "#1D4ED8", primaryFg: "#FFFFFF", accent: "#DB2777", muted: "#F3F2EE", border: "#E7E5DF", text: "#1A1A1A", textMuted: "#6A6A66" },
      fonts: { heading: "Newsreader / Lora (serif, 600)", body: "Inter (400, 18px, relaxed leading)" },
      radius: "0.5rem",
      shadow: "subtle",
      vibe: ["light", "readable", "editorial", "warm paper"],
    },
    designNotes: [
      "Article body max-w-prose, 18px, line-height 1.75.",
      "Featured post: large image + serif title + excerpt.",
      "Cards: image, category chip, title, author + date row.",
    ],
  },
  {
    id: "restaurant-saffron",
    name: "Saffron — Restaurant",
    category: "restaurant",
    description: "Warm, appetite-driven restaurant site with signature dishes, menu, and online reservations.",
    sections: ["announcement bar (hours)", "nav with Reserve CTA", "hero with plated-dish photo + tagline", "signature dishes", "menu highlights by category", "chef / story", "photo gallery", "guest reviews", "reservation form", "location + hours + map", "footer"],
    tokens: {
      colors: { background: "#FBF7F0", surface: "#FFFFFF", primary: "#B45309", primaryFg: "#FFFFFF", accent: "#166534", muted: "#F3ECE1", border: "#E7DCC9", text: "#1C1917", textMuted: "#78716C" },
      fonts: { heading: "Fraunces / Playfair Display (serif, 600)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "warm, soft (shadow-lg shadow-amber-900/5)",
      vibe: ["light", "warm", "appetizing", "editorial", "inviting"],
    },
    designNotes: [
      "Large, mouth-watering food photography in hero and gallery.",
      "Serif display headings on warm cream; saffron-amber primary, basil-green accent.",
      "Menu as elegant typographic list with dotted leaders and aligned prices.",
      "Sticky 'Reserve a table' CTA; show opening hours prominently.",
    ],
  },
  {
    id: "realestate-estate",
    name: "Estate — Real Estate",
    category: "realestate",
    description: "Trustworthy property site with listing search, featured homes, and agent profiles.",
    sections: ["top bar (phone)", "nav with List Your Property", "hero with search (location / price / type)", "featured listings grid", "neighborhoods", "why-us stats (homes sold)", "agent profiles", "testimonials", "mortgage / CTA band", "contact form", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#F8FAFC", primary: "#0F2A4A", primaryFg: "#FFFFFF", accent: "#C8A45C", muted: "#F1F5F9", border: "#E2E8F0", text: "#0F172A", textMuted: "#64748B" },
      fonts: { heading: "Inter Display (700, tight)", body: "Inter (400)" },
      radius: "0.5rem",
      shadow: "subtle elevation on listing cards (shadow-md)",
      vibe: ["light", "trustworthy", "premium", "clean", "spacious"],
    },
    designNotes: [
      "Listing cards: photo, price, beds/baths/sqft chips, location, status badge.",
      "Hero search bar overlapping a wide property image; gold accent on price + CTA.",
      "Big trust stats (homes sold, avg days on market) and agent headshots.",
      "Deep navy + light surfaces; restrained muted-gold for premium feel.",
    ],
  },
  {
    id: "fitness-forge",
    name: "Forge — Fitness Studio",
    category: "fitness",
    description: "High-energy gym / studio site with class types, schedule, trainers, and memberships.",
    sections: ["nav with Join Now", "hero with action photo + huge headline + CTA", "class types grid", "weekly schedule / timetable", "trainers", "membership pricing", "transformation results", "community testimonials", "free-trial CTA", "footer"],
    tokens: {
      colors: { background: "#0A0A0A", surface: "#141414", primary: "#DFFF1E", primaryFg: "#0A0A0A", accent: "#FF4D00", muted: "#1C1C1C", border: "#2A2A2A", text: "#FAFAFA", textMuted: "#9CA3AF" },
      fonts: { heading: "Archivo / Anton (800, condensed, uppercase)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "none — use color blocks + bold imagery",
      vibe: ["dark", "bold", "energetic", "high-contrast", "kinetic"],
    },
    designNotes: [
      "Huge condensed uppercase headlines; electric lime on near-black, orange for punch.",
      "Class timetable as a clean weekly grid; pricing tiers with a highlighted 'popular'.",
      "Action/transformation photography; trainer cards with specialties + socials.",
      "Prominent 'Start free trial' / 'Join now' CTAs throughout.",
    ],
  },
  {
    id: "medical-vitalis",
    name: "Vitalis — Medical Clinic",
    category: "medical",
    description: "Calm, reassuring clinic site with services, doctors, and online appointment booking.",
    sections: ["top bar (emergency phone)", "nav with Book Appointment", "hero with reassuring image + book CTA", "services / specialties grid", "why choose us (credentials)", "doctors", "how it works (3 steps)", "patient testimonials", "insurance / partners", "appointment booking", "FAQ", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#F6FBFB", primary: "#0E7C86", primaryFg: "#FFFFFF", accent: "#14B8A6", muted: "#ECF6F6", border: "#DCEBEB", text: "#0F2E33", textMuted: "#5B7A7E" },
      fonts: { heading: "Inter (600)", body: "Inter (400)" },
      radius: "1rem (friendly, rounded)",
      shadow: "soft and airy (shadow-sm)",
      vibe: ["light", "calm", "clean", "trustworthy", "reassuring"],
    },
    designNotes: [
      "Lots of whitespace; calm teal accents on white; rounded, gentle UI.",
      "Doctor cards with photo, specialty, and credentials; trust badges (certifications).",
      "Prominent 'Book appointment' CTA; simple 3-step 'how it works'.",
      "Soft, human imagery; avoid clinical coldness — warm and reassuring tone.",
    ],
  },
  {
    id: "education-scholar",
    name: "Scholar — Online Course",
    category: "education",
    description: "Friendly course landing page with curriculum, instructor, outcomes, and enrollment.",
    sections: ["nav with Enroll", "hero with value prop + rating + CTA", "what you'll learn (checklist)", "curriculum modules (accordion)", "instructor", "student outcomes / stats", "testimonials", "pricing / enroll", "guarantee", "FAQ", "footer"],
    tokens: {
      colors: { background: "#FBFBFE", surface: "#FFFFFF", primary: "#4F46E5", primaryFg: "#FFFFFF", accent: "#F59E0B", muted: "#F1F0FB", border: "#E6E5F4", text: "#1E1B2E", textMuted: "#6B6880" },
      fonts: { heading: "Cal Sans / Inter (700)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "playful, soft (shadow-lg shadow-indigo-500/10)",
      vibe: ["light", "friendly", "approachable", "modern", "trustworthy"],
    },
    designNotes: [
      "Friendly indigo with amber accent; star rating + student count near the CTA.",
      "'What you'll learn' as a two-column check grid; curriculum as an accordion.",
      "Instructor bio with credentials; outcome stats (completion, hire rate).",
      "Money-back guarantee badge; clear 'Enroll now' pricing card.",
    ],
  },
  {
    id: "event-summit",
    name: "Summit — Conference",
    category: "event",
    description: "Bold conference / event site with speakers, agenda, tickets, and countdown.",
    sections: ["nav with date/location + Get Tickets", "hero with event name + date + countdown + register", "speakers grid", "agenda / schedule", "why attend", "sponsors", "venue", "ticket tiers (early bird)", "past highlights", "register CTA", "footer"],
    tokens: {
      colors: { background: "#0B0B16", surface: "#15152A", primary: "#7C3AED", primaryFg: "#FFFFFF", accent: "#22D3EE", muted: "#1B1B33", border: "#2A2A47", text: "#F5F5FF", textMuted: "#A5A5C0" },
      fonts: { heading: "Space Grotesk / Geist (700)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "colored glow on the primary CTA",
      vibe: ["dark", "bold", "gradient", "energetic", "modern"],
    },
    designNotes: [
      "Gradient hero with a live countdown to the event date.",
      "Speaker cards with photo, title, and socials; agenda as a timeline.",
      "Ticket tiers with an 'early bird' highlight; sponsor logo wall.",
      "Date + venue always visible; strong 'Register' CTA bands.",
    ],
  },
  {
    id: "travel-voyage",
    name: "Voyage — Travel",
    category: "travel",
    description: "Wanderlust travel site with destination search, tours/packages, and reviews.",
    sections: ["nav with Book Now", "hero with destination image + search (where / when / guests)", "popular destinations grid", "featured tours / packages", "why book with us", "traveler reviews", "photo gallery", "deals newsletter", "footer"],
    tokens: {
      colors: { background: "#FCFBF7", surface: "#FFFFFF", primary: "#0E7490", primaryFg: "#FFFFFF", accent: "#EA580C", muted: "#F1EFE6", border: "#E6E2D5", text: "#16302F", textMuted: "#5F6B6A" },
      fonts: { heading: "Fraunces / Clash Display (600)", body: "Inter (400)" },
      radius: "1.25rem (soft, rounded)",
      shadow: "soft on cards (shadow-md)",
      vibe: ["light", "wanderlust", "vibrant", "imagery-led", "airy"],
    },
    designNotes: [
      "Full-bleed destination photography; rounded cards over sand-white surfaces.",
      "Search widget in the hero (where / when / guests); destination cards show 'from $'.",
      "Tour packages with duration, rating, and a sunset-orange CTA.",
      "Ocean-teal primary; generous imagery and breathing room.",
    ],
  },
  {
    id: "nonprofit-cause",
    name: "Cause — Nonprofit",
    category: "nonprofit",
    description: "Human, hopeful nonprofit site with mission, impact stats, stories, and donations.",
    sections: ["top bar", "nav with Donate (accent)", "hero with mission + impact image + Donate CTA", "impact stats", "what we do (programs)", "impact stories", "ways to give (donate / volunteer / fundraise)", "partners", "donation CTA band", "newsletter", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#F7FAF6", primary: "#15803D", primaryFg: "#FFFFFF", accent: "#E11D48", muted: "#EEF4EC", border: "#DEEAD9", text: "#14241A", textMuted: "#5A6B5F" },
      fonts: { heading: "Inter (700)", body: "Inter (400, relaxed)" },
      radius: "0.875rem",
      shadow: "soft (shadow-sm)",
      vibe: ["light", "warm", "human", "hopeful", "trustworthy"],
    },
    designNotes: [
      "Human-centered photography; big impact numbers (people helped, funds raised).",
      "'Donate' button stands out in coral/rose against forest-green primary.",
      "Program cards + impact stories with real quotes; transparency on fund use.",
      "Clear secondary paths: volunteer and fundraise alongside donate.",
    ],
  },
  {
    id: "services-handy",
    name: "Handy — Local Services",
    category: "services",
    description: "Trustworthy local-services site (plumber/electrician/cleaner) with quote request.",
    sections: ["top bar (phone + hours)", "nav with Get a Quote", "hero with value prop + quote CTA + trust badges", "services grid", "why choose us (licensed/insured)", "service areas", "how it works (3 steps)", "reviews (Google-style)", "pricing / estimate", "FAQ", "contact / quote form", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#F8FAFC", primary: "#1D4ED8", primaryFg: "#FFFFFF", accent: "#F97316", muted: "#F1F5F9", border: "#E2E8F0", text: "#0F172A", textMuted: "#64748B" },
      fonts: { heading: "Inter (700)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "subtle card shadow (shadow-sm)",
      vibe: ["light", "trustworthy", "simple", "approachable", "local"],
    },
    designNotes: [
      "Prominent phone number + 'Get a quote'; trust signals (licensed, insured, years).",
      "Service cards with icons; star reviews and a clear service-area list.",
      "Simple 3-step 'how it works'; orange accent CTA on a calm blue base.",
      "Fast path to contact — quote form above the fold and repeated in footer.",
    ],
  },
  {
    id: "photography-aperture",
    name: "Aperture — Photography Portfolio",
    category: "photography",
    description: "Minimal, image-first photography portfolio with filterable gallery and booking.",
    sections: ["minimal nav (logo + menu)", "full-bleed hero image", "portfolio gallery (filter by category)", "about / photographer", "services (portrait / wedding / commercial)", "selected clients", "testimonials", "booking / contact", "footer"],
    tokens: {
      colors: { background: "#0C0C0C", surface: "#161616", primary: "#FFFFFF", primaryFg: "#0C0C0C", accent: "#E5C07B", muted: "#1A1A1A", border: "#262626", text: "#F5F5F5", textMuted: "#8A8A8A" },
      fonts: { heading: "Inter (300, wide tracking, uppercase)", body: "Inter (400)" },
      radius: "0 (sharp, gallery-style)",
      shadow: "none",
      vibe: ["dark", "minimal", "gallery", "elegant", "image-first"],
    },
    designNotes: [
      "Image-first with generous negative space; monochrome UI so photos pop.",
      "Masonry/grid gallery with subtle hover zoom and a category filter.",
      "Thin, wide-tracked uppercase type; minimal chrome, lightbox feel.",
      "Restrained warm-gold accent used only for links and the booking CTA.",
    ],
  },
  {
    id: "ai-nova",
    name: "Nova — AI Product",
    category: "ai",
    description: "Futuristic AI product landing with a prompt demo, feature grid, and pricing.",
    sections: ["nav with Get Started", "hero with AI value prop + prompt/chat demo + CTA", "logo cloud", "feature grid", "how it works (3 steps)", "use cases", "model / tech highlights", "pricing (3 tiers)", "FAQ", "CTA band", "footer"],
    tokens: {
      colors: { background: "#07070D", surface: "#0F0F1A", primary: "#8B5CF6", primaryFg: "#FFFFFF", accent: "#2DD4BF", muted: "#15151F", border: "#232333", text: "#F3F3FB", textMuted: "#9B9BB0" },
      fonts: { heading: "Geist / Inter (700, tight tracking)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "colored glow on CTAs (shadow-[0_0_50px_-12px_#8B5CF6])",
      vibe: ["dark", "futuristic", "gradient", "premium", "high-contrast"],
    },
    designNotes: [
      "Gradient-mesh hero with a faux chat/prompt UI demonstrating the product.",
      "Big bold headline with one gradient keyword; violet primary, teal accent.",
      "Feature cards on dark surfaces with subtle inner highlight + hover lift.",
      "Glow on primary CTAs; spacious py-24 sections, max-w-6xl container.",
    ],
  },
  {
    id: "fintech-ledger",
    name: "Ledger — Fintech",
    category: "fintech",
    description: "Trustworthy fintech landing with app mockups, security, and account signup.",
    sections: ["nav with Open Account", "hero with app mockup + value prop + trust badges", "key stats", "features (send / save / invest)", "security & compliance", "how it works", "testimonials", "plans / pricing", "regulatory + partners", "CTA band", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#F7F9FC", primary: "#064E3B", primaryFg: "#FFFFFF", accent: "#2563EB", muted: "#EEF2F7", border: "#E2E8F0", text: "#0B1B2B", textMuted: "#5B6B7B" },
      fonts: { heading: "Inter Display (700)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "subtle, crisp (shadow-sm)",
      vibe: ["light", "trustworthy", "premium", "clean", "data-driven"],
    },
    designNotes: [
      "Phone/app screenshot mockups in hero; emerald primary with blue accent.",
      "Security & compliance trust signals (encryption, regulation badges).",
      "Prominent numbers/stats; crisp cards with thin borders.",
      "Clear 'Open account' CTA repeated; calm, credible tone.",
    ],
  },
  {
    id: "crypto-chain",
    name: "Chain — Web3",
    category: "crypto",
    description: "Neon Web3 / protocol site with live stats, tokenomics, roadmap, and audits.",
    sections: ["nav with Connect Wallet", "hero with protocol value + CTA + live stats (TVL)", "supported chains / partners", "features", "tokenomics", "roadmap", "security & audits", "community", "CTA band", "footer"],
    tokens: {
      colors: { background: "#060A0F", surface: "#0D1520", primary: "#00E5A0", primaryFg: "#06120D", accent: "#6366F1", muted: "#111A26", border: "#1E2A38", text: "#EAF2F0", textMuted: "#8FA3B0" },
      fonts: { heading: "Space Grotesk (700)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "neon glow on primary",
      vibe: ["dark", "futuristic", "neon", "bold", "techy"],
    },
    designNotes: [
      "Neon-on-near-black with glassmorphism cards; monospace for addresses/numbers.",
      "Live stat counters (TVL, users, volume); chain logos in a row.",
      "Tokenomics chart + a clean horizontal roadmap; audit/security badges.",
      "Strong 'Connect wallet' CTA; indigo accent against neon-green primary.",
    ],
  },
  {
    id: "mobileapp-orbit",
    name: "Orbit — Mobile App",
    category: "mobileapp",
    description: "Playful mobile-app landing with phone mockups, store badges, and ratings.",
    sections: ["nav with Download", "hero with phone mockup + value prop + App Store / Play badges", "features (alternating screenshots)", "how it works", "ratings & testimonials", "pricing (free / pro)", "FAQ", "download CTA", "footer"],
    tokens: {
      colors: { background: "#FBFCFF", surface: "#FFFFFF", primary: "#4F46E5", primaryFg: "#FFFFFF", accent: "#FB7185", muted: "#F1F2FA", border: "#E7E8F4", text: "#16172B", textMuted: "#6A6C82" },
      fonts: { heading: "Cal Sans / Inter (700)", body: "Inter (400)" },
      radius: "1.5rem (rounded, app-like)",
      shadow: "soft floating (shadow-xl shadow-indigo-500/10)",
      vibe: ["light", "playful", "friendly", "modern", "rounded"],
    },
    designNotes: [
      "Floating phone mockups; alternating feature rows with app screenshots.",
      "App Store + Google Play badges; star ratings and review count.",
      "Rounded, playful UI; indigo primary with a rose accent.",
      "Repeated 'Download' CTA; light, energetic feel.",
    ],
  },
  {
    id: "devtool-stack",
    name: "Stack — Developer Tool",
    category: "devtool",
    description: "Code-first developer tool landing with terminal hero, code examples, and docs.",
    sections: ["nav with Docs + Get Started", "hero with headline + terminal / install command", "logo cloud", "feature grid", "code examples (tabbed)", "integrations", "performance stats", "pricing", "docs CTA", "footer"],
    tokens: {
      colors: { background: "#0B0E14", surface: "#11161F", primary: "#38BDF8", primaryFg: "#07121A", accent: "#A78BFA", muted: "#161C26", border: "#232A36", text: "#E6EDF3", textMuted: "#8B98A5" },
      fonts: { heading: "Inter (700)", body: "Inter (400); mono: JetBrains Mono for code" },
      radius: "0.75rem",
      shadow: "flat — separate with borders + surface contrast",
      vibe: ["dark", "technical", "precise", "developer", "code-first"],
    },
    designNotes: [
      "Terminal/code block in the hero with a copyable install command.",
      "Tabbed, syntax-highlighted code examples; monospace for commands.",
      "Integration logos; precise flat dark UI with sky + violet accents.",
      "Docs-forward: 'Read the docs' alongside 'Get started'.",
    ],
  },
  {
    id: "waitlist-launch",
    name: "Launch — Waitlist",
    category: "waitlist",
    description: "Focused single-screen coming-soon page with email capture and social proof.",
    sections: ["minimal logo", "centered hero with headline + subhead + email signup", "social proof (N joined)", "feature teasers (3)", "founder note", "socials", "footer"],
    tokens: {
      colors: { background: "#FAFAF8", surface: "#FFFFFF", primary: "#111111", primaryFg: "#FFFFFF", accent: "#F97316", muted: "#F0F0EC", border: "#E6E5DF", text: "#141414", textMuted: "#6B6B66" },
      fonts: { heading: "Fraunces / Inter (600)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "minimal — rely on whitespace",
      vibe: ["light", "minimal", "focused", "elegant", "calm"],
    },
    designNotes: [
      "Single-screen focus: large headline, one clear email-capture form.",
      "Inline success state after signup; a 'join N others' counter for proof.",
      "Three short feature teasers; one accent color (orange) only.",
      "Lots of whitespace, minimal chrome — fast and distraction-free.",
    ],
  },
  {
    id: "podcast-airwave",
    name: "Airwave — Podcast",
    category: "podcast",
    description: "Warm podcast site with cover art, episode list, hosts, and listen links.",
    sections: ["nav with Subscribe", "hero with show art + tagline + play latest + platform links", "about the show", "latest episodes (with play + duration)", "hosts", "guest highlights", "subscribe (Apple / Spotify)", "newsletter", "footer"],
    tokens: {
      colors: { background: "#FFF9F2", surface: "#FFFFFF", primary: "#BE3455", primaryFg: "#FFFFFF", accent: "#F59E0B", muted: "#F6ECE2", border: "#EBDDD0", text: "#2A1A20", textMuted: "#7A6A70" },
      fonts: { heading: "Fraunces (600)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "soft, warm",
      vibe: ["light", "warm", "friendly", "editorial", "audio"],
    },
    designNotes: [
      "Large show cover art in the hero; warm editorial serif headings.",
      "Episode list with play buttons, titles, and durations; subtle waveform motif.",
      "Listen-on platform badges (Apple, Spotify, YouTube); host photos + bios.",
      "Raspberry primary with amber accent on a warm cream base.",
    ],
  },
  {
    id: "beauty-lumi",
    name: "Lumi — Salon & Spa",
    category: "beauty",
    description: "Elegant salon / spa site with services, gallery, stylists, and booking.",
    sections: ["nav with Book Now", "hero with serene image + tagline + Book CTA", "services + pricing", "gallery", "the experience / why us", "stylists / team", "testimonials", "booking", "location + hours", "footer"],
    tokens: {
      colors: { background: "#FCF8F5", surface: "#FFFFFF", primary: "#A8557A", primaryFg: "#FFFFFF", accent: "#B8924A", muted: "#F4EBE6", border: "#ECDFD8", text: "#2B2024", textMuted: "#7C6E72" },
      fonts: { heading: "Cormorant Garamond / Fraunces (serif, 500)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "soft, refined",
      vibe: ["light", "elegant", "calm", "luxurious", "refined"],
    },
    designNotes: [
      "Serene spa imagery; elegant serif headers; blush-rose + gold palette.",
      "Services as a refined price list with durations; generous whitespace.",
      "Stylist cards with portraits; calming, premium tone throughout.",
      "Prominent, gentle 'Book now' CTA; gold accent used sparingly.",
    ],
  },
  {
    id: "newsletter-dispatch",
    name: "Dispatch — Newsletter",
    category: "newsletter",
    description: "Editorial newsletter / creator landing with subscribe form and recent issues.",
    sections: ["nav", "hero with newsletter value + subscribe form", "what you'll get", "recent issues (cards)", "about the author", "subscriber social proof", "featured in", "subscribe CTA", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#FAFAFA", primary: "#111827", primaryFg: "#FFFFFF", accent: "#DC2626", muted: "#F3F4F6", border: "#E5E7EB", text: "#111827", textMuted: "#6B7280" },
      fonts: { heading: "Newsreader / Lora (serif, 600)", body: "Inter (400, 18px relaxed)" },
      radius: "0.5rem",
      shadow: "subtle",
      vibe: ["light", "editorial", "readable", "clean", "credible"],
    },
    designNotes: [
      "Editorial serif headings; prominent subscribe form above the fold.",
      "Recent issues as cards with excerpts; subscriber count for social proof.",
      "'As featured in' logo row; readable max-w-prose body, 18px.",
      "Single red accent for links + CTA on an otherwise neutral palette.",
    ],
  },
  {
    id: "jobboard-roster",
    name: "Roster — Job Board",
    category: "jobboard",
    description: "Clean job board with search, featured roles, categories, and post-a-job CTA.",
    sections: ["nav with Post a Job", "hero with search (role / location) + popular categories", "featured jobs list", "browse by category", "top companies", "why use us", "post-a-job CTA", "job-alerts newsletter", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#F8FAFC", primary: "#0F766E", primaryFg: "#FFFFFF", accent: "#F59E0B", muted: "#F1F5F9", border: "#E2E8F0", text: "#0F172A", textMuted: "#64748B" },
      fonts: { heading: "Inter (700)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "subtle on job cards (shadow-sm)",
      vibe: ["light", "clean", "organized", "trustworthy", "efficient"],
    },
    designNotes: [
      "Search bar in the hero (role + location) with category chips below.",
      "Job cards: company logo, title, location, salary range, and tags.",
      "Company logo wall; clear 'Apply' and 'Post a job' CTAs.",
      "Teal primary with amber accent; organized, efficient layout.",
    ],
  },
  {
    id: "ecommerce-atelier",
    name: "Atelier — Fashion Store",
    category: "ecommerce",
    description: "Editorial fashion & apparel store with lookbook hero, collections, and cart.",
    sections: ["announcement bar (free shipping / returns)", "nav with search + wishlist + cart", "lookbook hero (full-bleed model + Shop CTA)", "new arrivals grid", "shop by category (women / men / accessories)", "featured collection / lookbook", "brand story", "reviews", "instagram / UGC gallery", "newsletter (10% off)", "footer"],
    tokens: {
      colors: { background: "#FAF8F5", surface: "#FFFFFF", primary: "#1A1A1A", primaryFg: "#FFFFFF", accent: "#8C6A4E", muted: "#F0ECE6", border: "#E7E1D8", text: "#161412", textMuted: "#7A726A" },
      fonts: { heading: "Cormorant / Fraunces (serif, 500)", body: "Inter (400)" },
      radius: "0.25rem (sharp, editorial)",
      shadow: "none — rely on borders + whitespace",
      vibe: ["light", "editorial", "minimal", "fashion", "elegant"],
    },
    designNotes: [
      "Large editorial fashion photography; sharp corners, serif display, lots of whitespace.",
      "Product cards: image with hover alt-shot, name, price; minimal chrome.",
      "Filter + sort; size selector and sticky add-to-cart on product pages.",
      "Taupe accent used sparingly; black-on-warm-white palette.",
    ],
  },
  {
    id: "ecommerce-circuit",
    name: "Circuit — Electronics Store",
    category: "ecommerce",
    description: "Sleek electronics & gadgets store with specs, comparisons, and deals.",
    sections: ["announcement bar (deals)", "nav with mega-menu categories + search + cart", "hero featured product (render + key specs + Buy)", "category grid", "best sellers", "spec / comparison highlights", "deals & bundles", "brand logos", "reviews + ratings", "warranty + shipping trust", "footer"],
    tokens: {
      colors: { background: "#0C0F16", surface: "#141926", primary: "#2563EB", primaryFg: "#FFFFFF", accent: "#22D3EE", muted: "#1A2030", border: "#28303F", text: "#EAEEF6", textMuted: "#93A0B4" },
      fonts: { heading: "Inter (700)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "subtle glow on featured product",
      vibe: ["dark", "techy", "spec-driven", "modern", "sleek"],
    },
    designNotes: [
      "High-res product renders; cards with spec chips (storage, RAM, etc.).",
      "Comparison tables and 'Add to cart' + 'Compare'; deal badges (% off).",
      "Rating stars and review counts; warranty/shipping trust signals.",
      "Sleek dark surfaces with blue primary and cyan accent.",
    ],
  },
  {
    id: "ecommerce-glow",
    name: "Glow — Beauty & Cosmetics",
    category: "ecommerce",
    description: "Soft cosmetics & skincare store with bestsellers, shop-by-concern, and reviews.",
    sections: ["announcement bar", "nav with search + cart", "hero (product + benefit + Shop CTA)", "bestsellers", "shop by concern / category (skincare / makeup / hair)", "clean-beauty & ingredient highlights", "routine / how-to", "reviews with photos", "UGC / instagram", "newsletter", "footer"],
    tokens: {
      colors: { background: "#FFF6F4", surface: "#FFFFFF", primary: "#C75B7A", primaryFg: "#FFFFFF", accent: "#C9A24B", muted: "#FBEDE9", border: "#F1DED8", text: "#2B2024", textMuted: "#7C6E72" },
      fonts: { heading: "Fraunces / Cormorant (serif, 500)", body: "Inter (400)" },
      radius: "1.25rem (soft, rounded)",
      shadow: "soft blush (shadow-lg shadow-rose-900/5)",
      vibe: ["light", "soft", "elegant", "clean", "glowy"],
    },
    designNotes: [
      "Soft pastel palette; rounded cards; products on clean backgrounds.",
      "Shade/variant selector; 'clean / cruelty-free' badges; ingredient highlights.",
      "Reviews with before/after photos; routine/how-to section.",
      "Rose primary with gold accent; gentle, glowy aesthetic.",
    ],
  },
  {
    id: "ecommerce-harvest",
    name: "Harvest — Grocery & Food",
    category: "ecommerce",
    description: "Fresh grocery / food-delivery store with categories, deals, and delivery.",
    sections: ["top bar (delivery info)", "nav with search + location + cart", "hero (fresh produce + delivery CTA + search)", "category pills (fruit / veg / dairy / bakery)", "weekly deals", "featured products grid", "why us (fresh / fast delivery / organic)", "how delivery works", "reviews", "newsletter", "footer"],
    tokens: {
      colors: { background: "#FBFCF7", surface: "#FFFFFF", primary: "#2F7D32", primaryFg: "#FFFFFF", accent: "#EA8C2B", muted: "#EFF4EA", border: "#E1EAD7", text: "#1A2417", textMuted: "#5F6B58" },
      fonts: { heading: "Inter (700)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "soft on cards (shadow-sm)",
      vibe: ["light", "fresh", "organic", "friendly", "clean"],
    },
    designNotes: [
      "Fresh food photography; green primary with warm orange accent.",
      "Category pills; product cards with weight/price + quick-add; cart drawer.",
      "Delivery-time badges; 'organic / local' tags; fast-delivery trust.",
      "Friendly, approachable layout optimized for quick browsing.",
    ],
  },
  {
    id: "ecommerce-loom",
    name: "Loom — Furniture & Home",
    category: "ecommerce",
    description: "Warm furniture & home-decor store with room shots and shop-the-look.",
    sections: ["announcement bar", "nav with search + cart", "hero (styled room + Shop the Look)", "shop by room (living / bed / dining)", "new arrivals", "featured collection", "materials / craft story", "customer photos (UGC)", "reviews", "design consultation", "newsletter", "footer"],
    tokens: {
      colors: { background: "#FAF7F2", surface: "#FFFFFF", primary: "#3F3A34", primaryFg: "#FFFFFF", accent: "#A8744F", muted: "#F0EAE1", border: "#E6DDD0", text: "#211E19", textMuted: "#756E64" },
      fonts: { heading: "Fraunces / Cormorant (serif, 500)", body: "Inter (400)" },
      radius: "0.5rem",
      shadow: "soft, natural",
      vibe: ["light", "warm", "minimal", "editorial", "natural"],
    },
    designNotes: [
      "Large lifestyle room photography with 'shop the look' hotspots.",
      "Product cards show material + dimensions; swatch selector.",
      "Warm, natural palette; serif headers; editorial feel.",
      "Free-delivery badge; optional design-consultation CTA.",
    ],
  },
  {
    id: "ecommerce-lumiere",
    name: "Lumière — Jewelry",
    category: "ecommerce",
    description: "Luxury jewelry store with macro shots, craftsmanship story, and gifting.",
    sections: ["announcement bar (free engraving / shipping)", "minimal nav + search + cart", "hero (macro jewelry on black + Shop)", "featured pieces", "shop by category (rings / necklaces / earrings)", "craftsmanship story", "materials & certification trust", "gifting guide", "reviews / press", "appointment / concierge", "newsletter", "footer"],
    tokens: {
      colors: { background: "#0E0C0A", surface: "#15110D", primary: "#C9A24B", primaryFg: "#15110D", accent: "#E8DCC0", muted: "#1B1611", border: "#2A2218", text: "#F3EEE4", textMuted: "#A99E8B" },
      fonts: { heading: "Cormorant Garamond (serif, 500, wide)", body: "Inter (300, tracking)" },
      radius: "0.25rem (sharp, refined)",
      shadow: "subtle gold glow",
      vibe: ["dark", "luxurious", "elegant", "premium", "refined"],
    },
    designNotes: [
      "Macro product photography on near-black; gold accents, sharp corners.",
      "Elegant wide serif; generous negative space; minimal chrome.",
      "'Ethically sourced / certified' trust; gift packaging + gifting guide.",
      "Champagne secondary accent; concierge / appointment option.",
    ],
  },
  {
    id: "ecommerce-solo",
    name: "Solo — Single-Product DTC",
    category: "ecommerce",
    description: "Conversion-focused single-product landing with benefits, proof, and sticky buy.",
    sections: ["announcement bar (limited offer)", "nav with Buy Now", "hero (product shot + headline + price + Buy + ratings)", "problem / solution", "key benefits (3-4)", "how it works", "features deep-dive (alternating)", "social proof / press", "comparison vs alternatives", "bundle / pricing", "guarantee", "FAQ", "sticky buy bar", "footer"],
    tokens: {
      colors: { background: "#FFFFFF", surface: "#F7F7F5", primary: "#111111", primaryFg: "#FFFFFF", accent: "#FF5A36", muted: "#F1F1EE", border: "#E6E6E1", text: "#121212", textMuted: "#6B6B66" },
      fonts: { heading: "Inter / Geist (800)", body: "Inter (400)" },
      radius: "0.875rem",
      shadow: "bold shadow on the buy CTA",
      vibe: ["light", "bold", "conversion-focused", "modern", "punchy"],
    },
    designNotes: [
      "One hero product; repeated Buy CTA plus a sticky buy bar on scroll.",
      "Star ratings + review count near the price; benefit-led copy.",
      "Before/after or demo; comparison vs alternatives; urgency badge.",
      "Money-back guarantee; bold punchy type with a single accent pop.",
    ],
  },
  {
    id: "ecommerce-pixel",
    name: "Pixel — Digital Products",
    category: "ecommerce",
    description: "Modern digital-downloads store (templates, ebooks, presets) with instant access.",
    sections: ["nav with cart", "hero (product preview/mockup + value + Get It + price)", "what's included", "product gallery / previews", "featured products grid", "creator / author bio", "testimonials", "license & usage", "instant-download trust", "bundle / pricing", "FAQ", "footer"],
    tokens: {
      colors: { background: "#0E0E16", surface: "#16161F", primary: "#6D5DFB", primaryFg: "#FFFFFF", accent: "#F472B6", muted: "#1A1A26", border: "#262633", text: "#F2F2F8", textMuted: "#9A9AAE" },
      fonts: { heading: "Geist / Inter (700)", body: "Inter (400)" },
      radius: "1rem",
      shadow: "soft glow on CTAs",
      vibe: ["dark", "modern", "creator", "vibrant", "clean"],
    },
    designNotes: [
      "Digital-product mockups (ebook/template/preset previews) in hero + gallery.",
      "'Instant download' + license badges; creator bio builds trust.",
      "No shipping — checkout grants instant access; vibrant violet/pink accents.",
      "Modern dark surfaces; preview-led product cards.",
    ],
  },
  {
    id: "admin-ledgerbooks",
    name: "Ledgerbooks — Accounting ERP",
    category: "admin",
    description: "Accounting / finance ERP admin — invoices, expenses, ledger, and reports.",
    sections: ["sidebar nav (dashboard / invoices / expenses / customers / reports)", "topbar with search + period filter + user menu", "KPI cards (revenue / outstanding / expenses / net profit)", "cash-flow + revenue-vs-expenses charts", "recent invoices table (status badges)", "create-invoice drawer/form", "aged receivables", "reports + export"],
    tokens: {
      colors: { background: "#F7F8FA", surface: "#FFFFFF", primary: "#0F766E", primaryFg: "#FFFFFF", accent: "#2563EB", muted: "#EEF1F4", border: "#E3E7EC", text: "#0F172A", textMuted: "#64748B" },
      fonts: { heading: "Inter (600)", body: "Inter (400); tabular-nums for figures" },
      radius: "0.625rem",
      shadow: "flat — separate with borders + surface contrast",
      vibe: ["light", "professional", "data-dense", "clean", "trustworthy"],
    },
    designNotes: [
      "App shell: left sidebar with active accent bar + topbar with search/period.",
      "KPI cards with delta chips; charts via recharts in muted tones.",
      "Invoice table with status badges (paid / overdue / draft); right-aligned, tabular-nums money.",
      "Create-invoice in a side drawer; export/report buttons.",
    ],
  },
  {
    id: "admin-stockroom",
    name: "Stockroom — Inventory ERP",
    category: "admin",
    description: "Inventory & warehouse ERP — stock levels, SKUs, suppliers, purchase orders.",
    sections: ["sidebar nav (overview / products / stock / suppliers / purchase orders)", "topbar search + warehouse selector", "KPI cards (total SKUs / low stock / inbound / stock value)", "stock-levels table (low-stock highlight)", "stock-movement chart", "product / SKU detail drawer", "purchase-order list", "supplier directory"],
    tokens: {
      colors: { background: "#F8FAFC", surface: "#FFFFFF", primary: "#4338CA", primaryFg: "#FFFFFF", accent: "#F59E0B", muted: "#F1F5F9", border: "#E2E8F0", text: "#0F172A", textMuted: "#64748B" },
      fonts: { heading: "Inter (600)", body: "Inter (400)" },
      radius: "0.625rem",
      shadow: "flat",
      vibe: ["light", "data-dense", "organized", "operational", "clean"],
    },
    designNotes: [
      "Stock table: quantity, reorder level, amber/red low-stock badges; mono SKUs.",
      "Warehouse filter; inbound/outbound movement chart.",
      "Quick stock-adjust action; supplier cards; PO list with status.",
      "Indigo primary with amber alerts; dense but scannable rows.",
    ],
  },
  {
    id: "admin-pipeline",
    name: "Pipeline — CRM Admin",
    category: "admin",
    description: "CRM admin — contacts, companies, and a drag-and-drop deal pipeline.",
    sections: ["sidebar nav (dashboard / contacts / companies / deals / activities)", "topbar search + Add Deal", "KPI cards (pipeline value / won this month / win rate / new leads)", "deal pipeline kanban (stages)", "contacts table", "contact / deal detail panel (timeline + notes)", "activity feed", "forecast chart"],
    tokens: {
      colors: { background: "#FBFBFD", surface: "#FFFFFF", primary: "#4F46E5", primaryFg: "#FFFFFF", accent: "#10B981", muted: "#F1F1FA", border: "#E7E7F2", text: "#16172B", textMuted: "#6A6C82" },
      fonts: { heading: "Cal Sans / Inter (600)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "soft (shadow-sm)",
      vibe: ["light", "modern", "organized", "crm", "friendly"],
    },
    designNotes: [
      "Kanban columns per stage with deal cards (value, company, owner avatar); drag-and-drop.",
      "Contacts table with owner + status; detail side panel with activity timeline + notes.",
      "Win/loss forecast chart; green accent for 'won', indigo primary.",
      "'Add deal' CTA; clean modern app shell.",
    ],
  },
  {
    id: "admin-peoplehr",
    name: "PeopleHR — HR ERP",
    category: "admin",
    description: "HR / HRMS admin — employee directory, attendance, leave, and payroll.",
    sections: ["sidebar nav (dashboard / employees / attendance / leave / payroll)", "topbar search + department filter", "KPI cards (headcount / present today / on leave / open roles)", "employee directory (cards + table)", "attendance overview chart", "leave requests table (approve / reject)", "employee profile drawer", "payroll summary"],
    tokens: {
      colors: { background: "#F7F9FB", surface: "#FFFFFF", primary: "#2563EB", primaryFg: "#FFFFFF", accent: "#16A34A", muted: "#F1F5F9", border: "#E2E8F0", text: "#0F172A", textMuted: "#64748B" },
      fonts: { heading: "Inter (600)", body: "Inter (400)" },
      radius: "0.875rem (friendly)",
      shadow: "soft (shadow-sm)",
      vibe: ["light", "friendly", "organized", "people-first", "clean"],
    },
    designNotes: [
      "Employee cards with avatar, role, department; department filter.",
      "Attendance chart; leave requests with approve/reject actions + status.",
      "Profile drawer with tabs (info / documents / leave); headcount KPIs.",
      "Blue primary, green 'present' accent; warm, approachable shell.",
    ],
  },
  {
    id: "admin-foundry",
    name: "Foundry — Manufacturing ERP",
    category: "admin",
    description: "Manufacturing ERP — work orders, production schedule, BOM, machine status.",
    sections: ["sidebar nav (overview / work orders / production / inventory / machines)", "topbar plant selector + shift", "KPI cards (output / OEE / scrap rate / on-time)", "production schedule (gantt-style)", "work orders table (priority + status)", "machine status grid (running / idle / down)", "BOM detail", "downtime chart"],
    tokens: {
      colors: { background: "#0C0F14", surface: "#131820", primary: "#38BDF8", primaryFg: "#07121A", accent: "#F59E0B", muted: "#161C26", border: "#232A36", text: "#E6EDF3", textMuted: "#8B98A5" },
      fonts: { heading: "Inter (700)", body: "Inter (400); mono for order IDs" },
      radius: "0.625rem",
      shadow: "flat, dark",
      vibe: ["dark", "industrial", "data-dense", "operational", "precise"],
    },
    designNotes: [
      "Machine-status grid with color states (green running / amber idle / red down).",
      "Gantt-style production schedule; work-order table with priority + status.",
      "OEE gauges and downtime chart; mono for work-order IDs.",
      "Dark control-room feel; sky primary with amber warnings.",
    ],
  },
  {
    id: "admin-cartcontrol",
    name: "CartControl — E-commerce Admin",
    category: "admin",
    description: "E-commerce / order-management admin — orders, products, customers, fulfillment.",
    sections: ["sidebar nav (dashboard / orders / products / customers / discounts)", "topbar search + store selector", "KPI cards (sales today / orders / AOV / conversion)", "sales chart + top products", "orders table (paid / fulfilled / refunded)", "order detail drawer (items + fulfillment)", "product list with inventory", "customer list"],
    tokens: {
      colors: { background: "#F8FAFC", surface: "#FFFFFF", primary: "#6D28D9", primaryFg: "#FFFFFF", accent: "#16A34A", muted: "#F1F5F9", border: "#E2E8F0", text: "#0F172A", textMuted: "#64748B" },
      fonts: { heading: "Inter (600)", body: "Inter (400)" },
      radius: "0.625rem",
      shadow: "flat",
      vibe: ["light", "clean", "commerce", "data-dense", "professional"],
    },
    designNotes: [
      "Orders table with payment + fulfillment status badges; refund/fulfill actions.",
      "Order detail drawer: line items, customer, shipping, timeline.",
      "Sales chart + top products; low-stock flags on product list.",
      "Violet primary, green success accent; clean operational shell.",
    ],
  },
  {
    id: "admin-helpdesk",
    name: "Helpdesk — Support Admin",
    category: "admin",
    description: "Support desk admin — ticket queue, SLA tracking, and agent performance.",
    sections: ["sidebar nav (inbox / tickets / customers / knowledge base / reports)", "topbar search + filters (status / priority)", "KPI cards (open / overdue / avg response / CSAT)", "ticket queue (priority + SLA timers)", "ticket detail (conversation thread + reply + assignee)", "agent performance table", "volume / response chart"],
    tokens: {
      colors: { background: "#FAFBFC", surface: "#FFFFFF", primary: "#2563EB", primaryFg: "#FFFFFF", accent: "#F97316", muted: "#F1F5F9", border: "#E2E8F0", text: "#0F172A", textMuted: "#64748B" },
      fonts: { heading: "Inter (600)", body: "Inter (400)" },
      radius: "0.75rem",
      shadow: "soft (shadow-sm)",
      vibe: ["light", "clean", "support", "organized", "efficient"],
    },
    designNotes: [
      "Ticket list with priority dots + SLA countdown (red when breaching) + status badges.",
      "Ticket detail: conversation thread, reply box, assignee, customer panel.",
      "CSAT KPI and agent leaderboard; status/priority filters.",
      "Blue primary with orange 'urgent' accent.",
    ],
  },
  {
    id: "admin-fleet",
    name: "Fleet — Logistics ERP",
    category: "admin",
    description: "Fleet & logistics ERP — shipments, vehicle tracking, routes, and drivers.",
    sections: ["sidebar nav (dashboard / shipments / vehicles / drivers / routes)", "topbar search + region filter", "KPI cards (active shipments / in transit / delayed / fleet utilization)", "live map with vehicle markers", "shipments table (status + ETA)", "vehicle status list", "route detail panel", "delivery-performance chart"],
    tokens: {
      colors: { background: "#0B0F17", surface: "#121826", primary: "#22D3EE", primaryFg: "#06141A", accent: "#34D399", muted: "#161E2C", border: "#232C3C", text: "#E6EDF6", textMuted: "#8B98AC" },
      fonts: { heading: "Inter (700)", body: "Inter (400); mono for tracking IDs" },
      radius: "0.75rem",
      shadow: "flat, dark",
      vibe: ["dark", "operational", "map-centric", "real-time", "data-dense"],
    },
    designNotes: [
      "Live map panel with vehicle markers; dark control-room aesthetic.",
      "Shipments table with status (in-transit / delivered / delayed) + ETA; mono tracking IDs.",
      "Fleet-utilization gauge; route detail with ordered stops.",
      "Cyan primary, green 'on-time' accent, red for delays.",
    ],
  },
];

export function getStarterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}

/** Resolve a gallery card name (e.g. "Aurora — Modern SaaS") to its catalog id. */
export function starterIdForName(name: string): string | undefined {
  return STARTER_TEMPLATES.find((t) => t.name === name)?.id;
}

export function listStarterTemplates(): Array<Pick<StarterTemplate, "id" | "name" | "category" | "description">> {
  return STARTER_TEMPLATES.map(({ id, name, category, description }) => ({ id, name, category, description }));
}

/**
 * Keyword signals that map a free-text prompt to the best-fit starter template
 * — this is what makes "build an ecommerce store like Shopify" auto-start from
 * the storefront baseline (structure + design), the way Lovable does, without
 * the user manually picking a template. Multi-word phrases score higher than
 * single words, and the more specific niches are listed first so they win ties
 * (e.g. "crypto wallet" → crypto, not fintech). Returns null when nothing is a
 * confident match, so the caller can fall back to a generic design direction.
 */
const TEMPLATE_SIGNALS: Array<{ id: string; keywords: string[] }> = [
  { id: "crypto-chain", keywords: ["web3", "crypto", "blockchain", "defi", "nft", "dao", "token", "ethereum", "solana", "smart contract", "staking"] },
  { id: "ai-nova", keywords: ["ai ", "a.i.", "artificial intelligence", "machine learning", "ml model", "llm", "gpt", "chatbot", "copilot", "generative", "ai app", "ai tool", "ai saas"] },
  { id: "fintech-ledger", keywords: ["fintech", "neobank", "banking", "payments", "money transfer", "digital wallet", "investing app", "budgeting", "finance app", "stock trading"] },
  { id: "devtool-stack", keywords: ["developer tool", "dev tool", "sdk", "api platform", "cli tool", "open source library", "framework", "devtools", "documentation site for"] },
  { id: "mobileapp-orbit", keywords: ["mobile app", "ios app", "android app", "app store", "play store", "download our app", "app landing"] },
  { id: "waitlist-launch", keywords: ["waitlist", "coming soon", "early access", "pre-launch", "launching soon", "sign up early"] },
  { id: "podcast-airwave", keywords: ["podcast", "episodes", "audio show", "listen to"] },
  { id: "newsletter-dispatch", keywords: ["newsletter", "substack", "subscribers", "email list", "creator"] },
  { id: "jobboard-roster", keywords: ["job board", "jobs", "careers", "hiring", "recruit", "vacancies", "job listings"] },
  { id: "beauty-lumi", keywords: ["salon", "spa", "barber", "beauty", "hair", "nails", "massage", "wellness center", "skincare"] },
  { id: "restaurant-saffron", keywords: ["restaurant", "cafe", "coffee shop", "menu", "food", "dining", "bistro", "eatery", "bakery", "pizzeria", "bar "] },
  { id: "realestate-estate", keywords: ["real estate", "property", "properties", "realtor", "homes for sale", "apartments", "rental listing", "real-estate"] },
  { id: "fitness-forge", keywords: ["gym", "fitness", "workout", "personal trainer", "crossfit", "yoga studio", "pilates", "bodybuilding"] },
  { id: "medical-vitalis", keywords: ["clinic", "doctor", "medical", "dentist", "dental", "healthcare", "hospital", "physician", "therapy clinic"] },
  { id: "education-scholar", keywords: ["online course", "course", "bootcamp", "e-learning", "academy", "tutorial", "lms", "training program", "learn to"] },
  { id: "travel-voyage", keywords: ["travel", "tour", "trip", "vacation", "destination", "hotel booking", "flights", "holiday", "tourism"] },
  { id: "nonprofit-cause", keywords: ["nonprofit", "non-profit", "charity", "donate", "foundation", "ngo", "fundraiser", "fundraising"] },
  { id: "services-handy", keywords: ["plumber", "electrician", "cleaning service", "contractor", "handyman", "local service", "hvac", "roofing", "landscaping", "moving company"] },
  { id: "photography-aperture", keywords: ["photography", "photographer", "photo studio", "wedding photographer", "photo portfolio"] },
  { id: "event-summit", keywords: ["conference", "summit", "expo", "webinar", "meetup", "event ticket", "tickets for", "festival"] },
  // Specific admin / ERP niches — listed BEFORE the generic dashboard so they win.
  { id: "admin-ledgerbooks", keywords: ["accounting software", "accounting erp", "accounting system", "bookkeeping", "invoicing software", "finance erp", "accounts payable", "general ledger"] },
  { id: "admin-stockroom", keywords: ["inventory management", "warehouse management", "inventory system", "stock management", "inventory erp", "wms", "purchase orders", "stock control"] },
  { id: "admin-pipeline", keywords: ["crm", "customer relationship", "sales pipeline", "deal pipeline", "lead management", "sales crm", "pipeline management"] },
  { id: "admin-peoplehr", keywords: ["hr software", "hr system", "hrms", "human resources", "employee management", "payroll", "leave management", "hr erp"] },
  { id: "admin-foundry", keywords: ["manufacturing erp", "production management", "work orders", "mrp", "factory management", "shop floor", "production planning"] },
  { id: "admin-cartcontrol", keywords: ["order management", "ecommerce admin", "ecommerce dashboard", "store admin", "order management system", "fulfillment dashboard", "oms"] },
  { id: "admin-helpdesk", keywords: ["help desk", "helpdesk", "support ticket", "ticketing system", "customer support dashboard", "support desk", "service desk"] },
  { id: "admin-fleet", keywords: ["fleet management", "logistics dashboard", "shipment tracking", "delivery management", "fleet tracking", "transport management", "logistics erp"] },
  { id: "dashboard-pulse", keywords: ["dashboard", "admin panel", "admin dashboard", "erp", "back office", "analytics", "metrics", "kpi", "internal tool", "data visualization", "reporting tool"] },
  { id: "agency-vertex", keywords: ["agency", "creative studio", "marketing agency", "design agency", "branding studio"] },
  { id: "blog-quill", keywords: ["blog", "articles", "magazine", "publication", "personal writing"] },
  // Specific ecommerce niches — listed BEFORE the generic storefront so they win.
  { id: "ecommerce-atelier", keywords: ["fashion store", "clothing store", "apparel", "fashion brand", "clothing brand", "fashion", "clothing", "menswear", "womenswear", "streetwear"] },
  { id: "ecommerce-circuit", keywords: ["electronics store", "electronics", "gadgets", "gadget store", "tech store", "consumer electronics", "phone store", "laptops"] },
  { id: "ecommerce-glow", keywords: ["cosmetics", "makeup", "skincare", "beauty products", "beauty store", "cosmetics store", "skincare store", "makeup brand"] },
  { id: "ecommerce-harvest", keywords: ["grocery", "grocery store", "supermarket", "food delivery", "organic food", "fresh produce", "online grocery", "farmers market"] },
  { id: "ecommerce-loom", keywords: ["furniture", "furniture store", "home decor", "home furnishings", "homeware", "decor store", "interior store"] },
  { id: "ecommerce-lumiere", keywords: ["jewelry", "jewellery", "fine jewelry", "jewelry store", "rings", "necklaces", "luxury watches", "diamond"] },
  { id: "ecommerce-solo", keywords: ["single product", "one product store", "single-product", "dtc product", "one-product", "product landing page"] },
  { id: "ecommerce-pixel", keywords: ["digital products", "digital downloads", "digital download", "ebook", "ebooks", "printables", "presets", "sell digital", "sell templates", "digital store", "downloadable products", "gumroad"] },
  { id: "ecommerce-bazaar", keywords: ["ecommerce", "e-commerce", "online store", "storefront", "shopify", "sell products", "shop", "store", "cart", "checkout", "boutique", "merch"] },
  { id: "portfolio-monogram", keywords: ["portfolio", "personal website", "resume site", "cv site", "freelancer site"] },
  { id: "saas-aurora", keywords: ["saas", "b2b software", "subscription product", "software platform", "product launch", "startup landing"] },
];

/**
 * Choose the best-fit starter template id for a free-text build prompt, or null
 * if no niche is a confident match. Phrase matches (with spaces) weigh 2, single
 * tokens weigh 1; first listed wins ties.
 */
export function pickStarterTemplate(prompt: string): string | null {
  const text = ` ${(prompt || "").toLowerCase()} `;
  let best: { id: string; score: number } | null = null;
  for (const { id, keywords } of TEMPLATE_SIGNALS) {
    let score = 0;
    for (const kw of keywords) {
      const needle = kw.toLowerCase();
      if (needle.includes(" ")) {
        if (text.includes(needle)) score += 2;
      } else {
        // word-boundary match for single tokens to avoid "bar" in "barber" etc.
        if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { id, score };
  }
  return best?.id ?? null;
}
