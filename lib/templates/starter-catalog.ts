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
  category: "saas" | "portfolio" | "ecommerce" | "blog" | "dashboard" | "agency" | "event" | "restaurant";
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
