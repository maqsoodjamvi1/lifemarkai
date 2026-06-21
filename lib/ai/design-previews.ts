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

/** Strip scripts/event handlers from model-generated preview HTML. */
export function sanitizePreviewHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .slice(0, 4000);
}
