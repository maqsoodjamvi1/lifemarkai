/**
 * Decision memory + proactive gap analysis — the two competitor weak points.
 *
 * 1. Decision memory (long-horizon consistency): after every successful build
 *    we DETERMINISTICALLY extract the project's established decisions (stack,
 *    file naming, styling approach, pages, data collections, libraries) and
 *    merge them into the project knowledge inside fenced markers. Knowledge is
 *    already injected into every prompt as "always follow these" instructions,
 *    so the 30th edit sees the same contract the 1st edit created — no extra
 *    model call, no tokens spent, nothing to hallucinate.
 *
 * 2. Proactive suggestions: a rule-based gap scan of the CURRENT files runs
 *    before each build and hands the model up to three concrete gaps (missing
 *    schemas, forms without validation, no 404, missing alt text, …) so it can
 *    volunteer "suggested next steps" instead of only answering.
 *
 * Everything here is pure and synchronous — safe to run on every turn.
 */

export interface ProjectDecisions {
  framework: string;
  styling: "tailwind" | "custom-css" | null;
  fileNaming: "kebab-case" | "PascalCase" | "mixed" | null;
  pages: string[];
  collections: string[];
  libraries: string[];
}

export const DECISIONS_START = "<!-- lifemark-decisions:start -->";
export const DECISIONS_END = "<!-- lifemark-decisions:end -->";

interface FileLike {
  path: string;
  content?: string | null;
}

