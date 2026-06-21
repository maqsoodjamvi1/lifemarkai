/**
 * Curated design directions — drive VARIETY + QUALITY in generated apps.
 *
 * The build prompt's base design system tended to make every app look the same
 * (dark + violet). This injects ONE specific, polished, named aesthetic per
 * build (chosen deterministically from the prompt, biased by domain) so two
 * different requests get genuinely different, intentional designs — each with a
 * cohesive palette, Google-font pairing, radius, and styling guidance.
 *
 * Only applied when the user hasn't explicitly chosen a starter template
 * (see lib/templates/starter-catalog.ts + buildTemplateRefinementBlock).
 */

export interface DesignDirection {
  id: string;
  name: string;
  theme: "light" | "dark";
  /** When true, prefer for tech/AI/gaming/crypto/luxury prompts. */
  techy?: boolean;
  fonts: string; // Google Fonts pairing (heading / body)
  palette: string; // primary + accent + neutrals
  radius: string;
  shadow: string;
  vibe: string;
  notes: string;
}

export const DESIGN_DIRECTIONS: DesignDirection[] = [
  {
    id: "editorial-minimal",
    name: "Editorial Minimal",
    theme: "light",
    fonts: "Fraunces (serif headings) + Inter (body)",
    palette: "near-black #141414 on warm off-white #FAFAF7; single accent #E4572E",
    radius: "small (rounded-sm) — sharp, editorial",
    shadow: "none — rely on whitespace + hairline borders (border-stone-200)",
    vibe: "calm, premium, lots of whitespace, big serif display",
    notes: "Asymmetric layout, oversized headings, generous line-height, restrained accent use.",
  },
  {
    id: "soft-pastel",
    name: "Soft Pastel",
    theme: "light",
    fonts: "Poppins (headings) + Inter (body)",
    palette: "indigo #6366F1 + pastel lilac/mint surfaces on white; soft gradients",
    radius: "large (rounded-2xl/3xl) — friendly, pill buttons",
    shadow: "soft, diffuse (shadow-lg shadow-indigo-100)",
    vibe: "friendly, approachable, rounded, airy",
    notes: "Rounded cards, gentle gradients, playful but clean. Great for consumer/SaaS/education.",
  },
  {
    id: "corporate-clean",
    name: "Corporate Clean",
    theme: "light",
    fonts: "Geist or Inter (headings + body, tight)",
    palette: "trust blue #2563EB on white/slate-50; slate-900 text, slate-200 borders",
    radius: "medium (rounded-lg)",
    shadow: "subtle shadow-sm on cards",
    vibe: "professional, trustworthy, structured",
    notes: "Clear grid, strong hierarchy, data-friendly. Great for finance, B2B, healthcare, legal.",
  },
  {
    id: "warm-organic",
    name: "Warm Organic",
    theme: "light",
    fonts: "Playfair Display (headings) + Nunito Sans (body)",
    palette: "terracotta #C2410C + olive/cream; warm earthy neutrals",
    radius: "medium-large, organic",
    shadow: "warm, low",
    vibe: "cozy, artisanal, inviting",
    notes: "Earthy palette, lifestyle imagery, generous spacing. Great for food, wellness, travel, crafts.",
  },
  {
    id: "vibrant-bold",
    name: "Vibrant Bold",
    theme: "light",
    fonts: "Space Grotesk (headings) + Inter (body)",
    palette: "high-saturation duo (e.g. #FF5C00 + #2563EB) with bold color blocks on white",
    radius: "mixed — large media blocks, sharp text",
    shadow: "flat color blocks instead of shadows",
    vibe: "energetic, expressive, modern marketing",
    notes: "Big type, color blocks, strong CTAs. Great for startups, events, creative agencies.",
  },
  {
    id: "premium-dark",
    name: "Premium Dark Glass",
    theme: "dark",
    techy: true,
    fonts: "Geist or Inter (tight tracking)",
    palette: "near-black #0A0A0F surfaces, glassy white/[0.04] cards, electric accent (violet/cyan)",
    radius: "rounded-2xl",
    shadow: "colored glow on primary CTAs",
    vibe: "premium, sleek, glassmorphism, ambient glow",
    notes: "Dark glass cards, subtle gradients, glow accents. Great for AI, SaaS, crypto, luxury.",
  },
  {
    id: "neo-terminal",
    name: "Neo Terminal",
    theme: "dark",
    techy: true,
    fonts: "JetBrains Mono (headings/accents) + Inter (body)",
    palette: "#0B0F0C bg, neon green/lime accent, monospace details, grid lines",
    radius: "small/sharp",
    shadow: "none — borders + glow",
    vibe: "developer, technical, hacker, precise",
    notes: "Monospace accents, terminal motifs, data-dense. Great for dev-tools, infra, analytics.",
  },
  {
    id: "midnight-neon",
    name: "Midnight Neon",
    theme: "dark",
    techy: true,
    fonts: "Sora (headings) + Inter (body)",
    palette: "deep indigo/navy #0B1020 with neon magenta + cyan gradients",
    radius: "rounded-xl",
    shadow: "neon glow",
    vibe: "bold, futuristic, gaming/music energy",
    notes: "Gradient meshes, neon highlights, motion. Great for gaming, music, nightlife, web3.",
  },
];

