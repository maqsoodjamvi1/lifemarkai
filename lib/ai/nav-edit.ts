/**
 * Helpers for header / nav / menu surgical edits.
 * Prevents the model from inventing paths like "header.html" and returning {"patches":[]}.
 */

export type ProjectFileLike = { path: string; content: string };

const NAV_PATH_RE =
  /(^|\/)(header|navbar|nav|topbar|menubar|site-header|app-header|main-nav)(\.[jt]sx?|\.vue|\.svelte|\.html)?$/i;

const ENTRY_PATH_RE =
  /(^|\/)(app|main|layout|root-layout|index)(\.[jt]sx?|\.html)?$/i;

/** True when the user is asking to change header/nav/menu chrome. */
export function isMenuNavEditIntent(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false;
  if (/\b(menu|nav|navbar|header|menubar|topbar)\b/i.test(p) &&
      /\b(add|insert|include|put|update|change|fix|remove|rename|new)\b/i.test(p)) {
    return true;
  }
  if (/\b(add|insert|include|put)\b.+\b(item|link|button)\b.+\b(header|nav|menu)\b/i.test(p)) {
    return true;
  }
  if (/\b(header|nav|menu).+\b(item|link|button)s?\b/i.test(p) &&
      /\b(add|insert|include|put|update|change)\b/i.test(p)) {
    return true;
  }
  return false;
}

function scoreNavFile(file: ProjectFileLike): number {
  const path = file.path.replace(/\\/g, "/");
  const content = file.content ?? "";
  let score = 0;
  if (NAV_PATH_RE.test(path)) score += 100;
  if (/\/layout\//i.test(path) && /(header|nav|footer)/i.test(path)) score += 80;
  if (ENTRY_PATH_RE.test(path)) score += 40;
  if (/<(header|nav)\b/i.test(content)) score += 50;
  if (/\b(navItems|menuItems|NAV_LINKS|navigation|Navbar|Header)\b/.test(content)) score += 45;
  if (/\b(SHOP_QUICK_LINKS|MOCK_CATEGORIES|featuredCategories|categoryLinks)\b/.test(content)) score += 40;
  if (/href=["'][^"']+["']/.test(content) && /<(a|Link)\b/.test(content)) score += 20;
  if (/^\s*export\s+\{[\s\S]{0,220}\}\s+from\s+["'][^"']+["'];?\s*(?:\n\s*export\s+\{[\s\S]{0,220}\}\s+from\s+["'][^"']+["'];?\s*)*$/i.test(content)) {
    score -= 90;
  }
  if (content.length > 40_000) score -= 20;
  return score;
}

/** Rank project files that likely own the visible header/nav. */
export function findNavSourceFiles(
  files: ProjectFileLike[],
  limit = 4,
): ProjectFileLike[] {
  return [...files]
    .map((f) => ({ file: f, score: scoreNavFile(f) }))
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.file);
}

/** Build an explicit NAV CONTEXT block for the patch system/user prompt. */
export function buildNavEditContext(
  files: ProjectFileLike[],
  prompt: string,
  maxChars = 24_000,
): string {
  if (!isMenuNavEditIntent(prompt)) return "";
  const navFiles = findNavSourceFiles(files);
  if (navFiles.length === 0) {
    return `\n\n---\n# NAV EDIT TARGETS\nNo dedicated Header/Navbar file was found. Look for an inline <header>/<nav> in App.tsx, layout, or index files from the codebase overview and patch THAT existing file. Never invent paths like header.html.\n---`;
  }

  const allowed = navFiles.map((f) => f.path).join(", ");
  let budget = maxChars;
  const sections: string[] = [];
  for (const f of navFiles) {
    const body = f.content.length > budget
      ? f.content.slice(0, Math.max(800, budget - 100)) + "\n// ... (truncated)"
      : f.content;
    const section = `### ${f.path}\n\`\`\`\n${body}\n\`\`\``;
    if (section.length > budget) break;
    sections.push(section);
    budget -= section.length;
  }

  return `\n\n---\n# NAV EDIT TARGETS (mandatory)
The user wants a header/nav/menu change.
You MUST patch one or more of these existing files only: ${allowed}
Do NOT invent new paths (no header.html, no fake Navbar.tsx unless it already exists above).
Do NOT return {"patches":[]} — emit at least one find/replace against the real link list / menu array / <nav> JSX.
Copy "find" VERBATIM from the file contents below.

${sections.join("\n\n")}
---`;
}

/**
 * If the model invents a missing path for a menu edit, remap to the best nav file
 * when the find string actually exists there (or clear path for full rewrite).
 * Also relocates patches whose path exists but whose find string only appears
 * in another nav source file.
 */