const CODE_EXT_RE = /\.(html|js|jsx|ts|tsx|css)$/i;

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** Deterministically extract the app's established decisions from its files. */
export function extractDecisions(files: FileLike[], framework: string): ProjectDecisions {
  const code = files.filter((f) => CODE_EXT_RE.test(f.path));
  const allContent = code.map((f) => f.content ?? "").join("\n");

  // Styling: Tailwind (CDN or utility-class density) beats hand-written CSS.
  const tailwind =
    /cdn\.tailwindcss\.com|tailwindcss/i.test(allContent) ||
    /class(?:Name)?="[^"]*\b(?:flex|grid)\b[^"]*\b(?:p|m|px|py|mx|my|gap|text|bg)-/.test(
      allContent,
    );
  const hasCss = files.some((f) => f.path.endsWith(".css")) || /<style[\s>]/i.test(allContent);
  const styling = tailwind ? "tailwind" : hasCss ? "custom-css" : null;

  // File naming convention: majority (>=70%) of multi-word code file names.
  let kebab = 0;
  let pascal = 0;
  for (const f of code) {
    const name = baseName(f.path);
    if (name === "index.html") continue;
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+\./.test(name)) kebab++;
    else if (/^[A-Z][a-zA-Z0-9]*\./.test(name)) pascal++;
  }
  const named = kebab + pascal;
  const fileNaming =
    named === 0
      ? null
      : kebab / named >= 0.7
        ? "kebab-case"
        : pascal / named >= 0.7
          ? "PascalCase"
          : "mixed";

  // Pages: html documents (static runtime) or route files (framework apps).
  const pages = files
    .map((f) => f.path)
    .filter((p) => /\.html$/i.test(p) || /(?:^|\/)(?:routes|pages)\//.test(p))
    .slice(0, 12);

  // Data collections the app touches through LifemarkData.
  const collections = new Set<string>();
  const collRe = /LifemarkData\.(?:defineSchema|list|create|update|seed|remove)\(\s*["']([a-z0-9_-]+)["']/g;
  for (const m of allContent.matchAll(collRe)) {
    if (m[1] !== "__schema__") collections.add(m[1]);
  }

  // External libraries: CDN script tags + non-relative imports.
  const libraries = new Set<string>();
  for (const m of allContent.matchAll(/<script[^>]+src="https?:\/\/[^"]*\/(?:libs?\/)?([a-z0-9.@-]+?)(?:@[\d.]+)?(?:\.min)?\.js/gi)) {
    libraries.add(m[1]);
  }
  for (const m of allContent.matchAll(/import\s+[^"']*["']([a-zA-Z@][^"'./][^"']*)["']/g)) {
    libraries.add(m[1].split("/").slice(0, m[1].startsWith("@") ? 2 : 1).join("/"));
  }

  return {
    framework,
    styling,
    fileNaming,
    pages,
    collections: Array.from(collections).sort().slice(0, 20),
    libraries: Array.from(libraries).sort().slice(0, 10),
  };
}

/** Render the decisions as the auto-maintained knowledge section. */
export function renderDecisionsBlock(d: ProjectDecisions): string {
  const lines: string[] = [
    DECISIONS_START,
    "## Established decisions (auto-maintained — follow unless the user asks to change them)",
    `- Stack: ${d.framework}`,
  ];
  if (d.styling) lines.push(`- Styling: ${d.styling} (keep using it; do not introduce a second styling system)`);
  if (d.fileNaming && d.fileNaming !== "mixed") {
    lines.push(`- File naming: ${d.fileNaming} (name every new file this way)`);
  }
  if (d.pages.length) lines.push(`- Pages: ${d.pages.join(", ")}`);
  if (d.collections.length) {
    lines.push(
      `- Data collections (LifemarkData): ${d.collections.join(", ")} — reuse these exact names; check lifemark-data.d.ts before reading/writing them`,
    );
  }
  if (d.libraries.length) lines.push(`- Libraries in use: ${d.libraries.join(", ")} (prefer these over adding new ones)`);
  lines.push(DECISIONS_END);
  return lines.join("\n");
}

/**
 * Merge the decisions block into project knowledge, replacing any previous
 * auto-maintained section and preserving the user's own instructions.
 */
export function mergeDecisionsIntoKnowledge(
  knowledge: string | null | undefined,
  block: string,
): string {
  const existing = (knowledge ?? "").trim();
  const start = existing.indexOf(DECISIONS_START);
  const end = existing.indexOf(DECISIONS_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start).trimEnd();
    const after = existing.slice(end + DECISIONS_END.length).trimStart();
    return [before, block, after].filter(Boolean).join("\n\n");
  }
  return existing ? `${existing}\n\n${block}` : block;
}

// ── Proactive gap analysis ───────────────────────────────────────────────────

/** Rule-based scan of the current app for concrete, suggestible gaps (max 3). */
export function detectAppGaps(files: FileLike[]): string[] {
  const gaps: string[] = [];
  const code = files.filter((f) => CODE_EXT_RE.test(f.path));
  const allContent = code.map((f) => f.content ?? "").join("\n");
  if (!allContent.trim()) return gaps;

  // 1. Collections used without a declared schema — highest value.
  const used = new Set<string>();
  for (const m of allContent.matchAll(/LifemarkData\.(?:list|create|update|seed|remove)\(\s*["']([a-z0-9_-]+)["']/g)) {
    if (m[1] !== "__schema__") used.add(m[1]);
  }
  const declared = new Set<string>();
  for (const m of allContent.matchAll(/LifemarkData\.defineSchema\(\s*["']([a-z0-9_-]+)["']/g)) {
    declared.add(m[1]);
  }
  const undeclared = Array.from(used).filter((c) => !declared.has(c)).sort();
  if (undeclared.length) {
    gaps.push(`Collections without a declared schema: ${undeclared.join(", ")} — add LifemarkData.defineSchema for them`);
  }

  // 2. Forms without any validation.
  const hasForm = /<form[\s>]|onSubmit/i.test(allContent);
  const hasValidation = /\brequired\b|pattern=|minlength|min=|checkValidity/i.test(allContent);
  if (hasForm && !hasValidation) {
    gaps.push("Forms have no input validation (required fields, formats)");
  }

  // 3. Images without alt text.
  if (/<img(?![^>]*\balt=)[^>]*>/i.test(allContent)) {
    gaps.push("Some images are missing alt text (accessibility + SEO)");
  }

  // 4. Multi-page app without a 404 / not-found page.
  const htmlPages = files.filter((f) => /\.html$/i.test(f.path));
  if (htmlPages.length > 2 && !files.some((f) => /404|not-?found/i.test(f.path))) {
    gaps.push("No 404 / not-found page");
  }

  // 5. Missing page title or meta description on the main document.
  const index = files.find((f) => baseName(f.path) === "index.html");
  if (index?.content && (!/<title>[^<]+<\/title>/i.test(index.content) || !/meta\s+name="description"/i.test(index.content))) {
    gaps.push("index.html is missing a <title> and/or meta description (SEO basics)");
  }

  return gaps.slice(0, 3);
}

/** Prompt block handing the detected gaps to the builder model. */
export function nextStepsPromptBlock(gaps: string[]): string {
  if (gaps.length === 0) return "";
  return `\n\n---\n# Known gaps in the current app (auto-detected)\n${gaps
    .map((g) => `- ${g}`)
    .join(
      "\n",
    )}\nIf the user's request touches these, fix them as part of the work. Otherwise END your summary with a short "Suggested next steps:" list naming up to 2 of them — proactively, even though the user did not ask.\n---`;
}
