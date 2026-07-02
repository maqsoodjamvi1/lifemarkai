import { classifyBuildIntent, shouldAutoBuildMode } from "./build-intent";

export interface DesignPreviewDirection {
  id: string;
  label: string;
  desc: string;
  colors: string[];
  /** Self-contained hero mockup HTML (inline styles only, no scripts) */
  previewHtml: string;
}

export const DESIGN_PREVIEW_SYSTEM_PROMPT = `You are a senior product designer. Given an app/website build request, return exactly THREE distinct visual directions as JSON:

{
  "directions": [
    {
      "id": "kebab-case-id",
      "label": "Short name (2-4 words)",
      "desc": "One sentence style summary",
      "colors": ["#primary", "#accent", "#background", "#text"],
      "previewHtml": "<div style=\\"...\\">...</div>"
    }
  ]
}

Rules:
- Exactly 3 directions — meaningfully different (e.g. minimal vs bold vs warm editorial).
- previewHtml: a SINGLE self-contained mini hero section (navbar strip + headline + CTA + 2-3 feature cards) using ONLY inline styles. Max ~1200 chars per preview. No <script>, no external URLs, no class names.
- colors: 4 hex swatches that match the preview.
- Tailor copy, palette, and layout to the user's niche — never generic "Lorem ipsum".
- Return raw JSON only — no markdown fences.`;

/** Offer Lovable-style 3-preview picker before first build on visual-forward apps. */
export function shouldOfferDesignPreviews(prompt: string, fileCount: number): boolean {
  if (fileCount > 8) return false;
  if (/\b(skip design|no design preview|just build|without design)\b/i.test(prompt)) return false;
  if (!shouldAutoBuildMode(prompt) && !/\b(landing|website|site|storefront|store|redesign|rebrand)\b/i.test(prompt)) {
    return false;
  }
  const { appType } = classifyBuildIntent(prompt);
  // Skip pure backend/admin prompts where visual direction is low-value
  if (appType === "erp" || appType === "pos" || appType === "crm") return false;
  return true;
}

