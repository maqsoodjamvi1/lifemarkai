import { classifyBuildIntent,isAppShellAppType,shouldAutoBuildMode } from "./build-intent.ts";

export interface DesignPreviewDirection {
  id: string;
  label: string;
  desc: string;
  colors: string[];
  /** Self-contained hero mockup HTML (inline styles only, no scripts) */
  previewHtml: string;
}

export type DesignPreviewSurface = "public-site" | "app-shell" | "product-ui";

export interface DesignPreviewContext {
  appType: ReturnType<typeof classifyBuildIntent>["appType"];
  surface: DesignPreviewSurface;
  surfaceLabel: string;
}

/** Resolve structure before style so a CRM cannot receive landing-page frames. */
export function getDesignPreviewContext(prompt: string): DesignPreviewContext {
  const { appType } = classifyBuildIntent(prompt);
  if (isAppShellAppType(appType)) {
    return { appType, surface: "app-shell", surfaceLabel: `${appType.replace(/-/g, " ")} workspace` };
  }
  if (appType === "marketing-website" || appType === "portfolio" || appType === "blog") {
    return { appType, surface: "public-site", surfaceLabel: `${appType.replace(/-/g, " ")} concepts` };
  }
  return { appType, surface: "product-ui", surfaceLabel: `${appType.replace(/-/g, " ")} product concepts` };
}

const JSON_RESPONSE_CONTRACT = `Return exactly THREE distinct visual directions as JSON:

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
- Exactly 3 directions with meaningfully different COMPOSITION, density, typography, and palette. A color swap of the same frame is invalid.
- previewHtml: a SINGLE self-contained compact frame using ONLY inline styles. Max 1400 chars per preview. No <script>, no external URLs, no class names.
- CRITICAL JSON safety: escape every double-quote inside previewHtml as \\". Do not use raw newlines inside any string — use <br/> or spaces instead. No trailing commas.
- colors: 4 hex swatches that match the preview.
- Tailor copy and palette to the user's niche — never "Lorem ipsum".
- Return raw JSON only — no markdown fences.`;

/** Create an app-type-aware prompt shared by both design-selection surfaces. */
export function buildDesignPreviewSystemPrompt(prompt: string): string {
  const context = getDesignPreviewContext(prompt);
  const surfaceContract = context.surface === "app-shell"
    ? `SURFACE: OPERATIONAL APP SHELL (${context.appType}). Every preview MUST show a desktop management workspace: persistent sidebar or rail, top command/search area, domain-specific records, and either a table, pipeline, schedule, KPI grid, or workflow. NEVER render a marketing hero, testimonials, pricing, a giant slogan, or a landing-page CTA. Direction 1 is calm/data-dense, direction 2 modular/workflow-led, direction 3 command-center/high-contrast.`
    : context.surface === "public-site"
      ? `SURFACE: PUBLIC-FACING SITE (${context.appType}). Every preview MUST show brand navigation, persuasive content, and a clear customer CTA. NEVER render an admin sidebar, KPI dashboard, data table, pipeline, or back-office chrome. Direction 1 is editorial/asymmetric, direction 2 conversion-led/split-layout, direction 3 immersive/bold with a materially different hierarchy.`
      : `SURFACE: CUSTOMER PRODUCT UI (${context.appType}). Show the product's primary interactive experience, not a generic marketing hero and not a back-office analytics dashboard. Use domain-specific navigation and content. Direction 1 is focused/minimal, direction 2 card-led/modular, direction 3 immersive/high-contrast with a materially different hierarchy.`;

  return `You are a senior product designer. First respect the requested product architecture, then explore its visual language.\n\n${surfaceContract}\n\n${JSON_RESPONSE_CONTRACT}`;
}

