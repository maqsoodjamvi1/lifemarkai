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

/** Markers of an admin/dashboard shell, which is exempt from this contract. */
const APP_SHELL_MARKER_RE = /<aside[\s>]|(^|\/)(sidebar|side-?nav|app-?shell)\.(tsx|jsx)$/i;

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
  for (const f of existing) byPath.set(norm(f.path), f);
  for (const f of files) byPath.set(norm(f.path), f);
  return [...byPath.values()];
}

export function hasSiteHeader(all: ChromeFile[]): boolean {
  if (all.some((f) => HEADER_FILE_RE.test(norm(f.path)))) return true;
  return all.some(
    (f) => SHELL_OR_PAGE_RE.test(norm(f.path)) && /<header[\s>]/i.test(f.content),
  );
}

export function hasSiteFooter(all: ChromeFile[]): boolean {
  if (all.some((f) => FOOTER_FILE_RE.test(norm(f.path)))) return true;
  return all.some(
    (f) => SHELL_OR_PAGE_RE.test(norm(f.path)) && /<footer[\s>]/i.test(f.content),
  );
}

/** True when this build is a public website that owes the user header + footer. */
export function needsWebsiteChrome(
  all: ChromeFile[],
  opts: EnsureChromeOptions = {},
): boolean {
  if (opts.appType && APP_SHELL_TYPES.has(opts.appType)) return false;
  // A sidebar shell anywhere in the project means this is an app, not a site.
  if (all.some((f) => APP_SHELL_MARKER_RE.test(norm(f.path)) || APP_SHELL_MARKER_RE.test(f.content))) {
    return false;
  }
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
  if (!hasSiteHeader(all)) missing.push("a site header");
  if (!hasSiteFooter(all)) missing.push("a site footer");
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

function brandFrom(all: ChromeFile[], brand?: string): string {
  if (brand && brand.trim()) {
    // Project names arrive as the original prompt ("A landing page for a coffee
    // shop called BrewHaus with..."), so prefer a trailing proper noun when the
    // string is clearly a sentence rather than a name.
    const trimmed = brand.trim();
    if (trimmed.length <= 32 && !/\s(a|an|the|for|with|called)\s/i.test(trimmed)) {
      return trimmed;
    }
    const called = trimmed.match(/\bcalled\s+([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*)?)/);
    if (called) return called[1];
  }
  const root = all.find((f) => /^src\/routes\/__root\.(tsx|jsx)$/.test(norm(f.path)));
  const title = root?.content.match(/title:\s*["'`]([^"'`]+)["'`]/);
  if (title) return title[1].split(/\s+[—–|-]\s+/)[0].trim();
  return "Studio";
}

const NAV_LINKS = ["Home", "About", "Services", "Contact"];

function headerSource(brand: string): string {
  const links = NAV_LINKS.map(
    (l) =>
      `            <a href="#${l.toLowerCase()}" className="text-sm font-medium text-neutral-200 transition-colors hover:text-white">${l}</a>`,
  ).join("\n");
  const mobileLinks = NAV_LINKS.map(
    (l) =>
      `              <a href="#${l.toLowerCase()}" onClick={() => setOpen(false)} className="rounded-md px-2 py-2 text-sm font-medium text-neutral-200 hover:bg-white/5 hover:text-white">${l}</a>`,
  ).join("\n");

  return `import { useState } from "react";
import { Facebook, Instagram, Linkedin, Mail, Menu as MenuIcon, Phone, X } from "lucide-react";

/**
 * Site header — a compact top bar (contact + social) above a sticky main row
 * (logo, menu links, CTA). Sticky rather than fixed, so the sections below keep
 * normal document flow.
 */
export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-neutral-950/80 backdrop-blur">
      <div className="hidden border-b border-white/5 bg-white/[0.03] md:block">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-4 text-xs text-neutral-400">
          <div className="flex items-center gap-4">
            <a href="tel:+15550143927" className="flex items-center gap-1.5 hover:text-white">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              (555) 014-3927
            </a>
            <a href="mailto:hello@${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}.com" className="flex items-center gap-1.5 hover:text-white">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              hello@${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}.com
            </a>
          </div>
          <div className="flex items-center gap-3">
            <a href="#" aria-label="Facebook" className="hover:text-white"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Instagram" className="hover:text-white"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="LinkedIn" className="hover:text-white"><Linkedin className="h-4 w-4" /></a>
          </div>
        </div>
      </div>

      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <a href="#" className="text-lg font-bold tracking-tight text-white">
          ${brand}
        </a>

        <nav className="hidden items-center gap-7 md:flex">
${links}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="#contact"
            className="hidden rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-200 md:inline-flex"
          >
            Get in touch
          </a>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-md p-2 text-neutral-200 hover:bg-white/5 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
${mobileLinks}
          </nav>
        </div>
      )}
    </header>
  );
}

