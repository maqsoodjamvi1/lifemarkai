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
