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

/** Regions that own real menu labels — never page section headings outside nav. */
export function extractNavHaystack(content: string): string {
  const parts: string[] = [];
  const navBlocks = content.match(/<nav\b[\s\S]*?<\/nav>/gi) ?? [];
  parts.push(...navBlocks);

  // Desktop menu containers that aren't always <nav>
  const menuDivs = content.match(
    /<(?:div|ul)\b[^>]*(?:className|class)=["'][^"']*(?:nav|menu|links)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|ul)>/gi,
  ) ?? [];
  parts.push(...menuDivs);

  // Data-driven link arrays
  const arrayBlocks = content.match(
    /\b(?:const|let|var)\s+(?:SHOP_QUICK_LINKS|MOCK_CATEGORIES|navItems|menuItems|NAV_LINKS|NAVIGATION|navigationLinks|headerLinks)\s*=\s*\[[\s\S]*?\];/g,
  ) ?? [];
  parts.push(...arrayBlocks);

  if (parts.length > 0) return parts.join("\n");
  // Fallback: header element only (still better than whole App with <h2>About</h2>)
  const header = content.match(/<header\b[\s\S]*?<\/header>/i)?.[0];
  return header ?? "";
}

/**
 * Visible desktop nav only — excludes mobile drawers (`lg:hidden`, `md:hidden`, sheets).
 * Used to decide whether labels are "already present" for the user-visible header.
 */
export function extractDesktopNavHaystack(content: string): string {
  const parts: string[] = [];
  const navBlocks = content.match(/<nav\b[\s\S]*?<\/nav>/gi) ?? [];
  for (const block of navBlocks) {
    if (isMobileOnlyChrome(block)) continue;
    parts.push(block);
  }

  const desktopContainers = content.match(
    /<(?:div|ul)\b[^>]*(?:className|class)=["'][^"']*(?:hidden\s+(?:sm|md|lg|xl):flex|(?:sm|md|lg|xl):flex)[^"']*(?:nav|menu|links)?[^"']*["'][^>]*>[\s\S]*?<\/(?:div|ul)>/gi,
  ) ?? [];
  for (const block of desktopContainers) {
    if (isMobileOnlyChrome(block)) continue;
    if (/\b(nav|menu|links)\b/i.test(block) || /<(?:a|Link)\b/i.test(block)) {
      parts.push(block);
    }
  }

  const arrayBlocks = content.match(
    /\b(?:const|let|var)\s+(?:SHOP_QUICK_LINKS|navItems|menuItems|NAV_LINKS|NAVIGATION|navigationLinks|headerLinks)\s*=\s*\[[\s\S]*?\];/g,
  ) ?? [];
  parts.push(...arrayBlocks);

  if (parts.length > 0) return parts.join("\n");
  // Empty desktop <nav> still counts as the target region (labels absent → insert)
  const emptyDesktopNav = content.match(
    /<nav\b[^>]*(?:className|class)=["'][^"']*hidden\s+(?:sm|md|lg|xl):flex[^"']*["'][^>]*>\s*<\/nav>/i,
  );
  if (emptyDesktopNav) return emptyDesktopNav[0];
  return "";
}

function isMobileOnlyChrome(markup: string): boolean {
  const openTag = markup.slice(0, Math.min(240, markup.indexOf(">") + 1 || 240));
  // Drawer / sheet / mobile menu containers
  if (/\b(lg|md|sm|xl):hidden\b/i.test(openTag) && !/\bhidden\s+(?:sm|md|lg|xl):flex\b/i.test(openTag)) {
    return true;
  }
  if (/\b(mobile-menu|mobileNav|drawer|sheet|hamburger)\b/i.test(openTag)) return true;
  if (/\bmd:hidden\b/i.test(openTag) && /\bflex\s+flex-col\b/i.test(openTag)) return true;
  return false;
}

/** Find the best empty/thin desktop <nav> to synthesize links into. */
function findDesktopNavInsertTarget(
  content: string,
): { openTag: string; index: number; empty: boolean } | null {
  const re = /<nav\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  let best: { openTag: string; index: number; empty: boolean; score: number } | null = null;
  while ((m = re.exec(content)) !== null) {
    const openTag = m[0];
    const index = m.index ?? 0;
    if (isMobileOnlyChrome(openTag)) continue;
    const after = content.slice(index);
    const closeIdx = after.search(/<\/nav>/i);
    const inner = closeIdx > 0 ? after.slice(openTag.length, closeIdx) : "";
    const empty = !/<(?:a|Link)\b/i.test(inner);
    let score = 50;
    if (/\bhidden\s+(?:sm|md|lg|xl):flex\b/i.test(openTag)) score += 40;
    if (empty) score += 60;
    if (inner.trim().length < 40) score += 20;
    if (!best || score > best.score) {
      best = { openTag, index, empty, score };
    }
  }
  return best ? { openTag: best.openTag, index: best.index, empty: best.empty } : null;
}

export function navContainsLabel(haystack: string, label: string): boolean {
  if (!haystack) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`>\\s*${escaped}\\s*<`, "i");
  if (re.test(haystack)) return true;
  if (haystack.toLowerCase().includes(`>${label.toLowerCase()}<`)) return true;
  // Array form: { label: "About" } / { name: "About" } / "About"
  const propRe = new RegExp(
    `(?:label|name|title)\\s*:\\s*["'\`]${escaped}["'\`]|["'\`]${escaped}["'\`]\\s*,\\s*(?:href|to|path)\\s*:`,
    "i",
  );
  return propRe.test(haystack);
}

/** Prefer appending to a nav/link data array when the project uses one. */
function buildNavArrayPatches(
  file: ProjectFileLike,
  missing: string[],
): Array<{ path: string; find: string; replace: string; description: string }> {
  if (missing.length === 0) return [];
  const content = file.content ?? "";
  const arrayRe =
    /\b((?:const|let|var)\s+(?:SHOP_QUICK_LINKS|navItems|menuItems|NAV_LINKS|NAVIGATION|navigationLinks|headerLinks)\s*=\s*\[)([\s\S]*?)(\];)/;
  const m = content.match(arrayRe);
  if (!m) return [];

  const head = m[1]!;
  const body = m[2]!;
  const tail = m[3]!;
  const usesNameSlug = /name\s*:/.test(body) && /slug\s*:/.test(body);

  const entries = missing.map((label) => {
    const href = slugHref(label);
    if (usesNameSlug) {
      const slug = href.replace(/^\//, "") || "home";
      return `{ name: ${JSON.stringify(label)}, slug: ${JSON.stringify(slug)} }`;
    }
    return `{ label: ${JSON.stringify(label)}, href: ${JSON.stringify(href)} }`;
  });

  const trimmed = body.replace(/\s+$/, "");
  const needsComma = trimmed.length > 0 && !/,\s*$/.test(trimmed);
  const indent = (trimmed.match(/\n([ \t]+)\S/)?.[1] ?? "  ");
  const addition =
    (trimmed.length === 0 ? "\n" + indent : (needsComma ? "," : "") + "\n" + indent) +
    entries.join(",\n" + indent) +
    "\n";

  const find = head + body + tail;
  const replace = head + trimmed + addition + tail;
  if (find === replace) return [];
  return [
    {
      path: file.path,
      find,
      replace,
      description: `Add menu items to link array: ${missing.join(", ")}`,
    },
  ];
}

function synthesizeNavLinks(content: string, missing: string[], indent: string): string {
  const usesLink = /\bLink\b/.test(content) && /from\s+['"]react-router/.test(content);
  return missing
    .map((label) => {
      const href = slugHref(label);
      return usesLink
        ? `<Link to="${href}" className="text-sm text-muted-foreground hover:text-foreground transition-colors">${label}</Link>`
        : `<a href="${href}" className="text-sm text-muted-foreground hover:text-foreground transition-colors">${label}</a>`;
    })
    .join(`\n${indent}`);
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
  if (labels.length === 0) return [];
  const navFiles = findNavSourceFiles(files, 4);
  if (navFiles.length === 0) return [];

  for (const file of navFiles) {
    const content = file.content;
    // CRITICAL: desktop-visible nav only — mobile drawer labels must NOT skip inserts.
    const desktopHaystack = extractDesktopNavHaystack(content);
    const haystack = desktopHaystack || extractNavHaystack(content);
    const visibilityPatches = buildResponsiveNavVisibilityPatches(prompt, file);

    const missing = labels.filter((label) => !navContainsLabel(desktopHaystack || haystack, label));
    // If desktop has no labels but mobile does, still treat as missing (desktopHaystack empty/thin).
    const desktopMissing =
      desktopHaystack
        ? labels.filter((label) => !navContainsLabel(desktopHaystack, label))
        : labels;
    const toInsert = desktopMissing.length > 0 ? desktopMissing : missing;
    if (toInsert.length === 0) {
      if (visibilityPatches.length > 0) return visibilityPatches;
      continue;
    }

    // Prefer data-array append (SHOP_QUICK_LINKS / navItems) when present
    const arrayPatches = buildNavArrayPatches(file, toInsert);
    if (arrayPatches.length > 0) {
      return [...visibilityPatches, ...arrayPatches];
    }

    // 1) Prefer synthesizing into an empty/thin desktop <nav> (Volta-style empty center).
    const desktopNav = findDesktopNavInsertTarget(content);
    if (desktopNav) {
      const indent = "          ";
      const newLinks = synthesizeNavLinks(content, toInsert, indent);
      // Ensure the nav is visible at editor widths
      let openTag = desktopNav.openTag;
      let findOpen = openTag;
      if (/\bhidden\s+lg:flex\b/i.test(openTag)) {
        openTag = openTag.replace(/\bhidden\s+lg:flex\b/i, "hidden sm:flex");
      } else if (/\bhidden\s+md:flex\b/i.test(openTag)) {
        openTag = openTag.replace(/\bhidden\s+md:flex\b/i, "hidden sm:flex");
      }
      const find = findOpen;
      const replace = `${openTag}\n${indent}${newLinks}`;
      return [
        ...visibilityPatches.filter((p) => p.find !== "hidden lg:flex" && p.find !== "hidden md:flex"),
        {
          path: file.path,
          find,
          replace,
          description: `Add menu items to desktop nav: ${toInsert.join(", ")}`,
        },
      ];
    }

    // 2) Clone a desktop <nav> sample only (never mobile drawer / lg:hidden).
    const sample = pickNavLinkSample(content, { desktopOnly: true });
    if (sample) {
      const { markup: sampleMarkup, index: sampleIndex } = sample;
      const indentMatch = content.slice(0, sampleIndex).match(/(?:^|\n)([ \t]*)$/);
      const indent = indentMatch?.[1] ?? "        ";
      const newLinks = toInsert
        .map((label) => cloneNavLink(sampleMarkup, label))
        .join(`\n${indent}`);
      return [
        ...visibilityPatches,
        {
          path: file.path,
          find: sampleMarkup,
          replace: `${sampleMarkup}\n${indent}${newLinks}`,
          description: `Add menu items: ${toInsert.join(", ")}`,
        },
      ];
    }

    // 3) Logo-only header: inject a desktop <nav> after the brand / first header child.
    const headerOpen = content.match(/<header\b[^>]*>/i);
    if (headerOpen && headerOpen.index != null) {
      const indent = "        ";
      const newLinks = synthesizeNavLinks(content, toInsert, indent + "  ");
      const navBlock =
        `\n${indent}<nav className="hidden sm:flex items-center gap-6">\n${indent}  ${newLinks}\n${indent}</nav>`;
      // Prefer inserting after a brand Link/div if we can find a short one near header start
      const headerSlice = content.slice(headerOpen.index, headerOpen.index + 1200);
      const brand = headerSlice.match(
        /<(?:Link|a|div)\b[^>]*(?:className|class)=["'][^"']*(?:logo|brand|font-bold|font-semibold)[^"']*["'][^>]*>[\s\S]{0,200}?<\/(?:Link|a|div)>/i,
      );
      if (brand && brand.index != null) {
        const absIndex = headerOpen.index + brand.index;
        const find = brand[0];
        const replace = `${brand[0]}${navBlock}`;
        // ensure find is unique enough
        if (content.includes(find)) {
          return [
            ...visibilityPatches,
            {
              path: file.path,
              find,
              replace,
              description: `Create header nav with: ${toInsert.join(", ")}`,
            },
          ];
        }
      }
      const find = headerOpen[0];
      const replace = `${headerOpen[0]}${navBlock}`;
      return [
        ...visibilityPatches,
        {
          path: file.path,
          find,
          replace,
          description: `Create header nav with: ${toInsert.join(", ")}`,
        },
      ];
    }
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
  // Editor preview panes are often <768px — bump lg→sm so menu items are actually visible.
  if (content.includes("hidden lg:flex")) {
    patches.push({
      path: file.path,
      find: "hidden lg:flex",
      replace: "hidden sm:flex",
      description: "Show desktop header navigation at editor preview widths",
    });
  } else if (content.includes("hidden md:flex")) {
    patches.push({
      path: file.path,
      find: "hidden md:flex",
      replace: "hidden sm:flex",
      description: "Show desktop header navigation at editor preview widths",
    });
  }
  if (content.includes("lg:hidden")) {
    patches.push({
      path: file.path,
      find: "lg:hidden",
      replace: "sm:hidden",
      description: "Keep the mobile header menu for narrow screens only",
    });
  } else if (content.includes("md:hidden")) {
    patches.push({
      path: file.path,
      find: "md:hidden",
      replace: "sm:hidden",
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
  // Mobile drawers must not win over desktop nav
  if (isMobileOnlyChrome(surrounding)) score -= 200;
  if (/\b(lg|md|sm):hidden\b/i.test(surrounding) && !/\bhidden\s+(?:sm|md|lg):flex\b/i.test(surrounding)) {
    score -= 150;
  }
  return score;
}

function pickNavLinkSample(
  content: string,
  opts?: { desktopOnly?: boolean },
): { markup: string; index: number } | null {
  const desktopOnly = opts?.desktopOnly === true;
  const candidates: Array<{ markup: string; index: number; score: number }> = [];
  const re = /<(Link|a)\b[^>]*>[\s\S]*?<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const markup = m[0];
    // Skip huge blocks (unlikely a single nav item)
    if (markup.length > 400) continue;
    const start = Math.max(0, (m.index ?? 0) - 200);
    const surrounding = content.slice(start, (m.index ?? 0) + markup.length + 80);
    let score = scoreNavLinkCandidate(markup, surrounding);
    // Prefer desktop <nav> samples over mobile drawer links
    const before = content.slice(0, m.index ?? 0);
    const lastNavOpen = before.lastIndexOf("<nav");
    const lastNavClose = before.lastIndexOf("</nav>");
    const insideNav = lastNavOpen > lastNavClose;
    if (insideNav) {
      score += 100;
      // Check the open tag of that nav for mobile-only classes
      const navOpenMatch = content.slice(lastNavOpen, lastNavOpen + 200).match(/<nav\b[^>]*>/i);
      if (navOpenMatch && isMobileOnlyChrome(navOpenMatch[0])) {
        score -= 250;
        if (desktopOnly) continue;
      }
    } else if (desktopOnly) {
      continue; // desktop-only: require in-nav sample
    }
    if (desktopOnly && isMobileOnlyChrome(surrounding)) continue;
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
