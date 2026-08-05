/**
 * WEBSITE CHROME GUARANTEE — every generated marketing/landing/storefront site
 * ships a real site header and footer, deterministically.
 *
 * WHY THIS FILE EXISTS. `WEBSITE_HEADER_CONTRACT` (website-header-contract.ts)
 * told the model, in detail, to build `src/components/layout/Header.tsx` and
 * mount it in the root layout. Nothing ever checked that it did. A real build —
 * "a landing page for a coffee shop called BrewHaus" — shipped 14 files:
 * Hero.tsx, Menu.tsx, ContactForm.tsx and the config scaffold. No Header, no
 * Footer, no <nav> anywhere in the rendered document. It passed every gate:
 * `validateGeneratedFiles` only checks correctness (imports resolve, config
 * present) and `assessGenerationQuality` only checks volume (file count,
 * component count, page richness). A page can satisfy all of them and still be
 * a naked hero with no site chrome, which is what users saw.
 *
 * Instructions are probabilistic; this is not. Two layers, in order:
 *
 *   1. `assessWebsiteChrome()` returns an error-severity issue so the existing
 *      auto-fix round asks the model to write the chrome itself — model-authored
 *      chrome matches the site's palette and copy, so it is always preferred.
 *   2. `ensureWebsiteChrome()` runs after that round and synthesises the files
 *      only if they are STILL missing, so "no header" stops being a possible
 *      outcome rather than a less likely one.
 *
 * Scope is deliberately narrow — it runs on BUILD turns only (never on a chat
 * edit, so "remove the header" stays removed), and never on admin/ERP/POS/CRM
 * shells, which use a sidebar instead of marketing chrome.
 */

import {
  SITE_FOOTER_PATH,
  SITE_HEADER_PATH,
  deriveBrand,
  siteFooterSource as footerSource,
  siteHeaderSource as headerSource,
} from "../templates/site-chrome.ts";

export interface ChromeFile {
  path: string;
  content: string;
  language: string;
}

export interface ChromeIssue {
  type: string;
  file?: string;
  message: string;
  severity: "error" | "warning";
}

export interface EnsureChromeOptions {
  /** BuildIntent.appType. Admin-shell types are skipped entirely. */
  appType?: string;
  /** Brand/product name for the generated chrome copy. */
  brand?: string;
}

/** App types that use a sidebar shell, not marketing header/footer chrome. */
const APP_SHELL_TYPES = new Set(["admin-dashboard", "erp", "pos", "crm"]);

const norm = (p: string): string => p.replace(/\\/g, "/");

/** A component file that IS the site header / footer. */
const HEADER_FILE_RE =
  /(^|\/)(header|navbar|nav-?bar|site-?header|top-?bar|top-?nav)\.(tsx|jsx)$/i;
const FOOTER_FILE_RE = /(^|\/)(footer|site-?footer)\.(tsx|jsx)$/i;

/** Files that can legitimately render the chrome inline instead of importing it. */
const SHELL_OR_PAGE_RE =
  /^(src\/routes\/.+|src\/pages\/.+|src\/App|app\/layout|app\/page|app\/.+\/page)\.(tsx|jsx)$/i;

/** A dedicated sidebar/app-shell component — the mark of an admin layout. */
const APP_SHELL_PATH_RE = /(^|\/)(sidebar|side-?nav|app-?shell)\.(tsx|jsx)$/i;

function isTanStackStart(files: ChromeFile[]): boolean {
  return files.some((f) => /^src\/routes\/__root\.(tsx|jsx)$/.test(norm(f.path)));
}

function findRootShell(files: ChromeFile[]): ChromeFile | undefined {
  return files.find((f) => /^src\/routes\/__root\.(tsx|jsx)$/.test(norm(f.path)));
}

function findAppShell(files: ChromeFile[]): ChromeFile | undefined {
  return files.find((f) => /^src\/App\.(tsx|jsx)$/.test(norm(f.path)));
}