/** Offer Lovable-style 3-preview picker before first build on visual-forward apps. */
export function shouldOfferDesignPreviews(prompt: string, fileCount: number): boolean {
  if (/\b(skip design|no design preview|just build|without design)\b/i.test(prompt)) return false;
  const explicitDesignChoice =
    /\b(design directions?|choose (a )?design|pick (a )?design|style options?|visual directions?|theme options?)\b/i.test(prompt) ||
    /\b(re-?design|re-?style|change\s+(the\s+)?(?:website\s+|site\s+|app\s+|page\s+)?(design|theme|style|palette|look)|new\s+(design|theme|look|style)|different\s+(design|theme|look|style)|make it look)\b/i.test(prompt);
  if (fileCount > 8 && !explicitDesignChoice) return false;
  if (
    !explicitDesignChoice &&
    !shouldAutoBuildMode(prompt) &&
    !/\b(landing|website|site|storefront|store|redesign|rebrand)\b/i.test(prompt)
  ) {
    return false;
  }
  const { appType } = classifyBuildIntent(prompt);
  // Operational apps need choices about density, navigation, and workflows,
  // but only when requested explicitly. Ordinary CRM/ERP edits stay fast.
  if (isAppShellAppType(appType)) return explicitDesignChoice;
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

function buildArchetypePreviewHtml(
  a: StyleArchetype,
  headline: string,
  surface: DesignPreviewSurface,
  variant: number,
): string {
  const [primary, accent, bg, text] = a.palette;
  const safeHeadline = headline.replace(/[<>&"]/g, "").slice(0, 48) || "Your product";
  if (surface === "app-shell") {
    const content = variant % 3 === 0
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px"><div style="padding:9px;border:1px solid ${primary}35;border-radius:8px"><small style="opacity:.65">Open pipeline</small><b style="display:block;font-size:18px">24 records</b></div><div style="padding:9px;background:${accent}20;border-radius:8px"><small style="opacity:.65">This week</small><b style="display:block;font-size:18px">+18%</b></div></div>`
      : variant % 3 === 1
        ? `<div style="display:grid;gap:6px"><div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;font-size:9px;opacity:.6"><span>Record</span><span>Status</span><span>Owner</span></div><div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;padding:8px;background:${primary}12;border-radius:7px;font-size:9px"><b>Priority account</b><span>Active</span><span>Alex</span></div></div>`
        : `<div style="display:flex;gap:6px;align-items:flex-end;height:55px">${[42, 70, 52, 88, 64].map((height) => `<i style="display:block;flex:1;height:${height}%;background:${primary};border-radius:4px 4px 1px 1px;opacity:.75"></i>`).join("")}</div>`;
    return `<div style="font-family:system-ui,sans-serif;background:${bg};color:${text};padding:10px;border-radius:12px;min-height:180px;display:grid;grid-template-columns:58px 1fr;gap:10px"><aside style="background:${primary}14;border:1px solid ${primary}25;border-radius:9px;padding:8px 6px"><b style="font-size:9px">${a.label}</b><div style="margin-top:14px;display:grid;gap:8px;opacity:.55;font-size:8px"><span>Overview</span><span>Records</span><span>Reports</span><span>Settings</span></div></aside><main><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b style="font-size:12px">${safeHeadline}</b><span style="padding:4px 7px;border-radius:6px;background:${primary};color:#fff;font-size:8px">+ New</span></div>${content}</main></div>`;
  }
  if (surface === "public-site") {
    const content = variant % 3 === 0
      ? `<div style="max-width:85%;font-size:25px;font-weight:800;line-height:1.05;margin:20px 0 8px">${safeHeadline}</div><p style="font-size:10px;opacity:.65;max-width:75%">A crafted experience with a clear story and memorable details.</p>`
      : variant % 3 === 1
        ? `<div style="display:grid;grid-template-columns:1.15fr .85fr;gap:10px;align-items:stretch;margin-top:15px"><div><b style="font-size:20px;line-height:1.1;display:block">${safeHeadline}</b><span style="font-size:9px;opacity:.65">Made for people who value thoughtful work.</span></div><div style="border-radius:12px;background:linear-gradient(135deg,${primary},${accent});min-height:88px"></div></div>`
        : `<div style="margin-top:14px;padding:16px 12px;border:1px solid ${primary}30;border-radius:14px;text-align:center;background:${primary}0d"><b style="font-size:21px;line-height:1.1;display:block">${safeHeadline}</b><span style="font-size:9px;opacity:.65">Distinctive, useful, and ready to explore.</span></div>`;
    return `<div style="font-family:system-ui,sans-serif;background:${bg};color:${text};padding:14px;border-radius:12px;min-height:180px"><nav style="display:flex;justify-content:space-between;align-items:center;font-size:9px"><b>${a.label}</b><span style="word-spacing:8px;opacity:.65">Story Work Contact</span></nav>${content}<span style="display:inline-block;margin-top:11px;padding:6px 10px;border-radius:999px;background:${primary};color:#fff;font-size:9px">Explore the experience →</span></div>`;
  }
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
  const { surface } = getDesignPreviewContext(prompt);
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
  return unique.slice(0, 3).map((a, index) => ({
    id: a.id,
    label: a.label,
    desc: a.desc,
    colors: a.palette,
    previewHtml: sanitizePreviewHtml(buildArchetypePreviewHtml(a, headline, surface, index)),
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