export function remapInventedNavPatchPaths(
  patches: Array<{ path: string; find?: string | null; replace: string; description?: string }>,
  files: ProjectFileLike[],
): typeof patches {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const navFiles = findNavSourceFiles(files, 8);
  if (navFiles.length === 0) return patches;

  return patches.map((patch) => {
    const current = byPath.get(patch.path);
    if (current && (!patch.find || current.includes(patch.find) || normaliseWs(current).includes(normaliseWs(patch.find)))) {
      return patch;
    }

    if (patch.find) {
      const exact = navFiles.find((f) => f.content.includes(patch.find as string));
      if (exact) return { ...patch, path: exact.path };
      const fuzzy = navFiles.find((f) =>
        normaliseWs(f.content).includes(normaliseWs(patch.find as string)),
      );
      if (fuzzy) return { ...patch, path: fuzzy.path };
    }

    // Invented / wrong path with no find match — still pin to top nav candidate
    if (!current) return { ...patch, path: navFiles[0]!.path };
    return patch;
  });
}

function normaliseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const CSS_PATH_RE = /(^|\/)(index|globals|global|app)\.css$/i;
const FOOTER_PATH_RE = /(^|\/)(footer)(\.[jt]sx?|\.vue|\.svelte|\.html)?$/i;

/**
 * Drop patches that would wipe page CSS / footer during a header/menu edit.
 * Full App.tsx rewrites are also blocked when a surgical header find exists.
 */
export function filterUnsafeHeaderPatches(
  patches: Array<{ path: string; find?: string | null; replace: string; description?: string }>,
  prompt: string,
): typeof patches {
  if (!isMenuNavEditIntent(prompt) && !/\b(header|top\s*bar|navbar)\b/i.test(prompt)) {
    return patches;
  }

  return patches.filter((patch) => {
    const path = patch.path.replace(/\\/g, "/");
    if (CSS_PATH_RE.test(path)) return false;
    if (FOOTER_PATH_RE.test(path)) return false;
    // Full-file App rewrite during a header tweak usually nukes middle/footer.
    const isApp = /(^|\/)(app|main|layout)\.[jt]sx?$/i.test(path);
    if (isApp && (patch.find == null || patch.find === "")) return false;
    // Reject App patches that remove Footer / main / index.css imports.
    if (isApp && typeof patch.replace === "string") {
      const rep = patch.replace;
      const find = patch.find ?? "";
      if (/<Footer\b/i.test(find) && !/<Footer\b/i.test(rep)) return false;
      if (/<\/footer>/i.test(find) && !/<\/footer>/i.test(rep) && /<\/footer>/i.test(find)) return false;
      if (/index\.css|globals\.css/i.test(find) && !/index\.css|globals\.css/i.test(rep)) return false;
    }
    return true;
  });
}