/** Merge existing project files with this turn's output; later wins. */
function effective(files: ChromeFile[], existing: ChromeFile[]): ChromeFile[] {
  const byPath = new Map<string, ChromeFile>();
  // `content` is NOT NULL in the type but IS nullable in `project_files`, and
  // callers hand us rows straight from that table. Normalise once, here, rather
  // than making every predicate below defensive.
  const put = (f: ChromeFile) =>
    byPath.set(norm(f.path), { ...f, content: f.content ?? "" });
  for (const f of existing) put(f);
  for (const f of files) put(f);
  return [...byPath.values()];
}

/**
 * Chrome counts as present only when something RENDERS it.
 *
 * The first version of these predicates returned true as soon as a file named
 * `Header.tsx` existed anywhere. That was survivable while the scaffold shipped
 * no chrome. It is not survivable now that it does: `src/components/layout/
 * Header.tsx` is present in every project from birth, so a file-existence check
 * is permanently true, and the guarantee could never fire again. The exact
 * failure it stopped catching is the common one — the model rewrites
 * `__root.tsx` or `App.tsx`, drops the `<Header />` line, leaves the component
 * file behind, and the page renders with no header while every check reports
 * success.
 *
 * So: look at what the shell and the pages actually render — a literal
 * `<header>`/`<footer>` element, or a component whose name reads as site chrome.
 */
const HEADER_RENDER_RE = /<(header|Header|Navbar|NavBar|SiteHeader|TopBar|TopNav)[\s/>]/;
const FOOTER_RENDER_RE = /<(footer|Footer|SiteFooter)[\s/>]/;

function rendersChrome(all: ChromeFile[], re: RegExp): boolean {
  return all.some(
    (f) => SHELL_OR_PAGE_RE.test(norm(f.path)) && re.test(f.content ?? ""),
  );
}

export function hasSiteHeader(all: ChromeFile[]): boolean {
  return rendersChrome(all, HEADER_RENDER_RE);
}

export function hasSiteFooter(all: ChromeFile[]): boolean {
  return rendersChrome(all, FOOTER_RENDER_RE);
}

/** A chrome component file already exists — reuse it instead of overwriting. */
function hasChromeComponentFile(all: ChromeFile[], re: RegExp): boolean {
  return all.some((f) => re.test(norm(f.path)));
}

/** True when this build is a public website that owes the user header + footer. */
export function needsWebsiteChrome(
  all: ChromeFile[],
  opts: EnsureChromeOptions = {},
): boolean {
  if (opts.appType && APP_SHELL_TYPES.has(opts.appType)) return false;
  // A dedicated sidebar component means this is an app shell, not a site.
  if (all.some((f) => APP_SHELL_PATH_RE.test(norm(f.path)))) return false;
  // An `<aside>` in the ROOT SHELL is a layout sidebar. An `<aside>` anywhere
  // else is a related-posts rail, a table of contents, a filter column — a
  // normal part of a blog, docs site or storefront. Testing every file's
  // content, as this once did, silently exempted exactly the public websites
  // that most need chrome.
  const shellFile = findRootShell(all) ?? findAppShell(all);
  if (shellFile && /<aside[\s>]/i.test(shellFile.content ?? "")) return false;
  // There must be something page-shaped to hang the chrome on.
  return all.some((f) => SHELL_OR_PAGE_RE.test(norm(f.path)));
}

/**
 * Layer 1 — a validation issue the existing auto-fix loop already consumes.
 * Model-authored chrome beats synthesised chrome, so give the model the first
 * attempt; `ensureWebsiteChrome` only fires if this round did not land.
 */
export function assessWebsiteChrome(
  files: ChromeFile[],
  existingFiles: ChromeFile[] = [],
  opts: EnsureChromeOptions = {},
): ChromeIssue[] {
  const all = effective(files, existingFiles);
  if (!needsWebsiteChrome(all, opts)) return [];

  const missing: string[] = [];
  if (!hasSiteHeader(all)) missing.push("site header");
  if (!hasSiteFooter(all)) missing.push("site footer");
  if (missing.length === 0) return [];

  return [
    {
      type: "missing_site_chrome",
      message:
        `This site has no ${missing.join(" and ")}. Every public website must ship ` +
        `src/components/layout/Header.tsx (top bar with phone + email + social icons, ` +
        `then a sticky main row with the logo, the primary menu links on the same row, ` +
        `and a CTA) and src/components/layout/Footer.tsx (brand blurb, link columns, ` +
        `contact details, copyright) — and mount BOTH in the root layout so every page ` +
        `gets them. Keep all existing sections and styling exactly as they are.`,
      severity: "error",
    },
  ];
}