export function buildDesignBrief(direction: DesignPreviewDirection): string {
  return [
    "---",
    "Selected design direction (apply throughout the build):",
    `Direction: ${direction.label}`,
    `Style: ${direction.desc}`,
    `Palette: ${direction.colors.join(", ")}`,
    "Match typography, spacing, color usage, and visual tone from this direction across all pages and components.",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto style seeding — guarantees visual variety when the user skips (or never
// sees) the 3-direction picker. Without this, theme choice falls back to the
// model's discretion, which historically drifts to the same dark one-pager.
// The archetype is picked deterministically from the project id, so one
// project keeps a consistent brand identity across edits while different
// projects get visibly different UIs.
// ─────────────────────────────────────────────────────────────────────────────

export interface StyleArchetype {
  id: string;
  label: string;
  desc: string;
  theme: "light" | "dark";
  palette: string[]; // [primary, accent, background, text]
  typography: string;
}

export const STYLE_ARCHETYPES: StyleArchetype[] = [
  {
    id: "minimal-light",
    label: "Minimal Light",
    desc: "Airy white surfaces, generous whitespace, thin borders, one restrained accent",
    theme: "light",
    palette: ["#2563eb", "#0ea5e9", "#ffffff", "#0f172a"],
    typography: "Inter — tight headings, relaxed body, no display font",
  },
  {
    id: "warm-editorial",
    label: "Warm Editorial",
    desc: "Cream background, serif display headlines, warm terracotta accents, magazine layout",
    theme: "light",
    palette: ["#c2410c", "#f59e0b", "#fffbf5", "#292524"],
    typography: "Serif display (Fraunces/Playfair feel) + humanist sans body",
  },
  {
    id: "bold-gradient",
    label: "Bold Gradient",
    desc: "Vivid gradient heroes, oversized type, rounded-2xl cards, energetic and saturated",
    theme: "light",
    palette: ["#7c3aed", "#ec4899", "#faf5ff", "#1e1b4b"],
    typography: "Extra-bold display headings, medium body, large sizes",
  },
  {
    id: "pastel-soft",
    label: "Pastel Soft",
    desc: "Soft pastel washes, pill buttons, rounded-3xl, friendly illustration-ready spacing",
    theme: "light",
    palette: ["#8b5cf6", "#f9a8d4", "#fdf4ff", "#3b0764"],
    typography: "Rounded geometric sans, comfortable line-height",
  },
  {
    id: "corporate-trust",
    label: "Corporate Trust",
    desc: "Crisp blue-and-slate business look, structured grid, subtle shadows, data-forward",
    theme: "light",
    palette: ["#1d4ed8", "#0891b2", "#f8fafc", "#0f172a"],
    typography: "Neutral grotesk, moderate weights, compact density",
  },
  {
    id: "nature-organic",
    label: "Nature Organic",
    desc: "Sage greens and earth tones, soft organic shapes, calm and grounded",
    theme: "light",
    palette: ["#15803d", "#84cc16", "#f7fdf4", "#14261a"],
    typography: "Low-contrast humanist sans, gentle letter-spacing",
  },
  {
    id: "glassy-tech-dark",
    label: "Glassy Tech Dark",
    desc: "Deep space background, glassmorphism cards, ambient glow blobs, neon accent",
    theme: "dark",
    palette: ["#818cf8", "#22d3ee", "#0a0a0f", "#e2e8f0"],
    typography: "Modern grotesk, gradient text on hero only",
  },
  {
    id: "luxury-noir",
    label: "Luxury Noir",
    desc: "Near-black with gold accents, thin serif display, wide tracking, premium restraint",
    theme: "dark",
    palette: ["#d4af37", "#a78bfa", "#0c0a09", "#fafaf9"],
    typography: "Thin serif display + uppercase tracked labels",
  },
  {
    id: "playful-pop",
    label: "Playful Pop",
    desc: "Chunky borders, offset shadows, bright primary colors, sticker-like badges",
    theme: "light",
    palette: ["#ea580c", "#facc15", "#fffbeb", "#1c1917"],
    typography: "Bold rounded sans, slightly oversized UI text",
  },
  {
    id: "mono-brutalist",
    label: "Mono Brutalist",
    desc: "Stark black-on-white, visible grid lines, monospace details, raw utilitarian edge",
    theme: "light",
    palette: ["#111111", "#dc2626", "#ffffff", "#111111"],
    typography: "Grotesk headings + monospace metadata/labels",
  },
];

/** App types that use the admin/ERP design language — auto styling would fight it. */
const ADMIN_APP_TYPES = new Set(["erp", "pos", "crm"]);

/** Words that indicate the user already has a visual direction in mind. */
const EXPLICIT_STYLE_RE =
  /\b(dark|light|black|white|minimal(ist)?|colou?rful|neon|pastel|brutalis[tm]|glassmorph\w*|gradient|retro|vintage|futuristic|elegant|luxur\w+|playful|corporate|monochrome|theme|palette|colou?r scheme|looks? like|style (of|like)|inspired by)\b/i;

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Deterministic style brief for builds where no direction was chosen.
 * Returns null when the user expressed a style themselves, when a picker
 * direction is already embedded, or for admin-language app types.
 */
export function buildAutoStyleBrief(prompt: string, seedKey: string): string | null {
  if (prompt.includes("Selected design direction")) return null;
  if (EXPLICIT_STYLE_RE.test(prompt)) return null;
  const { appType } = classifyBuildIntent(prompt);
  if (ADMIN_APP_TYPES.has(appType)) return null;

  const archetype = STYLE_ARCHETYPES[hashSeed(seedKey) % STYLE_ARCHETYPES.length];
  return [
    "---",
    "Auto-selected design direction (no direction was chosen — apply this one consistently; it exists so every app gets a distinct look instead of a default dark template):",
    `Direction: ${archetype.label} (${archetype.theme} theme)`,
    `Style: ${archetype.desc}`,
    `Palette: ${archetype.palette.join(", ")} (primary, accent, background, text)`,
    `Typography: ${archetype.typography}`,
    "Follow the Design System's theme rules for this theme. Adapt the palette to the niche if the domain strongly implies other colors (e.g. healthcare teal), but keep the layout personality, typography, and light/dark choice from this direction.",
  ].join("\n");
}

/** Strip scripts/event handlers from model-generated preview HTML. */
export function sanitizePreviewHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .slice(0, 4000);
}
