import type { ProjectFile } from "@/types/database";

/** Escape a class name for use in a CSS selector. */
function esc(cls: string): string {
  return cls.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

const SHADCN_RULES: Record<string, string> = {
  "bg-background": "background-color:hsl(var(--background))",
  "text-foreground": "color:hsl(var(--foreground))",
  "bg-card": "background-color:hsl(var(--card))",
  "text-card-foreground": "color:hsl(var(--card-foreground))",
  "bg-primary": "background-color:hsl(var(--primary))",
  "text-primary": "color:hsl(var(--primary))",
  "text-primary-foreground": "color:hsl(var(--primary-foreground))",
  "bg-secondary": "background-color:hsl(var(--secondary))",
  "text-secondary-foreground": "color:hsl(var(--secondary-foreground))",
  "bg-muted": "background-color:hsl(var(--muted))",
  "text-muted-foreground": "color:hsl(var(--muted-foreground))",
  "bg-accent": "background-color:hsl(var(--accent))",
  "text-accent-foreground": "color:hsl(var(--accent-foreground))",
  "bg-destructive": "background-color:hsl(var(--destructive))",
  "text-destructive": "color:hsl(var(--destructive))",
  "border-border": "border-color:hsl(var(--border))",
  "border-input": "border-color:hsl(var(--input))",
  "ring-ring": "--tw-ring-color:hsl(var(--ring))",
};

const SPACING: Record<string, string> = {
  "0": "0",
  "0.5": "0.125rem",
  "1": "0.25rem",
  "1.5": "0.375rem",
  "2": "0.5rem",
  "2.5": "0.625rem",
  "3": "0.75rem",
  "4": "1rem",
  "5": "1.25rem",
  "6": "1.5rem",
  "8": "2rem",
  "10": "2.5rem",
  "12": "3rem",
  "16": "4rem",
  "20": "5rem",
  "24": "6rem",
};

const MAX_W: Record<string, string> = {
  xs: "20rem",
  sm: "24rem",
  md: "28rem",
  lg: "32rem",
  xl: "36rem",
  "2xl": "42rem",
  "3xl": "48rem",
  "4xl": "56rem",
  "5xl": "64rem",
  "6xl": "72rem",
  "7xl": "80rem",
};

function utilityRule(cls: string): string | null {
  if (SHADCN_RULES[cls]) {
    return `.${esc(cls)}{${SHADCN_RULES[cls]}}`;
  }

  const staticRules: Record<string, string> = {
    flex: "display:flex",
    "inline-flex": "display:inline-flex",
    grid: "display:grid",
    hidden: "display:none",
    block: "display:block",
    "items-center": "align-items:center",
    "items-start": "align-items:flex-start",
    "items-end": "align-items:flex-end",
    "justify-center": "justify-content:center",
    "justify-between": "justify-content:space-between",
    "justify-start": "justify-content:flex-start",
    "justify-end": "justify-content:flex-end",
    "flex-col": "flex-direction:column",
    "flex-row": "flex-direction:row",
    "flex-1": "flex:1 1 0%",
    "flex-wrap": "flex-wrap:wrap",
    "min-h-screen": "min-height:100vh",
    "h-full": "height:100%",
    "h-screen": "height:100vh",
    "w-full": "width:100%",
    fixed: "position:fixed",
    absolute: "position:absolute",
    relative: "position:relative",
    sticky: "position:sticky",
    "inset-0": "inset:0",
    "inset-x-0": "left:0;right:0",
    "top-0": "top:0",
    "bottom-0": "bottom:0",
    "left-0": "left:0",
    "right-0": "right:0",
    "z-10": "z-index:10",
    "z-20": "z-index:20",
    "z-50": "z-index:50",
    "mx-auto": "margin-left:auto;margin-right:auto",
    "text-center": "text-align:center",
    "text-left": "text-align:left",
    "text-right": "text-align:right",
    "font-bold": "font-weight:700",
    "font-semibold": "font-weight:600",
    "font-medium": "font-weight:500",
    "text-xs": "font-size:0.75rem;line-height:1rem",
    "text-sm": "font-size:0.875rem;line-height:1.25rem",
    "text-base": "font-size:1rem;line-height:1.5rem",
    "text-lg": "font-size:1.125rem;line-height:1.75rem",
    "text-xl": "font-size:1.25rem;line-height:1.75rem",
    "text-2xl": "font-size:1.5rem;line-height:2rem",
    "text-3xl": "font-size:1.875rem;line-height:2.25rem",
    "text-4xl": "font-size:2.25rem;line-height:2.5rem",
    "text-white": "color:#fff",
    underline: "text-decoration-line:underline",
    "no-underline": "text-decoration-line:none",
    border: "border-width:1px",
    "border-t": "border-top-width:1px",
    "border-b": "border-bottom-width:1px",
    "rounded-md": "border-radius:0.375rem",
    "rounded-lg": "border-radius:0.5rem",
    "rounded-xl": "border-radius:0.75rem",
    "rounded-full": "border-radius:9999px",
    "shadow-sm": "box-shadow:0 1px 2px 0 rgb(0 0 0 / 0.05)",
    shadow: "box-shadow:0 1px 3px 0 rgb(0 0 0 / 0.1),0 1px 2px -1px rgb(0 0 0 / 0.1)",
    "shadow-lg": "box-shadow:0 10px 15px -3px rgb(0 0 0 / 0.1),0 4px 6px -4px rgb(0 0 0 / 0.1)",
    "backdrop-blur-xl": "backdrop-filter:blur(24px)",
    "object-cover": "object-fit:cover",
    "overflow-hidden": "overflow:hidden",
    "overflow-auto": "overflow:auto",
    "truncate": "overflow:hidden;text-overflow:ellipsis;white-space:nowrap",
    "transition-colors": "transition-property:color,background-color,border-color;transition-duration:150ms",
    "whitespace-nowrap": "white-space:nowrap",
    "leading-relaxed": "line-height:1.625",
    "antialiased": "-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale",
  };
  if (staticRules[cls]) return `.${esc(cls)}{${staticRules[cls]}}`;

  const space = cls.match(/^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y)-([\d.]+)$/);
  if (space) {
    const val = SPACING[space[2]];
    if (!val) return null;
    const prop =
      space[1] === "p" ? `padding:${val}` :
      space[1] === "px" ? `padding-left:${val};padding-right:${val}` :
      space[1] === "py" ? `padding-top:${val};padding-bottom:${val}` :
      space[1] === "pt" ? `padding-top:${val}` :
      space[1] === "pb" ? `padding-bottom:${val}` :
      space[1] === "pl" ? `padding-left:${val}` :
      space[1] === "pr" ? `padding-right:${val}` :
      space[1] === "m" ? `margin:${val}` :
      space[1] === "mx" ? `margin-left:${val};margin-right:${val}` :
      space[1] === "my" ? `margin-top:${val};margin-bottom:${val}` :
      space[1] === "mt" ? `margin-top:${val}` :
      space[1] === "mb" ? `margin-bottom:${val}` :
      space[1] === "ml" ? `margin-left:${val}` :
      space[1] === "mr" ? `margin-right:${val}` :
      space[1] === "gap" ? `gap:${val}` :
      space[1] === "space-x" ? `--tw-space-x-reverse:0;margin-left:calc(${val} * calc(1 - var(--tw-space-x-reverse)));margin-right:calc(${val} * var(--tw-space-x-reverse))` :
      `--tw-space-y-reverse:0;margin-top:calc(${val} * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(${val} * var(--tw-space-y-reverse))`;
    return `.${esc(cls)}{${prop}}`;
  }

  const maxW = cls.match(/^max-w-(.+)$/);
  if (maxW && MAX_W[maxW[1]]) return `.${esc(cls)}{max-width:${MAX_W[maxW[1]]}}`;

  const w = cls.match(/^w-(\d+)$/);
  if (w && SPACING[w[1]]) return `.${esc(cls)}{width:${SPACING[w[1]]}}`;

  const h = cls.match(/^h-(\d+)$/);
  if (h && SPACING[h[1]]) return `.${esc(cls)}{height:${SPACING[h[1]]}}`;

  const arbBg = cls.match(/^bg-\[(#[^\]]+)\]$/);
  if (arbBg) return `.${esc(cls)}{background-color:${arbBg[1]}}`;

  const arbText = cls.match(/^text-\[(#[^\]]+)\]$/);
  if (arbText) return `.${esc(cls)}{color:${arbText[1]}}`;

  const opacity = cls.match(/^opacity-(\d+)$/);
  if (opacity) return `.${esc(cls)}{opacity:${Number(opacity[1]) / 100}}`;

  const slateText = cls.match(/^text-slate-(\d+)$/);
  if (slateText) {
    const shades: Record<string, string> = {
      "300": "#cbd5e1", "400": "#94a3b8", "500": "#64748b", "600": "#475569", "700": "#334155",
    };
    const c = shades[slateText[1]];
    if (c) return `.${esc(cls)}{color:${c}}`;
  }

  const violetText = cls.match(/^text-violet-(\d+)$/);
  if (violetText && violetText[1] === "400") return `.${esc(cls)}{color:#a78bfa}`;

  const borderOpacity = cls.match(/^border-white\/\[([\d.]+)\]$/);
  if (borderOpacity) {
    return `.${esc(cls)}{border-color:rgb(255 255 255 / ${borderOpacity[1]})}`;
  }

  const bgOpacity = cls.match(/^bg-\[([^\]]+)\]\/(\d+)$/);
  if (bgOpacity) {
    return `.${esc(cls)}{background-color:color-mix(in srgb, ${bgOpacity[1]} ${bgOpacity[2]}%, transparent)}`;
  }

  return null;
}

export function extractClassNames(files: ProjectFile[]): string[] {
  const found = new Set<string>();
  for (const f of files) {
    if (!/\.(tsx|jsx|ts|js|html|css)$/.test(f.path)) continue;
    const content = f.content ?? "";
    for (const m of content.matchAll(/class(?:Name)?=["']([^"']+)["']/g)) {
      for (const part of m[1].split(/\s+/)) {
        if (part) found.add(part);
      }
    }
    for (const m of content.matchAll(/className=\{`([^`]+)`\}/g)) {
      for (const part of m[1].split(/\s+/)) {
        if (part && !part.includes("${")) found.add(part);
      }
    }
  }
  return [...found];
}

export function generateFallbackUtilityCss(files: ProjectFile[]): string {
  const rules: string[] = [];
  const seen = new Set<string>();
  for (const cls of extractClassNames(files)) {
    const rule = utilityRule(cls);
    if (rule && !seen.has(rule)) {
      seen.add(rule);
      rules.push(rule);
    }
  }
  return rules.join("\n");
}