// ─── Synthesised chrome (layer 2 — only when the model still did not deliver) ──

/** Strip anything that would not survive being spliced into JSX text. */
function sanitizeBrand(value: string): string {
  return value.replace(/[{}<>`$\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) || "Your Brand";
}

function brandFrom(all: ChromeFile[], brand?: string): string {
  const fromName = deriveBrand(brand, "");
  if (fromName) return fromName;
  // Fall back to the document title the model already chose:
  // "BrewHaus — Coffee Shop" → "BrewHaus".
  const root = all.find((f) => /^src\/routes\/__root\.(tsx|jsx)$/.test(norm(f.path)));
  const title = root?.content?.match(/title:\s*["'`]([^"'`]+)["'`]/);
  const fromTitle = title ? title[1].split(/\s+[—–|-]\s+/)[0].trim() : "";
  // The scaffold ships `title: "LifemarkAI App"`. Reading it back would brand a
  // user's coffee shop with the platform's own name in the logo slot, the
  // footer copyright and the placeholder email address.
  if (fromTitle && !/lifemark/i.test(fromTitle)) return sanitizeBrand(fromTitle);
  return "Your Brand";
}

/** Add an import line just below the last existing import. */
function addImport(source: string, line: string): string {
  if (source.includes(line)) return source;
  const imports = [...source.matchAll(/^import\s[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm)];
  if (imports.length === 0) return `${line}\n${source}`;
  const last = imports[imports.length - 1];
  const end = (last.index ?? 0) + last[0].length;
  return `${source.slice(0, end)}\n${line}${source.slice(end)}`;
}

/**
 * Mount the chrome in the TanStack Start document shell. `__root.tsx` renders
 * `{children}` inside `<body>` exactly once, which makes this a targeted
 * replacement rather than JSX surgery. Returns null when the shape is not the
 * one we understand — a wrong edit to the document root is far worse than a
 * missing header, so we decline rather than guess.
 */
function mountInRootShell(
  source: string,
  importPrefix: string,
  need: { header: boolean; footer: boolean },
): string | null {
  const body = source.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
  if (!body) return null;
  const inner = body[2];
  // Decline only for the half we are about to add — a mounted <Footer /> must
  // not block adding the missing <Header />, which is the whole point of `need`.
  if (need.header && /<Header\s*\/>/.test(inner)) return null;
  if (need.footer && /<Footer\s*\/>/.test(inner)) return null;
  const childrenMatches = inner.match(/\{\s*children\s*\}/g);
  if (!childrenMatches || childrenMatches.length !== 1) return null;

  const before = need.header ? "<Header />\n        " : "";
  const after = need.footer ? "\n        <Footer />" : "";
  const mounted = inner.replace(
    /\{\s*children\s*\}/,
    `${before}{children}${after}`,
  );
  let out =
    source.slice(0, body.index ?? 0) +
    `<body${body[1]}>${mounted}</body>` +
    source.slice((body.index ?? 0) + body[0].length);

  if (need.header) {
    out = addImport(out, `import { Header } from "${importPrefix}components/layout/Header";`);
  }
  if (need.footer) {
    out = addImport(out, `import { Footer } from "${importPrefix}components/layout/Footer";`);
  }
  return out;
}

/**
 * Find the JSX a component returns, by balanced parens rather than by regex.
 *
 * The regex version required the file to END at the closing brace, so it only
 * ever matched `export default function App() { return ( … ); }`. Both shapes
 * this codebase actually generates —
 *
 *     const App = () => ( … );      export default App;
 *     function App() { return ( … ); }   export default App;
 *
 * — end with an `export default` line and were silently declined, which made
 * the whole Vite/SPA branch of the guarantee dead code.
 */
function findReturnedJsx(source: string): { start: number; end: number } | null {
  const opener = /(?:\breturn\s*|=>\s*)\(/g;
  let m: RegExpExecArray | null;
  while ((m = opener.exec(source)) !== null) {
    const open = m.index + m[0].length - 1; // index of the "("
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      const c = source[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          const inner = source.slice(open + 1, i).trim();
          // The first balanced group that actually contains JSX wins; an early
          // `return (someCall())` is skipped rather than mangled.
          if (inner.startsWith("<")) return { start: open + 1, end: i };
          break;
        }
      }
    }
  }
  return null;
}

/**
 * Mount the chrome in a Vite SPA's `src/App.tsx` by wrapping what it returns.
 * Declines when no JSX return can be located — a wrong edit to the app shell is
 * far worse than a missing header.
 */
function mountInAppShell(
  source: string,
  need: { header: boolean; footer: boolean },
): string | null {
  if (need.header && /<Header\s*\/>/.test(source)) return null;
  if (need.footer && /<Footer\s*\/>/.test(source)) return null;

  const span = findReturnedJsx(source);
  if (!span) return null;
  const inner = source.slice(span.start, span.end).trim();
  if (!inner.startsWith("<")) return null;

  const before = need.header ? "      <Header />\n" : "";
  const after = need.footer ? "\n      <Footer />" : "";
  const body = inner.split("\n").join("\n      ");
  const wrapped = `\n    <>\n${before}      ${body}${after}\n    </>\n  `;

  let out = source.slice(0, span.start) + wrapped + source.slice(span.end);
  if (need.header) out = addImport(out, `import { Header } from "./components/layout/Header";`);
  if (need.footer) out = addImport(out, `import { Footer } from "./components/layout/Footer";`);
  return out;
}

/**
 * Layer 2 — synthesise and mount header + footer when they are still missing.
 * No-ops for app shells, for non-website builds, and whenever the chrome is
 * already there. Mounting is all-or-nothing: if the shell cannot be edited
 * confidently, nothing is added at all (orphan components help nobody).
 */
export function ensureWebsiteChrome<T extends ChromeFile>(
  files: T[],
  existingFiles: ChromeFile[] = [],
  opts: EnsureChromeOptions = {},
): T[] {
  const all = effective(files, existingFiles);
  if (!needsWebsiteChrome(all, opts)) return files;

  // Each half is filled independently. The first cut of this function only acted
  // when BOTH were missing, on the theory that a partly-chromed site was a
  // deliberate design. A live build disproved it: the model produced Hero,
  // Features, ClassSchedule, Testimonials, Pricing, Contact and a Footer — and
  // no header at all. "Footer exists" is not evidence that the missing header
  // was intentional; it is the single most common shape of this bug.
  const need = { header: !hasSiteHeader(all), footer: !hasSiteFooter(all) };
  if (!need.header && !need.footer) return files;

  const shell = findRootShell(all);
  const appShell = findAppShell(all);
  const target = shell ?? appShell;
  if (!target) return files;

  const isTss = !!shell && isTanStackStart(all);
  // `src/routes/__root.tsx` → components live at `../components/...`.
  const mounted = isTss
    ? mountInRootShell(target.content, "../", need)
    : mountInAppShell(target.content, need);
  if (!mounted) return files;

  const brand = brandFrom(all, opts.brand);
  const out = [...files];

  const put = (path: string, content: string) => {
    const i = out.findIndex((f) => norm(f.path) === path);
    const entry = { path, content, language: "typescriptreact" } as unknown as T;
    if (i >= 0) out[i] = entry;
    else out.push(entry);
  };

  // Mount always; write the component only when there is nothing to mount. A
  // project whose Header.tsx the model styled must keep that file — the bug we
  // are fixing is the missing MOUNT, not missing markup.
  if (need.header && !hasChromeComponentFile(all, HEADER_FILE_RE)) {
    put(SITE_HEADER_PATH, headerSource(brand));
  }
  if (need.footer && !hasChromeComponentFile(all, FOOTER_FILE_RE)) {
    put(SITE_FOOTER_PATH, footerSource(brand));
  }

  const shellIndex = out.findIndex((f) => norm(f.path) === norm(target.path));
  const shellEntry = {
    path: target.path,
    content: mounted,
    language: "typescriptreact",
  } as unknown as T;
  if (shellIndex >= 0) out[shellIndex] = shellEntry;
  else out.push(shellEntry);

  return out;
}
