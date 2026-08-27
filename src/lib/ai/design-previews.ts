import { classifyBuildIntent,isAppShellAppType,shouldAutoBuildMode } from "./build-intent.ts";

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
- previewHtml: a SINGLE self-contained mini hero (navbar + headline + CTA + 2 feature cards) using ONLY inline styles. Max 800 chars per preview. No <script>, no external URLs, no class names.
- CRITICAL JSON safety: escape every double-quote inside previewHtml as \\". Do not use raw newlines inside any string — use <br/> or spaces instead. No trailing commas.
- colors: 4 hex swatches that match the preview.
- Tailor copy and palette to the user's niche — never "Lorem ipsum".
- Return raw JSON only — no markdown fences.`;

/** Offer Lovable-style 3-preview picker before first build on visual-forward apps. */
export function shouldOfferDesignPreviews(prompt: string, fileCount: number): boolean {
  if (fileCount > 8) return false;
  if (/\b(skip design|no design preview|just build|without design)\b/i.test(prompt)) return false;
  if (!shouldAutoBuildMode(prompt) && !/\b(landing|website|site|storefront|store|redesign|rebrand)\b/i.test(prompt)) {
    return false;
  }
  const { appType } = classifyBuildIntent(prompt);
  // Skip staff-only operational tools where visual direction is low-value —
  // the same 12-type app-shell set site-chrome and admin-shell already gate
  // on, not a local 3-type stand-in that misses 9 of them (healthcare, hr,
  // accounting, logistics, helpdesk, school, hotel, project-management,
  // admin-dashboard) and would offer a "bold vs warm editorial" picker meant
  // for public-facing pages to a school administration or hospital scheduling
  // build.
  if (isAppShellAppType(appType)) return false;
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
  // Same 12-type app-shell set as shouldOfferDesignPreviews above — a bright
  // "Playful Pop" or "Mono Brutalist" auto-style would fight the operational
  // density language every app-shell type gets from adminDensityLanguage().
  if (isAppShellAppType(appType)) return null;

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

function buildArchetypePreviewHtml(a: StyleArchetype, headline: string): string {
  const [primary, accent, bg, text] = a.palette;
  const safeHeadline = headline.replace(/[<>&"]/g, "").slice(0, 48) || "Your product";
  return [
    `<div style="font-family:system-ui,sans-serif;background:${bg};color:${text};padding:16px;border-radius:12px;min-height:180px">`,
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;font-size:11px;opacity:.7">`,
    `<span style="font-weight:700;letter-spacing:.04em">${a.label}</span>`,
    `<span style="padding:4px 10px;border-radius:999px;background:${primary};color:#fff;font-size:10px">Get started</span>`,
    `</div>`,
    `<div style="font-size:22px;font-weight:700;line-height:1.2;margin-bottom:8px;color:${text}">${safeHeadline}</div>`,
    `<div style="font-size:12px;opacity:.7;margin-bottom:14px;max-width:280px">${a.desc}</div>`,
    `<div style="display:flex;gap:8px">`,
    `<div style="flex:1;padding:10px;border-radius:10px;background:${accent}22;border:1px solid ${accent}55;font-size:11px">Feature one</div>`,
    `<div style="flex:1;padding:10px;border-radius:10px;background:${primary}18;border:1px solid ${primary}44;font-size:11px">Feature two</div>`,
    `</div></div>`,
  ].join("");
}

/** Three safe fallback cards when the model returns broken JSON. */
export function buildFallbackDesignPreviews(
  prompt: string,
  seedKey = "fallback",
): DesignPreviewDirection[] {
  const seed = hashSeed(seedKey + prompt.slice(0, 80));
  const headline =
    prompt.replace(/\s+/g, " ").trim().slice(0, 60) || "Your new experience";
  const seen = new Set<string>();
  const unique: StyleArchetype[] = [];
  for (let i = 0; unique.length < 3 && i < STYLE_ARCHETYPES.length * 2; i++) {
    const a = STYLE_ARCHETYPES[(seed + i) % STYLE_ARCHETYPES.length];
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    unique.push(a);
  }
  return unique.slice(0, 3).map((a) => ({
    id: a.id,
    label: a.label,
    desc: a.desc,
    colors: a.palette,
    previewHtml: sanitizePreviewHtml(buildArchetypePreviewHtml(a, headline)),
  }));
}

function stripJsonFences(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Light repair for common model JSON mistakes before JSON.parse. */
export function repairDesignPreviewJson(raw: string): string {
  let s = stripJsonFences(raw);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);

  // Walk the text: escape bare quotes inside strings, flatten newlines.
  // Closing quote = `"` whose next non-ws char is , } ] or : (end of key).
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === "\n" || ch === "\r" || ch === "\t") {
        out += " ";
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (j < s.length && /\s/.test(s[j]!)) j++;
        const next = s[j];
        if (next === "," || next === "}" || next === "]" || next === ":" || next === undefined) {
          inString = false;
          out += ch;
        } else {
          // Unescaped quote inside an HTML/value string
          out += '\\"';
        }
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    out += ch;
  }

  if (inString) out += '"';
  out = out.replace(/,\s*([}\]])/g, "$1");
  return out;
}

function normalizeDirection(raw: unknown): DesignPreviewDirection | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = typeof d.id === "string" ? d.id.trim() : "";
  const label = typeof d.label === "string" ? d.label.trim() : "";
  const desc =
    typeof d.desc === "string"
      ? d.desc.trim()
      : typeof d.description === "string"
        ? d.description.trim()
        : "";
  const colors = Array.isArray(d.colors)
    ? d.colors
        .filter((c): c is string => typeof c === "string" && /^#?[0-9a-fA-F]{3,8}$/.test(c))
        .map((c) => (c.startsWith("#") ? c : `#${c}`))
    : [];
  const previewHtml =
    typeof d.previewHtml === "string"
      ? d.previewHtml
      : typeof d.html === "string"
        ? d.html
        : "";
  if (!id || !label || !previewHtml) return null;
  return {
    id,
    label,
    desc: desc || label,
    colors: colors.length >= 2 ? colors.slice(0, 4) : ["#2563eb", "#0ea5e9", "#ffffff", "#0f172a"],
    previewHtml: sanitizePreviewHtml(previewHtml),
  };
}

/**
 * Parse model output for design previews. Never throws — returns [] on total failure.
 * Callers should fall back to `buildFallbackDesignPreviews` when length < 3.
 */
export function parseDesignPreviewResponse(content: string): DesignPreviewDirection[] {
  const attempts = [stripJsonFences(content), repairDesignPreviewJson(content)];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as { directions?: unknown };
      const list = Array.isArray(parsed?.directions) ? parsed.directions : [];
      const dirs = list.map(normalizeDirection).filter((d): d is DesignPreviewDirection => !!d);
      if (dirs.length > 0) return dirs.slice(0, 3);
    } catch {
      // try next strategy
    }
  }

  // Regex extraction when JSON is badly broken but fields are still visible
  const dirs: DesignPreviewDirection[] = [];
  const blockRe =
    /\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"label"\s*:\s*"([^"]+)"\s*,\s*"desc(?:ription)?"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?"previewHtml"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  for (const m of content.matchAll(blockRe)) {
    const previewHtml = m[4]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, " ")
      .replace(/\\r/g, "");
    const dir = normalizeDirection({
      id: m[1],
      label: m[2],
      desc: m[3].replace(/\\"/g, '"'),
      colors: ["#2563eb", "#0ea5e9", "#ffffff", "#0f172a"],
      previewHtml,
    });
    if (dir) dirs.push(dir);
    if (dirs.length >= 3) break;
  }
  return dirs;
}
