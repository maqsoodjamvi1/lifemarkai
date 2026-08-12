/**
 * Project design-system context — Lovable-parity design consistency.
 *
 * On INCREMENTAL builds Lovable keeps the app visually coherent because the
 * model is always shown the project's real design system. This extracts it
 * from the actual files (CSS custom properties, fonts, the ui-kit component
 * inventory, tailwind theme keys) and renders a compact prompt block telling
 * the model to REUSE tokens/components instead of inventing ad-hoc styles.
 *
 * Pure + deterministic → port-testable.
 */

interface FileLike {
  path: string;
  content?: string | null;
}

const TOKEN_CAP = 36;

function extractCssVars(css: string): string[] {
  const out: string[] = [];
  const re = /(--[\w-]+)\s*:\s*([^;]{1,60});/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(css)) !== null && out.length < TOKEN_CAP) {
    const name = m[1];
    if (seen.has(name)) continue; // first (usually :root/light) wins
    seen.add(name);
    out.push(`${name}: ${m[2].trim()}`);
  }
  return out;
}

function extractFonts(files: FileLike[]): string[] {
  const fonts = new Set<string>();
  for (const f of files) {
    const c = f.content ?? "";
    if (!c) continue;
    if (f.path.endsWith("index.html") || f.path.endsWith(".css")) {
      const gf = c.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^&"']+)/g);
      for (const m of gf) {
        for (const fam of m[1].split("|")) fonts.add(decodeURIComponent(fam.split(":")[0]).replace(/\+/g, " "));
      }
      const ff = c.matchAll(/font-family:\s*['"]?([A-Za-z0-9 _-]{3,30})['"]?/g);
      for (const m of ff) {
        const name = m[1].trim();
        if (!/^(inherit|initial|sans-serif|serif|monospace|system-ui|ui-sans-serif)$/i.test(name)) fonts.add(name);
      }
    }
  }
  return Array.from(fonts).slice(0, 5);
}

function extractTailwindThemeKeys(files: FileLike[]): string[] {
  const cfg = files.find((f) => /tailwind\.config\.(js|ts|cjs|mjs)$/.test(f.path));
  if (!cfg?.content) return [];
  const m = cfg.content.match(/colors\s*:\s*\{([\s\S]{0,1200}?)\n\s*\}/);
  if (!m) return [];
  const keys = Array.from(m[1].matchAll(/^\s*["']?([a-zA-Z][\w-]*)["']?\s*:/gm)).map((k) => k[1]);
  return Array.from(new Set(keys)).slice(0, 16);
}

/**
 * Build the "Project Design System" prompt block, or null when the project has
 * no meaningful design surface yet (fresh builds get design-direction seeding
 * instead).
 */
export function buildDesignSystemBlock(files: FileLike[]): string | null {
  const cssFile =
    files.find((f) => /src\/(index|globals?|app)\.css$/.test(f.path)) ??
    files.find((f) => f.path.endsWith(".css") && (f.content ?? "").includes("--"));
  const vars = cssFile?.content ? extractCssVars(cssFile.content) : [];
  const uiKit = files
    .filter((f) => /^src\/components\/ui\/[\w-]+\.(tsx|jsx)$/.test(f.path))
    .map((f) => f.path.split("/").pop()!.replace(/\.(tsx|jsx)$/, ""))
    .slice(0, 24);
  const fonts = extractFonts(files);
  const twKeys = extractTailwindThemeKeys(files);

  if (vars.length === 0 && uiKit.length === 0 && fonts.length === 0 && twKeys.length === 0) return null;

  const parts: string[] = [
    "---",
    "# Project Design System (extracted from the ACTUAL code — reuse it)",
    "",
    "This project already has a design language. When editing or adding UI:",
    "- REUSE these tokens and components; do NOT invent new ad-hoc colors, shadows, or radii.",
    "- New components must visually match the existing ones.",
    "- Only change these tokens when the user explicitly asks for a redesign/restyle.",
  ];
  if (vars.length > 0) {
    parts.push("", `CSS tokens (${cssFile!.path}):`, "```css", ...vars.map((v) => v + ";"), "```");
  }
  if (twKeys.length > 0) parts.push("", `Tailwind theme color keys: ${twKeys.join(", ")}`);
  if (fonts.length > 0) parts.push("", `Fonts in use: ${fonts.join(", ")}`);
  if (uiKit.length > 0) parts.push("", `Existing ui kit (src/components/ui): ${uiKit.join(", ")}`);
  parts.push("---");
  return parts.join("\n");
}

/** One decision-log entry persisted on projects.metadata.decision_log. */
export interface BuildDecision {
  at: string;
  req: string;
  files: number;
  paths?: string[];
}

const DECISION_LOG_CAP = 15;

export function appendDecision(
  existing: unknown,
  entry: BuildDecision,
): BuildDecision[] {
  const list = Array.isArray(existing) ? (existing as BuildDecision[]).filter((d) => d && typeof d.req === "string") : [];
  list.push(entry);
  return list.slice(-DECISION_LOG_CAP);
}

/** Render the decision log as a compact prompt block (oldest → newest). */
export function buildDecisionLogBlock(existing: unknown): string | null {
  const list = Array.isArray(existing) ? (existing as BuildDecision[]).filter((d) => d && typeof d.req === "string") : [];
  if (list.length === 0) return null;
  const lines = list
    .slice(-10)
    .map((d) => `- ${d.at?.slice(0, 10) ?? ""} · "${d.req.slice(0, 120)}" (${d.files} file${d.files === 1 ? "" : "s"})`);
  return [
    "---",
    "# Recent Build Decisions (project memory)",
    "",
    "Changes the user already asked for — do not undo them unless explicitly told:",
    ...lines,
    "---",
  ].join("\n");
}
