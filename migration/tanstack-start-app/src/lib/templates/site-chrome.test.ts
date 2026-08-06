import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADMIN_PATH_PREFIXES,
  SITE_CHROME_PATH,
  isAdminPath,
  siteChromeFiles,
  siteChromeShellSource,
} from "./site-chrome.ts";
import { lovableViteScaffold } from "./lovable-vite-scaffold.ts";
import { ensureWebsiteChrome, hasSiteFooter, hasSiteHeader } from "../ai/website-chrome.ts";
import { tanstackStartScaffold } from "./tanstack-start-scaffold.ts";

const fileAt = (files: Array<{ path: string; content: string }>, path: string) => {
  const hit = files.find((f) => f.path === path);
  assert.ok(hit, `missing ${path}`);
  return hit.content;
};

test("admin paths are detected, public paths are not", () => {
  for (const p of ["/admin", "/admin/", "/admin/inventory", "/dashboard", "/app/x", "/portal"]) {
    assert.equal(isAdminPath(p), true, p);
  }
  for (const p of ["/", "/about", "/services", "/administrators", "/apps", "/dashboards", ""]) {
    assert.equal(isAdminPath(p), false, p);
  }
});

test("query strings and hashes do not defeat detection", () => {
  assert.equal(isAdminPath("/admin/orders?tab=open"), true);
  assert.equal(isAdminPath("/admin#top"), true);
});

test("each framework reads the path with its own router", () => {
  const rr = siteChromeShellSource("react-router");
  assert.match(rr, /from "react-router-dom"/);
  assert.match(rr, /useLocation\(\)\.pathname/);
  assert.equal(/@tanstack\/react-router/.test(rr), false);

  const tss = siteChromeShellSource("tanstack-start");
  assert.match(tss, /from "@tanstack\/react-router"/);
  assert.match(tss, /useRouterState/);
  assert.equal(/react-router-dom/.test(tss), false);
});

test("both variants gate the chrome behind the admin check", () => {
  for (const src of [
    siteChromeShellSource("react-router"),
    siteChromeShellSource("tanstack-start"),
  ]) {
    assert.match(src, /if \(isAdminPath\(pathname\)\) return <>\{children\}<\/>;/);
    assert.match(src, /<Header \/>/);
    assert.match(src, /<Footer \/>/);
    assert.match(src, /export default SiteChrome;/);
    for (const p of ADMIN_PATH_PREFIXES) assert.ok(src.includes(`"${p}"`), p);
  }
});

/**
 * The emitted guard is plain JS inside a template string, so it cannot be
 * type-checked. Run it and compare against the TypeScript one — a drift between
 * the two would silently give generated projects different chrome rules than
 * anything on the server reasons about.
 */
test("the emitted guard agrees with the TypeScript one", () => {
  const src = siteChromeShellSource("react-router");
  const body = src
    .slice(src.indexOf("function isAdminPath"), src.indexOf("export function SiteChrome"))
    .replace("(pathname: string): boolean", "(pathname)");
  const emitted = new Function(
    "ADMIN_PREFIXES",
    body.replace(/^function/, "return function"),
  )([...ADMIN_PATH_PREFIXES]);
  for (const p of ["/admin", "/admin/x", "/dashboard", "/", "/about", "/apps", ""]) {
    assert.equal(emitted(p), isAdminPath(p), p);
  }
});

test("siteChromeFiles ships the shell alongside header and footer", () => {
  for (const fw of ["react-router", "tanstack-start"] as const) {
    const files = siteChromeFiles("Acme", fw);
    assert.equal(files.length, 3);
    assert.ok(files.some((f) => f.path === SITE_CHROME_PATH));
  }
});

/**
 * The whole point of the change: chrome is mounted ONCE, route-aware, so an
 * admin screen and a public page can differ. If a scaffold ever goes back to
 * mounting <Header /> directly, every app-shell build silently regains the
 * marketing bar it is not supposed to have.
 */
test("the Vite scaffold mounts chrome through SiteChrome only", () => {
  const files = lovableViteScaffold("Acme ERP");
  const app = fileAt(files, "src/App.tsx");
  assert.match(app, /<SiteChrome>/);
  assert.match(app, /<\/SiteChrome>/);
  assert.equal(/<Header \/>/.test(app), false);
  assert.equal(/<Footer \/>/.test(app), false);
  assert.ok(files.some((f) => f.path === SITE_CHROME_PATH));
});

test("the TanStack scaffold mounts chrome through SiteChrome only", () => {
  const files = tanstackStartScaffold({}, "Acme ERP");
  const root = fileAt(files, "src/routes/__root.tsx");
  assert.match(root, /<SiteChrome>\{children\}<\/SiteChrome>/);
  assert.equal(/<Header \/>/.test(root), false);
  assert.equal(/<Footer \/>/.test(root), false);
  assert.ok(files.some((f) => f.path === SITE_CHROME_PATH));
});

test("both scaffolds still ship the header and footer themselves", () => {
  for (const files of [lovableViteScaffold("Acme"), tanstackStartScaffold({}, "Acme")]) {
    assert.ok(files.some((f) => f.path === "src/components/layout/Header.tsx"));
    assert.ok(files.some((f) => f.path === "src/components/layout/Footer.tsx"));
  }
});

/**
 * The two halves of the chrome system have to agree, and they silently did not.
 *
 * `website-chrome` decides whether a build is missing its header by scanning the
 * SHELL for <Header />. Moving that mount into SiteChrome removed the literal
 * from both scaffolds, and SiteChrome.tsx lives in components/layout, which
 * SHELL_OR_PAGE_RE does not scan — so every fresh project read as header-less
 * and the guarantee grafted a SECOND header into the shell, duplicating chrome
 * on public pages and making it global again, back onto /admin.
 */
test("the chrome guarantee leaves a fresh scaffold untouched", () => {
  // Pass the scaffold files straight through: ChromeFile requires `language`,
  // which they already carry, and mapping to { path, content } only threw it away.
  for (const files of [lovableViteScaffold("Acme"), tanstackStartScaffold({}, "Acme")]) {
    assert.equal(hasSiteHeader(files), true, "header should read as present");
    assert.equal(hasSiteFooter(files), true, "footer should read as present");
    // NOT needsWebsiteChrome: that answers "is this a public website that OWES
    // chrome?", which is true for a scaffold and always was. The property that
    // matters is that ensureWebsiteChrome finds nothing missing and hands the
    // input straight back.
    assert.equal(ensureWebsiteChrome(files), files, "guarantee must not modify it");
  }
});

test("a shell that drops SiteChrome is still reported as missing chrome", () => {
  const files = lovableViteScaffold("Acme");
  const app = files.find((f) => f.path === "src/App.tsx");
  assert.ok(app);
  // The failure the guarantee exists for: the model rewrites the shell and drops
  // the mount, leaving the component files behind.
  app.content = app.content.replace(/<SiteChrome>|<\/SiteChrome>/g, "");
  assert.equal(hasSiteHeader(files), false);
  assert.equal(hasSiteFooter(files), false);
  assert.notEqual(ensureWebsiteChrome(files), files, "guarantee must step in");
});