const TECH_RE = /\b(ai|ml|dev|developer|code|coding|saas|crypto|web3|blockchain|gaming|game|terminal|infra|analytics|dashboard|api|llm|agent|music|nightlife|luxury|premium)\b/i;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Light-theme domain biasing: keep results ON-BRAND while still varying within
// the matched subset (a law firm shouldn't get "Vibrant Bold").
const LIGHT_DOMAIN_BIAS: Array<{ re: RegExp; ids: string[] }> = [
  // Serious / professional → clean or editorial
  { re: /\b(law|legal|attorney|finance|financial|bank|insurance|account|consult|b2b|enterprise|medical|health|clinic|dental|hospital|real ?estate|government)\b/i,
    ids: ["corporate-clean", "editorial-minimal"] },
  // Food / wellness / lifestyle / travel → warm or pastel
  { re: /\b(food|bakery|cafe|coffee|restaurant|recipe|wellness|spa|yoga|travel|hotel|craft|garden|candle|organic)\b/i,
    ids: ["warm-organic", "soft-pastel"] },
  // Creative / events / startups / marketing → bold or pastel
  { re: /\b(agency|creative|design|portfolio|event|wedding|conference|startup|launch|marketing|fashion|photographer|art|studio)\b/i,
    ids: ["vibrant-bold", "soft-pastel", "editorial-minimal"] },
  // Kids / education → pastel or warm
  { re: /\b(kid|child|school|education|learn|course|teach|family|toy)\b/i, ids: ["soft-pastel", "warm-organic"] },
];

/**
 * Deterministically pick a design direction from the prompt. Tech/AI/gaming
 * prompts draw from the dark "techy" set; other prompts are biased to a domain-
 * appropriate light subset — and within each subset the choice still varies by a
 * stable hash, so different prompts get different (but on-brand) designs.
 */
export function pickDesignDirection(prompt: string): DesignDirection {
  const seed = hashString(prompt.trim().toLowerCase());
  const byId = (ids: string[]) => DESIGN_DIRECTIONS.filter((d) => ids.includes(d.id));

  if (TECH_RE.test(prompt)) {
    const dark = DESIGN_DIRECTIONS.filter((d) => d.techy);
    return dark[seed % dark.length];
  }
  for (const bias of LIGHT_DOMAIN_BIAS) {
    if (bias.re.test(prompt)) {
      const subset = byId(bias.ids);
      if (subset.length) return subset[seed % subset.length];
    }
  }
  // No domain match → any light direction (still varied by hash).
  const light = DESIGN_DIRECTIONS.filter((d) => d.theme === "light");
  return light[seed % light.length];
}

/** Prompt block describing the chosen direction. Empty string if no prompt. */
export function buildDesignDirectionBlock(prompt: string): string {
  if (!prompt || !prompt.trim()) return "";
  const d = pickDesignDirection(prompt);
  return `

---
# DESIGN DIRECTION FOR THIS BUILD — "${d.name}" (${d.theme})
Use this specific, cohesive aesthetic so the result looks intentional and distinct
(not a generic template). Commit to it fully across every section:
- Theme: ${d.theme}
- Palette: ${d.palette}
- Fonts: ${d.fonts} — load via Google Fonts (<link> in index.html or @import in CSS).
- Radius: ${d.radius} · Shadows: ${d.shadow}
- Vibe: ${d.vibe}
- ${d.notes}
Keep the domain-appropriate accent from the palette table, apply the theme
consistently (don't mix light and dark), and make spacing/typography polished.
---`;
}