export default Header;
`;
}

function footerSource(brand: string): string {
  return `import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone } from "lucide-react";

/** Site footer — brand blurb, link columns, contact details, copyright. */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-neutral-950 text-neutral-400">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="text-lg font-bold tracking-tight text-white">${brand}</p>
          <p className="text-sm leading-relaxed">
            Built for people who care about the details. Come say hello — we are open
            seven days a week.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a href="#" aria-label="Facebook" className="hover:text-white"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Instagram" className="hover:text-white"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="LinkedIn" className="hover:text-white"><Linkedin className="h-4 w-4" /></a>
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-white">Explore</p>
          <ul className="space-y-2 text-sm">
            <li><a href="#home" className="hover:text-white">Home</a></li>
            <li><a href="#about" className="hover:text-white">About</a></li>
            <li><a href="#services" className="hover:text-white">Services</a></li>
            <li><a href="#contact" className="hover:text-white">Contact</a></li>
          </ul>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-white">Company</p>
          <ul className="space-y-2 text-sm">
            <li><a href="#" className="hover:text-white">Careers</a></li>
            <li><a href="#" className="hover:text-white">Press</a></li>
            <li><a href="#" className="hover:text-white">Privacy</a></li>
            <li><a href="#" className="hover:text-white">Terms</a></li>
          </ul>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-white">Get in touch</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              128 Harbour Lane, Portland, OR
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <a href="tel:+15550143927" className="hover:text-white">(555) 014-3927</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              <a href="mailto:hello@${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}.com" className="hover:text-white">
                hello@${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}.com
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs sm:flex-row">
          <p>&copy; {year} ${brand}. All rights reserved.</p>
          <p>Built with LifemarkAI.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
`;
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
function mountInRootShell(source: string, importPrefix: string): string | null {
  const body = source.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
  if (!body) return null;
  const inner = body[2];
  if (/<Header\s*\/>/.test(inner)) return null;
  const childrenMatches = inner.match(/\{\s*children\s*\}/g);
  if (!childrenMatches || childrenMatches.length !== 1) return null;

  const mounted = inner.replace(
    /\{\s*children\s*\}/,
    "<Header />\n        {children}\n        <Footer />",
  );
  let out =
    source.slice(0, body.index ?? 0) +
    `<body${body[1]}>${mounted}</body>` +
    source.slice((body.index ?? 0) + body[0].length);

  out = addImport(out, `import { Header } from "${importPrefix}components/layout/Header";`);
  out = addImport(out, `import { Footer } from "${importPrefix}components/layout/Footer";`);
  return out;
}

/**
 * Mount the chrome in a Vite SPA's `src/App.tsx` by wrapping whatever it
 * returns. Only fires on the single-`return (...)` shape; anything else is
 * declined for the same reason as above.
 */
function mountInAppShell(source: string): string | null {
  if (/<Header\s*\/>/.test(source)) return null;
  // Only the unambiguous shape: one `return (` in the whole file, closing at EOF.
  if ((source.match(/\breturn\s*\(/g) ?? []).length !== 1) return null;
  const ret = source.match(/return\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*\}\s*$/);
  if (!ret) return null;
  const inner = ret[1].trim();
  if (!inner.startsWith("<")) return null;

  const wrapped = `return (\n    <>\n      <Header />\n      ${inner
    .split("\n")
    .join("\n      ")}\n      <Footer />\n    </>\n  );\n}\n`;
  let out = source.slice(0, ret.index ?? 0) + wrapped;
  out = addImport(out, `import { Header } from "./components/layout/Header";`);
  out = addImport(out, `import { Footer } from "./components/layout/Footer";`);
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
  // Act only on the total-absence case — a site with SOME chrome is the model's
  // design decision, and the `missing_site_chrome` issue above already asked it
  // to complete the set. Synthesising half a set risks fighting a real layout.
  if (hasSiteHeader(all) || hasSiteFooter(all)) return files;

  const shell = findRootShell(all);
  const appShell = findAppShell(all);
  const target = shell ?? appShell;
  if (!target) return files;

  const isTss = !!shell && isTanStackStart(all);
  // `src/routes/__root.tsx` → components live at `../components/...`.
  const mounted = isTss
    ? mountInRootShell(target.content, "../")
    : mountInAppShell(target.content);
  if (!mounted) return files;

  const brand = brandFrom(all, opts.brand);
  const out = [...files];

  const put = (path: string, content: string) => {
    const i = out.findIndex((f) => norm(f.path) === path);
    const entry = { path, content, language: "typescriptreact" } as unknown as T;
    if (i >= 0) out[i] = entry;
    else out.push(entry);
  };

  put("src/components/layout/Header.tsx", headerSource(brand));
  put("src/components/layout/Footer.tsx", footerSource(brand));

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