/** Pull likely menu labels from a short user prompt. */
export function extractMenuLabelsFromPrompt(prompt: string): string[] {
  const quoted = [...prompt.matchAll(/["'“”]([^"'“”]{1,40})["'“”]/g)].map((m) => m[1]!.trim());
  const known = [
    "Home",
    "About",
    "About Us",
    "Services",
    "Products",
    "Shop",
    "Store",
    "Pricing",
    "Blog",
    "Contact",
    "Contact Us",
    "FAQ",
    "Docs",
    "Features",
    "Team",
    "Careers",
    "Login",
    "Sign Up",
    "Dashboard",
    "All Products",
    "Best Sellers",
    "New Arrivals",
    "Featured Picks",
    "Gift Bundles",
    "Categories",
  ];
  const found = known.filter((label) =>
    new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b`, "i").test(prompt),
  );
  const labels = [...quoted, ...found]
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l, i, arr) => arr.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i)
    .filter((l) => !/^(menu|item|items|link|links|header|nav|navbar|add|the|a|an|to|in|and)$/i.test(l));

  if (/\b(quick\s*shop|shop\s+links|category\s+links|categories|storefront|e-?commerce)\b/i.test(prompt)) {
    const commerceLabels = ["All Products", "Best Sellers", "New Arrivals", "Categories"];
    return [...labels, ...commerceLabels]
      .filter((l, i, arr) => arr.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i)
      .slice(0, 6);
  }
  if (labels.length > 0) return labels.slice(0, 6);
  // Generic "add menu items" with no names → sensible defaults
  if (isMenuNavEditIntent(prompt)) return ["About", "Services", "Contact"];
  return [];
}

function slugHref(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug || slug === "home") return "/";
  return `/${slug}`;
}

/**
 * Last-resort surgical edit: insert missing menu links into the real Header/Navbar
 * using the project's existing link markup style. Returns [] if nothing to do.
 */
export function buildDeterministicMenuPatches(
  prompt: string,
  files: ProjectFileLike[],
): Array<{ path: string; find: string; replace: string; description: string }> {
  if (!isMenuNavEditIntent(prompt)) return [];
  const labels = extractMenuLabelsFromPrompt(prompt);
  const navFiles = findNavSourceFiles(files, 4);
  if (navFiles.length === 0) return [];

  for (const file of navFiles) {
    const content = file.content;
    const visibilityPatches = buildResponsiveNavVisibilityPatches(prompt, file);
    const missing = labels.filter((label) => {
      const re = new RegExp(`>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*<`, "i");
      return !re.test(content) && !content.toLowerCase().includes(`>${label.toLowerCase()}<`);
    });
    if (missing.length === 0) {
      if (visibilityPatches.length > 0) return visibilityPatches;
      continue;
    }

    // Prefer a real nav/menu link — never clone the brand/logo Link (often first).
    const sample = pickNavLinkSample(content);
    if (!sample) {
      if (visibilityPatches.length > 0) return visibilityPatches;
      continue;
    }

    const { markup: sampleMarkup, index: sampleIndex } = sample;
    const indentMatch = content.slice(0, sampleIndex).match(/(?:^|\n)([ \t]*)$/);
    const indent = indentMatch?.[1] ?? "        ";

    const newLinks = missing
      .map((label) => cloneNavLink(sampleMarkup, label))
      .join(`\n${indent}`);

    const find = sampleMarkup;
    const replace = `${sampleMarkup}\n${indent}${newLinks}`;
    return [
      ...visibilityPatches,
      {
        path: file.path,
        find,
        replace,
        description: `Add menu items: ${missing.join(", ")}`,
      },
    ];
  }

  return [];
}

function buildResponsiveNavVisibilityPatches(
  prompt: string,
  file: ProjectFileLike,
): Array<{ path: string; find: string; replace: string; description: string }> {
  if (!/\b(header|nav|menu|dropdown|desktop|mobile|quick\s*shop|categor)/i.test(prompt)) return [];
  const content = file.content ?? "";
  if (!/<(header|nav)\b/i.test(content) && !/\b(Header|Navbar|SHOP_QUICK_LINKS|MOCK_CATEGORIES)\b/.test(content)) {
    return [];
  }

  const patches: Array<{ path: string; find: string; replace: string; description: string }> = [];
  if (content.includes("hidden lg:flex")) {
    patches.push({
      path: file.path,
      find: "hidden lg:flex",
      replace: "hidden md:flex",
      description: "Show desktop header navigation at standard editor preview widths",
    });
  }
  if (content.includes("lg:hidden")) {
    patches.push({
      path: file.path,
      find: "lg:hidden",
      replace: "md:hidden",
      description: "Keep the mobile header menu for narrow screens only",
    });
  }
  return patches;
}

/** Score how likely a Link/a is a nav item vs brand/logo/CTA. */
function scoreNavLinkCandidate(markup: string, surrounding: string): number {
  let score = 0;
  if (/<nav\b/i.test(surrounding)) score += 80;
  if (/\b(menu|navItems|nav-links|navbar)\b/i.test(surrounding)) score += 40;
  // Simple text-only children (Home, Shop) — good clone template
  if (/<(?:Link|a)\b[^>]*>\s*[^<{\n]{1,40}\s*<\/(?:Link|a)>/i.test(markup)) score += 50;
  // Nested spans / images / icons → usually logo or cart CTA
  if (/<(span|img|svg|Icon)\b/i.test(markup)) score -= 60;
  if (/\b(logo|brand|cart|bag|checkout)\b/i.test(markup)) score -= 80;
  if (/\b(emoji|🛍️|🛒)\b/u.test(markup)) score -= 80;
  // Long className flex brand rows
  if (/className=["'][^"']*flex items-center[^"']*["']/i.test(markup) && /font-bold/i.test(markup)) {
    score -= 40;
  }
  return score;
}

function pickNavLinkSample(
  content: string,
): { markup: string; index: number } | null {
  const candidates: Array<{ markup: string; index: number; score: number }> = [];
  const re = /<(Link|a)\b[^>]*>[\s\S]*?<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const markup = m[0];
    // Skip huge blocks (unlikely a single nav item)
    if (markup.length > 400) continue;
    const start = Math.max(0, (m.index ?? 0) - 200);
    const surrounding = content.slice(start, (m.index ?? 0) + markup.length + 80);
    const score = scoreNavLinkCandidate(markup, surrounding);
    candidates.push({ markup, index: m.index ?? 0, score });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  // Require a plausible nav link; don't fall back to logo/CTA
  if (best.score < 30) return null;
  return { markup: best.markup, index: best.index };
}

function cloneNavLink(sample: string, label: string): string {
  const href = slugHref(label);
  let link = sample;
  link = link.replace(/href=(["'])[^"']*\1/, `href=$1${href}$1`);
  link = link.replace(/\bto=(["'])[^"']*\1/, `to=$1${href}$1`);
  // Prefer replacing a simple text child; avoid nested logo markup
  if (/<(?:Link|a)\b[^>]*>\s*[^<{\n]+\s*<\/(?:Link|a)>/i.test(link)) {
    link = link.replace(/(<(?:Link|a)\b[^>]*>)(\s*)([^<]+)(\s*)(<\/(?:Link|a)>)/i, `$1$2${label}$4$5`);
  } else {
    link = link.replace(/(>)([^<]*)(<\/)/, `$1${label}$3`);
  }
  return link;
}
