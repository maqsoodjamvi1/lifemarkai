/**
 * The site header and footer every generated website starts with.
 *
 * ONE source, THREE consumers, deliberately:
 *   - `tanstack-start-scaffold.ts` — ships these files in every new TanStack
 *     Start project and mounts them in `src/routes/__root.tsx`
 *   - `lovable-vite-scaffold.ts`   — same, mounted in `src/App.tsx`
 *   - `lib/ai/website-chrome.ts`   — re-synthesises them if a build ends up
 *     without chrome anyway
 *
 * Putting the chrome in the SCAFFOLD is the real fix. The guarantee in
 * website-chrome.ts is a net: it catches a build that dropped the header, but it
 * only runs after generation, so the user still watched a headerless preview
 * render first. Starting every project with a header means the very first frame
 * of the very first preview is a complete-looking site, and the model is editing
 * a header that already exists rather than being asked to remember to invent
 * one. Models are far more reliable at changing a file than at not forgetting a
 * file.
 *
 * Styling constraints these two files must keep, because they ship into projects
 * whose CSS we do not control:
 *   - Tailwind utility classes ONLY, no shadcn design tokens (`bg-background`,
 *     `text-muted-foreground`, …). The TanStack scaffold's `styles.css` is bare
 *     `@tailwind` directives with no token layer, so a token class there is a
 *     class that silently does nothing.
 *   - Explicit neutral surfaces with `dark:` variants, so the chrome reads as
 *     deliberate on a light starter page AND on the dark pages models tend to
 *     generate.
 *   - `sticky`, never `fixed` — fixed chrome needs a matching spacer on the
 *     first section, and a model editing the page later will not know that.
 *   - Only `react` and `lucide-react` imports, both in every scaffold's
 *     dependency set.
 */

export interface ChromeSourceFile {
  path: string;
  content: string;
  language: string;
}

import { type SiteArchetype, type SiteChromeSpec, siteChromeSpec } from "./site-archetype.ts";

export const SITE_HEADER_PATH = "src/components/layout/Header.tsx";
export const SITE_FOOTER_PATH = "src/components/layout/Footer.tsx";

/** Menu entries the starter chrome links to. Anchors, so they never 404. */
/** Legacy default nav; per-archetype nav now comes from SiteChromeSpec. */
const NAV_LINKS = ["Home", "About", "Services", "Contact"] as const;

/** `Rye and Salt` → `ryeandsalt`, for placeholder contact addresses. */
function slug(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]/g, "") || "hello";
}

/**
 * Pull a brand name out of whatever the project is called.
 *
 * Project names are usually the raw prompt ("A landing page for a bakery called
 * Rye and Salt"), not a name, so putting the project name straight into the logo
 * slot produces a header with a sentence where the wordmark goes. A short name
 * with no prompt-ish filler words is taken as-is; otherwise the proper noun
 * after "called" wins; otherwise the fallback.
 */
/**
 * Strip anything that cannot survive being spliced into JSX text or into the
 * backtick templates below. A project name is untrusted input — it is whatever
 * the user typed — and `deriveBrand("Todo {app}")` returning the string
 * verbatim put `{app}` into the emitted JSX as a live expression referencing an
 * undefined variable, so the generated project failed to compile. A `<` is a
 * hard JSX parse error and a backtick or `${` escapes the template itself.
 */
