import type { ProjectFile } from "@/types/database";

/**
 * Next.js App Router support for the srcdoc fallback preview engine
 * (build-fallback-html.ts).
 *
 * The fallback engine is a client-side SPA approximation — SSR cannot run in
 * a srcdoc iframe, so we synthesize a virtual root component that:
 *   1. builds a route table from app/**\/page.(tsx|jsx|js) files,
 *   2. wraps each page in ALL ancestor layout.* files (root layout outermost),
 *   3. routes off the engine's existing virtual hash router (__reactRouterDom).
 *
 * Everything path-related in here is a PURE function of string paths so it
 * can be port-tested without the engine.
 */

export const NEXT_VIRTUAL_ENTRY_PATH = "__next_virtual_app__.tsx";

const PAGE_RE = /(^|\/)page\.(tsx|jsx|js)$/;
const LAYOUT_EXTS = ["tsx", "jsx", "js"] as const;

export interface NextRouteEntry {
  /** Virtual route path — "/", "/about", "/blog/:slug", "/docs/:slug*" */
  route: string;
  /** Module id of the page file (full project path, with extension). */
  page: string;
  /** Ancestor layout module ids, ROOT LAYOUT FIRST (outermost). */
  layouts: string[];
}

/** Locate the App Router directory. Prefers "app" (most common in generated apps). */
export function nextAppDirName(paths: string[]): "app" | "src/app" | null {
  for (const dir of ["app", "src/app"] as const) {
    if (LAYOUT_EXTS.some((ext) => paths.includes(`${dir}/layout.${ext}`))) return dir;
  }
  return null;
}

/**
 * A project is a Next App Router project when it has a root layout at
 * app/layout.* (or src/app/layout.*) AND no classic App.tsx entry — if an
 * App.tsx exists the battle-tested App-entry path stays in charge.
 */
export function isNextAppProject(files: Pick<ProjectFile, "path">[]): boolean {
  const paths = files.map((f) => f.path);
  if (!nextAppDirName(paths)) return false;
  if (paths.some((p) => /^(src\/)?App\.(tsx|jsx)$/.test(p))) return false;
  return true;
}

/**
 * Map a page file path to its virtual route.
 *   app/page.tsx                    → "/"
 *   app/about/page.tsx              → "/about"
 *   app/blog/[slug]/page.tsx        → "/blog/:slug"
 *   app/docs/[...slug]/page.tsx     → "/docs/:slug*"   (catch-all, rest-match)
 *   app/(marketing)/pricing/page.tsx→ "/pricing"       (route groups vanish)
 *   app/@modal/photo/page.tsx       → null             (parallel slots — not navigable)
 *
 * NOTE on conventions: the engine's react-router shim only exact-matches (plus
 * a trailing "/*" wildcard) and its useParams returns {}. The synthesized
 * entry therefore ships its OWN matcher (see buildNextVirtualEntrySource)
 * that understands ":param" and ":param*" and exposes params through the
 * next/navigation shim — the react-router shim itself is untouched.
 */
export function nextRouteFromPagePath(pagePath: string, appDir: string): string | null {
  if (!pagePath.startsWith(appDir + "/")) return null;
  if (!PAGE_RE.test(pagePath)) return null;
  const parts = pagePath.slice(appDir.length + 1).split("/");
  parts.pop(); // drop "page.tsx"
  const segs: string[] = [];
  for (const part of parts) {
    if (/^\(.*\)$/.test(part)) continue; // route group — contributes no URL segment
    if (part.startsWith("@")) return null; // parallel-route slot — rendered via layout props, unsupported
    const catchAll = part.match(/^\[{1,2}\.\.\.(.+?)\]{1,2}$/); // [...x] and [[...x]]
    if (catchAll) {
      segs.push(`:${catchAll[1]}*`);
      continue;
    }
    const dyn = part.match(/^\[(.+)\]$/);
    if (dyn) {
      segs.push(`:${dyn[1]}`);
      continue;
    }
    segs.push(part);
  }
  return "/" + segs.join("/");
}