function sanitize(value: string, fallback: string): string {
  const clean = value.replace(/[{}<>`$\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return clean || fallback;
}

export function deriveBrand(raw?: string | null, fallback = "Your Brand"): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  if (trimmed.length <= 32 && !/\s(a|an|the|for|with|called)\s/i.test(trimmed)) {
    return sanitize(trimmed, fallback);
  }
  // "…called Rye and Salt" → "Rye and Salt", but "…called BrewHaus with a hero
  // section" → "BrewHaus". Capitalised words extend the name; a small set of
  // connectors ("and", "of", "&") may sit between them, but any other lowercase
  // word ends it — that is where the name stops and the prompt resumes.
  const called = trimmed.match(
    /\bcalled\s+((?:[A-Z][\w&'’-]*)(?:\s+(?:and|of|the|de|la|&|[A-Z][\w&'’-]*))*)/,
  );
  if (called) {
    const name = called[1].replace(/\s+(and|of|the|de|la|&)$/i, "").trim();
    if (name) return sanitize(name, fallback);
  }
  return fallback;
}

export function siteHeaderSource(
  brand: string,
  archetype: SiteArchetype = "local-business",
): string {
  const spec = siteChromeSpec(archetype);
  const NAV_LINKS = spec.nav;
  const links = NAV_LINKS.map(
    (l) =>
      `            <a href="#${l.toLowerCase()}" className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">${l}</a>`,
  ).join("\n");
  const mobileLinks = NAV_LINKS.map(
    (l) =>
      `              <a href="#${l.toLowerCase()}" onClick={() => setOpen(false)} className="rounded-md px-2 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/5 dark:hover:text-white">${l}</a>`,
  ).join("\n");
  const mail = `hello@${slug(brand)}.com`;
  // A phone/email/social strip belongs on a site people call. On a product,
  // storefront or editorial site it reads as an unedited template, so the spec
  // decides whether it exists at all rather than it being unconditional.
  // Header actions follow the spec: a product site signs people in and starts
  // them, a storefront opens an account, a local business asks for a call.
  const secondary = spec.secondaryCta
    ? `          <a href="${spec.secondaryCta.href}" className="hidden text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white md:inline-flex">${spec.secondaryCta.label}</a>\n`
    : "";
  const primary = spec.cta
    ? `          <a
            href="${spec.cta.href}"
            className="hidden rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 md:inline-flex"
          >
            ${spec.cta.label}
          </a>`
    : "";
  const headerActions = `${secondary}${primary}`.replace(/\n$/, "");
  const topBar = spec.contactTopBar
    ? `      <div className="hidden border-b border-neutral-200 bg-neutral-50 dark:border-white/5 dark:bg-white/[0.03] md:block">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-4 text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-4">
            <a href="tel:+15550143927" className="flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              (555) 014-3927
            </a>
            <a href="mailto:\${mail}" className="flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              \${mail}
            </a>
          </div>
          <div className="flex items-center gap-3">
            <a href="#" aria-label="Facebook" className="hover:text-neutral-900 dark:hover:text-white"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Instagram" className="hover:text-neutral-900 dark:hover:text-white"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="LinkedIn" className="hover:text-neutral-900 dark:hover:text-white"><Linkedin className="h-4 w-4" /></a>
          </div>
        </div>
      </div>

`
    : "";

  return `import { useState } from "react";
import { Facebook, Instagram, Linkedin, Mail, Menu as MenuIcon, Phone, X } from "lucide-react";

/**
 * Site header — a compact top bar (contact + social) above a sticky main row
 * (logo, menu links, CTA). Sticky rather than fixed, so every section below
 * keeps normal document flow and needs no spacer.
 */
export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-neutral-950/85">
${topBar}      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <a href="#home" className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
          ${brand}
        </a>

        <nav className="hidden items-center gap-7 md:flex">
${links}
        </nav>

        <div className="flex items-center gap-2">
${headerActions}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-md p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/5 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-neutral-200 dark:border-white/10 md:hidden">
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

export function siteFooterSource(
  brand: string,
  archetype: SiteArchetype = "local-business",
): string {
  const spec = siteChromeSpec(archetype);
  const mail = `hello@${slug(brand)}.com`;
  const linkItem = (label: string) =>
    `            <li><a href="#${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}" className="hover:text-neutral-900 dark:hover:text-white">${label}</a></li>`;
  // Columns and the contact block come from the archetype spec, so the footer
  // the injector writes matches the contract the model was given.
  const columns = spec.footerColumns
    .map(
      (col) => `        <div>
          <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">${col.heading}</p>
          <ul className="space-y-2 text-sm">
${col.links.map(linkItem).join("\n")}
          </ul>
        </div>`,
    )
    .join("\n\n");
  const contactColumn = spec.footerContact
    ? `        <div>
          <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">Get in touch</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              128 Harbour Lane, Portland, OR
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <a href="tel:+15550143927" className="hover:text-neutral-900 dark:hover:text-white">(555) 014-3927</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              <a href="mailto:${mail}" className="hover:text-neutral-900 dark:hover:text-white">${mail}</a>
            </li>
          </ul>
        </div>`
    : `        <div>
          <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">Contact</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              <a href="mailto:${mail}" className="hover:text-neutral-900 dark:hover:text-white">${mail}</a>
            </li>
          </ul>
        </div>`;
  const icons = spec.footerContact ? "Facebook, Instagram, Linkedin, Mail, MapPin, Phone" : "Facebook, Instagram, Linkedin, Mail";

  return `import { ${icons} } from "lucide-react";

/** Site footer — brand blurb, link columns, contact details, copyright. */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-400">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">${brand}</p>
          <p className="text-sm leading-relaxed">
            Built for people who care about the details. Come say hello — we are
            open seven days a week.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a href="#" aria-label="Facebook" className="hover:text-neutral-900 dark:hover:text-white"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Instagram" className="hover:text-neutral-900 dark:hover:text-white"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="LinkedIn" className="hover:text-neutral-900 dark:hover:text-white"><Linkedin className="h-4 w-4" /></a>
          </div>
        </div>

${columns}

${contactColumn}
      </div>

      <div className="border-t border-neutral-200 dark:border-white/10">
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

/** Header, footer, and the route-aware shell that decides where they show. */
export function siteChromeFiles(
  brand: string,
  framework: ChromeFramework,
): ChromeSourceFile[] {
  return [
    { path: SITE_HEADER_PATH, language: "typescriptreact", content: siteHeaderSource(brand) },
    { path: SITE_FOOTER_PATH, language: "typescriptreact", content: siteFooterSource(brand) },
    {
      path: SITE_CHROME_PATH,
      language: "typescriptreact",
      content: siteChromeShellSource(framework),
    },
  ];
}
/**
 * ── Public website + admin app, in one project ───────────────────────────────
 *
 * The product standard is that a generated business app has TWO surfaces: a
 * public website at `/` and an internal admin area under `/admin/*`. Before
 * this existed the chrome was mounted globally — `<Header />` wrapped
 * `<Routes>` in the Vite scaffold and sat in `<body>` in the TanStack root — so
 * the two surfaces could not differ. That left exactly two outcomes, both wrong:
 *
 *   1. The chrome stays, and an ERP admin panel renders a "Your Brand" bar with
 *      Home/About/Services/Contact links and a marketing footer carrying a
 *      placeholder street address, wrapped around its own sidebar. (Observed.)
 *   2. The model follows the old APP_SHELL_CONTRACT instruction to delete the
 *      chrome outright, and the project loses its public website entirely.
 *
 * `SiteChrome` makes the mount point route-aware instead. It renders the header
 * and footer on public routes and nothing at all under an admin prefix, so one
 * app serves both surfaces and neither instruction is needed.
 *
 * Unlike Header/Footer this file is emitted per-framework, because reading the
 * current path is the one thing the two routers do not share. That is also why
 * it may import from the project's router — the "react and lucide-react only"
 * rule above applies to the chrome components that ship into unknown dependency
 * sets, not to this shell, whose router is fixed by the scaffold emitting it.
 */

/**
 * Path prefixes that belong to an internal app shell rather than the public
 * site. `/admin` is the documented convention in APP_SHELL_CONTRACT; the others
 * are the aliases models reach for unprompted, and treating them as admin costs
 * nothing — a public marketing site has no reason to own `/dashboard`.
 */
export const ADMIN_PATH_PREFIXES = ["/admin", "/app", "/dashboard", "/portal"] as const;

export const SITE_CHROME_PATH = "src/components/layout/SiteChrome.tsx";

export type ChromeFramework = "react-router" | "tanstack-start";

/** True when a pathname belongs to the admin shell and must not get chrome. */
export function isAdminPath(pathname: string): boolean {
  const clean = (pathname || "/").split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  return ADMIN_PATH_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`));
}

/** The shared body of the emitted component, minus the router-specific bits. */
function chromeShellBody(pathnameExpr: string): string {
  return `const ADMIN_PREFIXES = ${JSON.stringify([...ADMIN_PATH_PREFIXES])};

/** Admin screens render inside their own AppLayout — never the site chrome. */
function isAdminPath(pathname: string): boolean {
  const clean = (pathname || "/").split("?")[0].split("#")[0].replace(/\\/+$/, "") || "/";
  return ADMIN_PREFIXES.some((p) => clean === p || clean.startsWith(p + "/"));
}

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = ${pathnameExpr};
  if (isAdminPath(pathname)) return <>{children}</>;
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}

export default SiteChrome;
`;
}

/**
 * Source for `src/components/layout/SiteChrome.tsx`.
 *
 * Wrap the app's routes in this instead of mounting Header/Footer directly, so
 * the public site keeps its chrome and `/admin/*` renders clean.
 */
export function siteChromeShellSource(framework: ChromeFramework): string {
  if (framework === "tanstack-start") {
    return `import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Header } from "./Header";
import { Footer } from "./Footer";

${chromeShellBody('useRouterState({ select: (s) => s.location.pathname })')}`;
  }
  return `import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";

${chromeShellBody("useLocation().pathname")}`;
}