/**
 * Ancestor layout files for a page, walking the REAL directory chain (so
 * route-group folders like (marketing) contribute their layouts naturally).
 * Returns root layout first. Prefers .tsx over .jsx over .js per directory.
 */
export function layoutChainForPage(
  pagePath: string,
  allPaths: string[],
  appDir: string,
): string[] {
  const set = new Set(allPaths);
  const parts = pagePath.split("/");
  parts.pop(); // drop the file name
  const dirs: string[] = [appDir];
  let cur = appDir;
  for (let i = appDir.split("/").length; i < parts.length; i++) {
    cur += "/" + parts[i];
    dirs.push(cur);
  }
  const layouts: string[] = [];
  for (const d of dirs) {
    for (const ext of LAYOUT_EXTS) {
      const candidate = `${d}/layout.${ext}`;
      if (set.has(candidate)) {
        layouts.push(candidate);
        break;
      }
    }
  }
  return layouts;
}

/**
 * Build the full route table from project file paths. Pure — port-testable.
 * Excludes app/api/** and parallel-route slots; dedupes colliding routes
 * (first in path order wins); sorts static routes before dynamic ones so the
 * runtime matcher's tie-breaking is deterministic.
 */
export function buildNextRouteTable(paths: string[]): NextRouteEntry[] {
  const appDir = nextAppDirName(paths);
  if (!appDir) return [];
  const pagePaths = paths
    .filter((p) => p.startsWith(appDir + "/") && PAGE_RE.test(p))
    .filter((p) => !p.startsWith(appDir + "/api/"))
    .sort((a, b) => a.localeCompare(b));
  const seen = new Set<string>();
  const out: NextRouteEntry[] = [];
  for (const p of pagePaths) {
    const route = nextRouteFromPagePath(p, appDir);
    if (route == null || seen.has(route)) continue;
    seen.add(route);
    out.push({ route, page: p, layouts: layoutChainForPage(p, paths, appDir) });
  }
  const dynCount = (r: string) => (r.match(/:/g) ?? []).length;
  out.sort((a, b) => dynCount(a.route) - dynCount(b.route) || a.route.localeCompare(b.route));
  return out;
}

/** app/not-found.* rendered (inside the root layout) when no route matches. */
export function findNextNotFound(paths: string[]): NextRouteEntry | null {
  const appDir = nextAppDirName(paths);
  if (!appDir) return null;
  for (const ext of LAYOUT_EXTS) {
    const p = `${appDir}/not-found.${ext}`;
    if (paths.includes(p)) {
      return { route: "*", page: p, layouts: layoutChainForPage(p, paths, appDir) };
    }
  }
  return null;
}

/**
 * Source normalization for Next files, applied BEFORE the engine's import
 * rewriting / Babel compilation.
 *
 * Decisions (and why):
 * - `"use client"` / `"use server"` directives: stripped. A bare string
 *   statement is technically a runtime no-op, but stripping keeps the
 *   compiled module clean and immune to future directive-sensitive tooling.
 * - `export const metadata` / `export async function generateMetadata`:
 *   LEFT IN PLACE on purpose. The engine's generic export transforms already
 *   turn them into inert named exports that nothing calls — a regex that
 *   tried to DELETE them would have to balance nested braces/template
 *   strings and one miss would corrupt the file (the #1 historical failure
 *   mode in this engine). Harmless > risky.
 * - `export default async function Page()`: `async` is KEPT. Stripping
 *   `async` breaks any `await` in the body with a SyntaxError that kills the
 *   whole preview. Instead the synthesized entry detects AsyncFunction
 *   components at render time and resolves them via a useState/useEffect
 *   boundary (__NextAsyncBoundary) — awaited browser-side fetches either
 *   resolve or fail loudly to console without blanking the preview.
 * - `<html>/<body>/<head>` in app/ files (root layout renders them): swapped
 *   for `<div data-next-html|body>` / hidden div for head. A nested <html>
 *   inside #root breaks the iframe DOM; a plain block div preserves layout
 *   and keeps the layout's className (fonts, bg) applied. Tag-name-only
 *   replacement with a `(?=[\s/>])` guard so attributes (even multi-line)
 *   survive and `<header>` is never touched.
 */
export function transformNextSourceForPreview(
  src: string,
  path: string,
  appDir: string,
): string {
  let out = src;
  out = out.replace(/^\s*(['"])use (?:client|server)\1\s*;?[ \t]*$/gm, "");
  if (path === appDir || path.startsWith(appDir + "/")) {
    out = out
      .replace(/<html(?=[\s/>])/g, "<div data-next-html")
      .replace(/<\/html>/g, "</div>")
      .replace(/<body(?=[\s/>])/g, "<div data-next-body")
      .replace(/<\/body>/g, "</div>")
      .replace(/<head(?=[\s/>])/g, "<div data-next-head hidden")
      .replace(/<\/head>/g, "</div>");
  }
  return out;
}

/**
 * Generate the synthesized virtual entry module (plain JS — compiled by the
 * engine's Babel pass like any other module, registered under
 * NEXT_VIRTUAL_ENTRY_PATH). Pages/layouts are required LAZILY at render time
 * via window.__Mrequire, so entry execution order can never race their
 * registration.
 */
export function buildNextVirtualEntrySource(
  routes: NextRouteEntry[],
  notFound: NextRouteEntry | null,
): string {
  return `// ── Synthesized Next.js App Router entry (preview-only) ────────────────────
// Routes off the engine's virtual hash router; layouts wrap pages with the
// root layout outermost. Params matching is done here (the react-router shim
// only exact-matches) and exposed via window.__nextRouteParams for the
// next/navigation useParams shim.
var __NEXT_ROUTES = ${JSON.stringify(routes)};
var __NEXT_NOT_FOUND = ${JSON.stringify(notFound)};

function __searchParamsObj(search) {
  var o = {};
  try { new URLSearchParams(search || '').forEach(function(v, k) { o[k] = v; }); } catch (e) {}
  return o;
}

// Static segments score 2, params score 0 — highest score wins, so a static
// /blog/featured beats /blog/:slug. ':name*' (catch-all) grabs the rest.
function __matchNextRoute(pathname) {
  var inSegs = pathname.split('/').filter(Boolean);
  var best = null;
  for (var i = 0; i < __NEXT_ROUTES.length; i++) {
    var r = __NEXT_ROUTES[i];
    var segs = r.route === '/' ? [] : r.route.split('/').filter(Boolean);
    var last = segs.length ? segs[segs.length - 1] : '';
    var hasCatchAll = last.charAt(0) === ':' && last.slice(-1) === '*';
    if (!hasCatchAll && segs.length !== inSegs.length) continue;
    if (hasCatchAll && inSegs.length < segs.length - 1) continue;
    var params = {}; var ok = true; var score = 0;
    for (var j = 0; j < segs.length; j++) {
      var s = segs[j];
      if (s.charAt(0) === ':' && s.slice(-1) === '*') { params[s.slice(1, -1)] = inSegs.slice(j); break; }
      if (s.charAt(0) === ':') {
        try { params[s.slice(1)] = decodeURIComponent(inSegs[j] || ''); }
        catch (e) { params[s.slice(1)] = inSegs[j] || ''; }
        continue;
      }
      if (s !== inSegs[j]) { ok = false; break; }
      score += 2;
    }
    if (!ok) continue;
    if (!best || score > best.score) best = { route: r, params: params, score: score };
  }
  return best;
}

// Async server components can't be rendered directly (their body may await).
// Call the function, resolve the returned promise, render the result. Server
// components never use hooks, so a plain call is safe; sync client components
// with hooks NEVER go through here (see __renderNextComp).
function __NextAsyncBoundary(props) {
  var st = React.useState(null);
  React.useEffect(function() {
    var alive = true;
    Promise.resolve().then(function() { return props.comp(props.compProps); }).then(
      function(v) { if (alive) st[1]({ v: v }); },
      function(e) {
        console.error('[preview] async component failed — server-only code (db, fs, secrets) cannot run in the preview:', (e && e.message) || e);
        if (alive) st[1]({ v: null });
      }
    );
    return function() { alive = false; };
  }, [props.comp]);
  return st[0] ? st[0].v : null;
}

function __renderNextComp(Comp, props, children) {
  var full = children === undefined ? props : Object.assign({}, props, { children: children });
  var isAsync = false;
  try { isAsync = !!(Comp.constructor && Comp.constructor.name === 'AsyncFunction'); } catch (e) {}
  if (isAsync) return React.createElement(__NextAsyncBoundary, { comp: Comp, compProps: full });
  return React.createElement(Comp, full);
}

function __NextRouteView(props) {
  var mod = window.__Mrequire(props.entry.page);
  var Page = mod && (mod.default !== undefined ? mod.default : mod);
  var el;
  if (typeof Page === 'function') {
    // Next 14 passes params/searchParams as plain objects; Next 15 as
    // promises — 'await plainObject' resolves to itself, so both code styles work.
    el = __renderNextComp(Page, { params: props.params, searchParams: __searchParamsObj(props.search) }, undefined);
  } else {
    console.warn('[preview] page has no default export:', props.entry.page);
    el = null;
  }
  for (var i = props.entry.layouts.length - 1; i >= 0; i--) {
    var lm = window.__Mrequire(props.entry.layouts[i]);
    var L = lm && (lm.default !== undefined ? lm.default : lm);
    if (typeof L === 'function') el = __renderNextComp(L, { params: props.params }, el);
    else console.warn('[preview] layout has no default export:', props.entry.layouts[i]);
  }
  return el;
}

function __Next404(props) {
  return React.createElement('div', { style: { padding: '48px 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#64748b' } },
    React.createElement('div', { style: { fontSize: '28px', fontWeight: 700, marginBottom: '8px', color: '#334155' } }, '404'),
    'No app/ route matches "' + props.pathname + '"'
  );
}

function __NextApp() {
  var loc = window.__reactRouterDom.useLocation();
  var pathname = (loc && loc.pathname) || '/';
  var search = (loc && loc.search) || '';
  var m = __matchNextRoute(pathname);
  window.__nextRouteParams = m ? m.params : {};
  // key=pathname remounts the branch per navigation — layouts lose state
  // across routes (unlike real Next) but stale-state bugs can't leak.
  if (m) return React.createElement(__NextRouteView, { key: pathname, entry: m.route, params: m.params, search: search });
  if (__NEXT_NOT_FOUND) return React.createElement(__NextRouteView, { key: pathname, entry: __NEXT_NOT_FOUND, params: {}, search: search });
  return React.createElement(__Next404, { pathname: pathname });
}

function __NextRootApp() {
  return React.createElement(window.__reactRouterDom.BrowserRouter, null, React.createElement(__NextApp));
}

window.__Mdefine('${NEXT_VIRTUAL_ENTRY_PATH}', { default: __NextRootApp });
window.__Mdefine('__next_virtual_app__', { default: __NextRootApp });
`;
}

/**
 * Runtime shims for 'next/*' module specifiers — injected into the engine's
 * module-registry script (AFTER the __reactRouterDom IIFE, which it reuses)
 * only when the project is a Next App Router project. __Mrequire routes every
 * 'next' / 'next/*' specifier to window.__nextShims.resolve(path).
 */
export const NEXT_RUNTIME_SHIMS = `
// ── Next.js runtime shims (App Router preview) ─────────────────────────────
window.__nextShims = (function() {
  var RR = window.__reactRouterDom || {};
  // Our shim's useNavigate is hook-free (returns the module-level navigate),
  // so grabbing it once at setup time is safe.
  var navigate = (RR.useNavigate && RR.useNavigate()) || function(to) {
    try { window.location.hash = typeof to === 'string' ? to : '/'; } catch (e) {}
  };

  // next/link — anchor into the virtual hash router. External/mailto/anchor
  // hrefs render as normal links; next-only props are stripped.
  var LinkShim = React.forwardRef(function(props, ref) {
    var p = Object.assign({}, props);
    var href = p.href != null ? p.href : '/';
    var drop = ['href', 'prefetch', 'replace', 'scroll', 'shallow', 'passHref', 'legacyBehavior', 'locale'];
    for (var i = 0; i < drop.length; i++) delete p[drop[i]];
    var to = typeof href === 'string' ? href : ((href && href.pathname) || '/');
    if (href && typeof href === 'object' && href.query) {
      try { to += '?' + new URLSearchParams(href.query).toString(); } catch (e) {}
    }
    var external = /^[a-z][a-z0-9+.-]*:/i.test(to) || to.indexOf('//') === 0 || to.charAt(0) === '#';
    var userClick = p.onClick;
    if (external) {
      p.href = to;
      p.ref = ref;
      return React.createElement('a', p);
    }
    p.href = '#' + (to.charAt(0) === '/' ? to : '/' + to);
    p.onClick = function(e) {
      if (userClick) { try { userClick(e); } catch (err) {} }
      if (e && e.defaultPrevented) return;
      if (e && e.preventDefault) e.preventDefault();
      navigate(to);
    };
    p.ref = ref;
    return React.createElement('a', p);
  });

  // next/navigation — hooks proxy the virtual router. usePathname/useSearchParams
  // subscribe via the router's location context so they re-render on nav.
  var navigation = {
    __esModule: true,
    useRouter: function() {
      return {
        push: navigate,
        replace: navigate,
        back: function() { try { window.history.back(); } catch (e) {} },
        forward: function() { try { window.history.forward(); } catch (e) {} },
        refresh: function() {},
        prefetch: function() { return Promise.resolve(); },
      };
    },
    usePathname: function() { return ((RR.useLocation && RR.useLocation()) || {}).pathname || '/'; },
    useSearchParams: function() {
      var search = ((RR.useLocation && RR.useLocation()) || {}).search || '';
      try { return new URLSearchParams(search); } catch (e) { return new URLSearchParams(); }
    },
    useParams: function() {
      if (RR.useLocation) RR.useLocation(); // subscribe → re-render on nav
      return window.__nextRouteParams || {};
    },
    useSelectedLayoutSegment: function() { return null; },
    useSelectedLayoutSegments: function() { return []; },
    // Deferred a tick — redirect() is often called during render and a
    // synchronous navigate would setState mid-render.
    redirect: function(to) { setTimeout(function() { navigate(to); }, 0); },
    permanentRedirect: function(to) { setTimeout(function() { navigate(to); }, 0); },
    notFound: function() { console.warn('[preview] notFound() called — preview renders nothing for this branch.'); },
    ReadonlyURLSearchParams: window.URLSearchParams,
  };

  // next/image — plain <img>, next-only props stripped, fill → absolute stretch.
  var IMG_STRIP = ['fill', 'priority', 'quality', 'placeholder', 'blurDataURL', 'loader', 'unoptimized', 'onLoadingComplete', 'overrideSrc', 'fetchPriority'];
  var ImageShim = React.forwardRef(function(props, ref) {
    var p = Object.assign({}, props);
    var fill = !!p.fill;
    for (var i = 0; i < IMG_STRIP.length; i++) delete p[IMG_STRIP[i]];
    if (p.src && typeof p.src === 'object') p.src = p.src.src || p.src.default || '';
    if (fill) {
      p.style = Object.assign({ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }, p.style || {});
      delete p.width;
      delete p.height;
    }
    p.ref = ref;
    return React.createElement('img', p);
  });

  // next/font/google + next/font/local — every export (Inter, Roboto, default
  // localFont, …) is a function returning an inert font object.
  var fontFn = function() { return { className: '', variable: '', style: { fontFamily: 'inherit' } }; };
  var fontModule = new Proxy({ __esModule: true, default: fontFn }, {
    get: function(t, k) {
      if (k in t) return t[k];
      return typeof k === 'string' ? fontFn : undefined;
    },
  });

  var headersModule = {
    __esModule: true,
    cookies: function() {
      console.warn('[preview] next/headers cookies() stubbed — server APIs are unavailable in the preview.');
      return { get: function() { return undefined; }, getAll: function() { return []; }, has: function() { return false; }, set: function() {}, delete: function() {} };
    },
    headers: function() {
      console.warn('[preview] next/headers headers() stubbed — server APIs are unavailable in the preview.');
      return new Map();
    },
    draftMode: function() { return { isEnabled: false, enable: function() {}, disable: function() {} }; },
  };

  var serverModule = {
    __esModule: true,
    NextResponse: {
      json: function(data) { console.warn('[preview] NextResponse stubbed — route handlers do not run in the preview.'); return { __previewStub: true, data: data }; },
      redirect: function(url) { console.warn('[preview] NextResponse stubbed — route handlers do not run in the preview.'); return { __previewStub: true, url: url }; },
      next: function() { return { __previewStub: true }; },
      rewrite: function(url) { return { __previewStub: true, url: url }; },
    },
    NextRequest: function NextRequest() {},
    userAgent: function() { return { isBot: false }; },
  };

  // next/dynamic — resolve the loader if it works in-browser, else warn + null.
  function dynamicShim(loader, opts) {
    return function DynamicPreview(props) {
      var st = React.useState(null);
      React.useEffect(function() {
        var alive = true;
        try {
          var r = typeof loader === 'function' ? loader() : loader;
          if (r && typeof r.then === 'function') {
            r.then(
              function(m) { if (alive) st[1]({ c: m && (m.default !== undefined ? m.default : m) }); },
              function(e) { console.warn('[preview] next/dynamic loader failed:', (e && e.message) || e); }
            );
          } else if (r) {
            st[1]({ c: r.default !== undefined ? r.default : r });
          }
        } catch (e) { console.warn('[preview] next/dynamic failed:', (e && e.message) || e); }
        return function() { alive = false; };
      }, []);
      if (st[0] && typeof st[0].c === 'function') return React.createElement(st[0].c, props);
      if (opts && typeof opts.loading === 'function') return React.createElement(opts.loading, {});
      return null;
    };
  }

  function nullComponentModule(path) {
    console.warn('[preview] Unsupported Next.js module stubbed as a null component:', path);
    return { __esModule: true, default: function() { return null; } };
  }

  function resolve(path) {
    if (path === 'next/link') return { __esModule: true, default: LinkShim };
    if (path === 'next/navigation') return navigation;
    if (path === 'next/router') return { __esModule: true, useRouter: navigation.useRouter, default: { push: navigate, replace: navigate } };
    if (path === 'next/image' || path === 'next/legacy/image') return { __esModule: true, default: ImageShim, Image: ImageShim };
    if (path.indexOf('next/font') === 0) return fontModule;
    if (path === 'next/headers') return headersModule;
    if (path === 'next/server') return serverModule;
    if (path === 'next/dynamic') return { __esModule: true, default: dynamicShim };
    if (path === 'next/head') return { __esModule: true, default: function() { return null; } };
    if (path === 'next/script') return { __esModule: true, default: function() { return null; } };
    return nullComponentModule(path);
  }

  return { resolve: resolve };
})();
`;
