import type { ProjectFile } from "../../types/database.ts";
import { ensureCommonGeneratedSupportFiles } from "../ai/generated-support-files.ts";
import { generateFallbackUtilityCss } from "./generate-fallback-utilities.ts";
import { healPreviewContractGaps } from "./heal-preview-contract.ts";
import {
isNextAppProject,
nextAppDirName,
buildNextRouteTable,
findNextNotFound,
buildNextVirtualEntrySource,
transformNextSourceForPreview,
NEXT_RUNTIME_SHIMS,
NEXT_VIRTUAL_ENTRY_PATH,
} from "@/lib/preview/next-app-preview";
import { PREVIEW_PERF_SCRIPT } from "./preview-perf-bridge.ts";

/** Bump when preview transform logic changes — forces iframe remount in editor. */
export const PREVIEW_ENGINE_REV = "46";

/** Strip PostCSS-only directives — invalid in a raw <style> tag. */
export function sanitizePreviewCss(css: string): string {
  return css
    .replace(/@tailwind\s+[^;]+;/g, "")
    .replace(/@import\s+["'][^"']*tailwindcss[^"']*["']\s*;?/gi, "")
    .replace(/@apply\s+[^;]+;/g, "")
    .trim();
}

/**
 * Rewrite `expr.charAt(` so a missing/undefined receiver cannot white-screen
 * the preview (`Cannot read properties of undefined (reading 'charAt')`).
 */
export function hardenCharAtCalls(src: string): string {
  // Already wrapped — leave alone
  if (!src.includes(".charAt(")) return src;

  let out = src;
  // (…expr…).charAt(
  out = out.replace(
    /\(([^()\n]+)\)\.charAt\s*\(/g,
    (full, expr: string) => {
      if (/^\s*String\s*\(/.test(expr)) return full;
      return `String((${expr}) ?? "").charAt(`;
    },
  );
  // foo.bar.baz.charAt(  /  foo?.bar.charAt( — skip if already String((
  out = out.replace(
    /(?<![\w$])([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)+)\.charAt\s*\(/g,
    'String(($1) ?? "").charAt(',
  );
  // bareIdent.charAt( — not after String(
  out = out.replace(
    /(?<![\w$])([A-Za-z_$][\w$]*)\.charAt\s*\(/g,
    (full, id: string, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 16), offset);
      if (/String\s*\(\s*\(?\s*$/.test(before)) return full;
      if (id === "String") return full;
      return `String((${id}) ?? "").charAt(`;
    },
  );
  return out;
}

export function projectUsesTailwindV4(files: ProjectFile[]): boolean {
  return files.some(
    (f) =>
      f.path.endsWith(".css") &&
      /@import\s+["']tailwindcss/.test(f.content ?? ""),
  );
}

export function projectUsesTailwind(files: ProjectFile[]): boolean {
  if (projectUsesTailwindV4(files)) return true;
  if (files.some((f) => /tailwind\.config/i.test(f.path))) return true;
  if (
    files.some(
      (f) =>
        f.path.endsWith(".css") &&
        /(@tailwind|--background|@layer)/.test(f.content ?? ""),
    )
  ) {
    return true;
  }
  return files.some(
    (f) =>
      /\.(tsx|jsx)$/.test(f.path) &&
      /className=["'][^"']*(?:flex|grid|bg-|text-|p-|m-|gap-|rounded|min-h-|max-w-)/.test(
        f.content ?? "",
      ),
  );
}

export function preparePreviewCss(
  css: string,
  usesV4: boolean,
  usesTailwind: boolean,
): string {
  if (usesV4) return css.replace(/@tailwind\s+[^;]+;/g, "").trim();
  if (usesTailwind) return sanitizePreviewCss(css);
  return css;
}

const SHADCN_TAILWIND_CDN_CONFIG = `window.tailwind = window.tailwind || {};
tailwind.config = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
};`;

export function buildFallbackHtml(files: ProjectFile[]): string {
  // Heal missing imports/exports first (so Navbar→Header aliases win), then
  // fill remaining UI support stubs.
  files = ensureCommonGeneratedSupportFiles(healPreviewContractGaps(files));
  // Static HTML project — serve as-is
  const indexHtml = files.find(
    (f) => f.path === "index.html" || f.path === "/index.html"
  );
  // A plain `<script type="module" src="app.js">` is completely normal in a
  // vanilla HTML/CSS/JS app — native ES modules are how such apps avoid
  // global-scope collisions, with no framework involved at all. The old check
  // treated ANY type="module" script as proof this was a Vite/React-style
  // bundler entry and routed it into the JSX-bundling pipeline below, which
  // synthesizes a React bootstrap HTML template (always containing its own
  // `<div id="root"></div>`) and tries to render `mainFile`'s default export
  // into it. A vanilla app has no App.tsx and exports no React component, so
  // nothing ever mounts — #root stays empty and the app is reported as a
  // blank page, even though the real index.html/app.js pair works fine.
  // Only route to the bundler when the entry script actually looks like a
  // bundler entry point (main/index.{tsx,jsx,ts} — Vite's own convention —
  // or an explicit src/main.tsx reference).
  const scriptSrcs = Array.from(
    indexHtml?.content?.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi) ?? []
  ).map((m) => m[1]);
  const looksLikeBundlerEntry =
    !!indexHtml?.content?.includes("src/main.tsx") ||
    scriptSrcs.some((src) => /\/(main|index)\.(tsx|jsx|ts)(\?|$)/i.test(src));
  if (indexHtml?.content && !looksLikeBundlerEntry) {
    return indexHtml.content;
  }

  // ── Next.js App Router detection (client-side SPA approximation) ─────────
  // Generated Next apps have NO App.tsx — the entry is synthesized below from
  // app/**/page.* wrapped in ancestor layout.* files. Supports app/ and
  // src/app/. When an App.tsx exists, the battle-tested path stays in charge.
  const isNextApp = isNextAppProject(files);
  const nextDir = isNextApp ? nextAppDirName(files.map((f) => f.path)) : null;

  const cssFiles  = files.filter((f) => f.path.endsWith(".css"));
  const codeFiles = files.filter((f) => {
    if (!/\.(tsx|ts|jsx|js)$/.test(f.path)) return false;
    if (/\.d\.ts$/.test(f.path)) return false;
    // Build-time configs (vite/tailwind/postcss/etc.) are NOT browser-runtime
    // code — executing them in the preview just throws (defineConfig undefined,
    // module.exports, etc.) and would blank the render.
    if (/(^|\/)[\w.-]*\.config\.(t|j)sx?$/.test(f.path)) return false;
    // Vite entry mounts the app — preview bootstrap handles rendering separately.
    if (f.path === "src/main.tsx" || f.path === "src/index.tsx") return false;
    // Next.js server-only files must never execute in the browser preview:
    // route handlers (app/**/route.ts) and middleware touch next/server APIs
    // at module load, and app/api/** is backend-only by definition.
    if (isNextApp && nextDir) {
      if (/^(src\/)?middleware\.(ts|js)$/.test(f.path)) return false;
      if (f.path.startsWith(`${nextDir}/api/`)) return false;
      if (f.path.startsWith(`${nextDir}/`) && /(^|\/)route\.(ts|js)$/.test(f.path)) return false;
    }
    return true;
  });

  // Diagnostic: when files exist but none are renderable code, surface a
  // useful hint instead of the generic "Start chatting" placeholder.
  if (codeFiles.length === 0) {
    if (files.length === 0) return EMPTY_PREVIEW_HTML;
    return buildDiagnosticHtml(
      "No renderable code files found",
      `Found ${files.length} file${files.length === 1 ? "" : "s"} but none are .tsx / .ts / .jsx / .js. Visible paths: ${files.slice(0, 5).map((f) => f.path).join(", ")}${files.length > 5 ? "…" : ""}`,
    );
  }

  // Load order matters: each module's imports are resolved EAGERLY at its own
  // script execution (const { x } = __Mrequire(...)), so a dependency must be
  // registered BEFORE its consumer. Emit leaf/dependency modules (lib, utils,
  // types, data, hooks, context, store, constants, services) first, then
  // components, then pages, then the App entry last. Without this, a component
  // that imports `formatCurrency` from lib/utils gets `undefined` ("x is not a
  // function") because lib/ sorts after components/ alphabetically.
  const loadRank = (p: string): number => {
    const s = p.toLowerCase();
    // Next App Router: pages rank like pages (4) with layouts just before
    // them (3.9) — both import from components/ (3) so they must load after
    // it. Other app/ files (loading/error/not-found/template) sit at 3.8.
    // Checked FIRST so "app/..." paths never fall through to generic ranks.
    if (isNextApp && nextDir) {
      const dir = nextDir.toLowerCase() + "/";
      if (s.startsWith(dir)) {
        if (/(^|\/)page\.(tsx|jsx|js)$/.test(s)) return 4;
        if (/(^|\/)layout\.(tsx|jsx|js)$/.test(s)) return 3.9;
        return 3.8;
      }
    }
    if (/(^|\/)app\.(tsx|jsx)$/.test(s)) return 5; // entry — render root, last
    if (/\/pages?\//.test(s)) return 4;
    if (/\/components?\//.test(s)) return 3;
    if (
      /\/(lib|utils?|types?|constants?|data|hooks?|context|contexts|store|stores|config|services?|api|helpers?)\//.test(s) ||
      /(^|\/)(types?|utils?|constants?|helpers?)\.(t|j)sx?$/.test(s)
    ) return 1; // leaf/dependency modules first
    // Page-level composition dirs (sections, features, layouts, …) compose
    // components — they must load AFTER components/ (3) but before pages/ (4).
    // Without this they ranked 2 and eagerly required components that weren't
    // registered yet ("X is not a function"). Note: the leaf check above wins
    // for e.g. src/features/cart/hooks/, which is correct — hooks stay early.
    if (/\/(sections?|features?|blocks?|widgets?|layouts?|views?|screens?|modules?|containers?)\//.test(s)) return 3.5;
    return 2; // everything else between leaves and components
  };
  const seedOrder = [...codeFiles].sort((a, b) => {
    const ra = loadRank(a.path), rb = loadRank(b.path);
    if (ra !== rb) return ra - rb;
    return a.path.localeCompare(b.path);
  });

  // loadRank orders at the directory level, but files WITHIN a directory tie
  // (e.g. components/Hero.tsx importing components/ui/Button.tsx — both rank 3),
  // and the alphabetical tiebreak then emits the importer BEFORE its dependency.
  // Because preview modules resolve imports eagerly at their own script
  // execution, the consumer binds `undefined` → the "missing component"
  // placeholder. Refine the seed order with a real import-graph topological sort
  // so every intra-project dependency is emitted before anything that imports it.
  const topoSortByImports = (seed: ProjectFile[]): ProjectFile[] => {
    const short = (p: string) => p.replace(/\.(tsx?|jsx?)$/, "");
    const byShort = new Map<string, ProjectFile>();
    for (const f of seed) byShort.set(short(f.path), f);

    const depsOf = (f: ProjectFile): ProjectFile[] => {
      const code = f.content ?? "";
      const specs = new Set<string>();
      let m: RegExpExecArray | null;
      const reFrom = /\bfrom\s*['"]([^'"]+)['"]/g;
      while ((m = reFrom.exec(code))) specs.add(m[1]);
      const reDyn = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((m = reDyn.exec(code))) specs.add(m[1]);
      const out: ProjectFile[] = [];
      for (const spec of specs) {
        if (!/^[.@]/.test(spec)) continue; // only project-relative / @/ alias imports
        const resolved = resolveProjectImport(f.path, spec);
        const hit = byShort.get(resolved) ?? byShort.get(`${resolved}/index`);
        if (hit && hit !== f) out.push(hit);
      }
      return out;
    };

    const result: ProjectFile[] = [];
    const state = new Map<ProjectFile, 1 | 2>(); // 1 = visiting, 2 = done
    const visit = (f: ProjectFile) => {
      const s = state.get(f);
      if (s) return; // done, or currently visiting (cycle) — don't recurse again
      state.set(f, 1);
      for (const d of depsOf(f)) visit(d);
      state.set(f, 2);
      result.push(f);
    };
    for (const f of seed) visit(f);
    return result;
  };
  const sorted = topoSortByImports(seedOrder);

  const mainFile =
    files.find((f) => f.path === "src/App.tsx" || f.path === "App.tsx") ??
    files.find((f) => f.path.endsWith("App.tsx") || f.path.endsWith("App.jsx")) ??
    sorted[sorted.length - 1];

  if (!mainFile) {
    return buildDiagnosticHtml(
      "No entry file found",
      `Found ${codeFiles.length} code file${codeFiles.length === 1 ? "" : "s"} but no App.tsx / App.jsx / src/App.tsx as the entry point. Available code files: ${codeFiles.slice(0, 5).map((f) => f.path).join(", ")}${codeFiles.length > 5 ? "…" : ""}`,
    );
  }

  // ── Next.js virtual entry synthesis ───────────────────────────────────────
  // Instead of rendering App.tsx (absent in Next projects), synthesize a
  // virtual root: a route table from app/**/page.*, each page wrapped in its
  // ancestor layouts, driven by the SAME virtual hash router as react-router.
  // Pages/layouts are __Mrequire'd lazily at render time, so the entry can
  // never race their registration.
  let entryPath = mainFile.path;
  let nextVirtualEntryScript = "";
  if (isNextApp && nextDir) {
    const allPaths = files.map((f) => f.path);
    const entrySource = buildNextVirtualEntrySource(
      buildNextRouteTable(allPaths),
      findNextNotFound(allPaths),
    );
    nextVirtualEntryScript =
      `\n\n<script type="text/lifemark-module" data-file="${NEXT_VIRTUAL_ENTRY_PATH}">\n` +
      entrySource.replace(/<\/script>/gi, "<\\/script>") +
      `\n</script>`;
    entryPath = NEXT_VIRTUAL_ENTRY_PATH;
  }

  const usesTailwindV4 = projectUsesTailwindV4(files);
  const usesTailwind = projectUsesTailwind(files);
  const inlineCss = preparePreviewCss(
    cssFiles.map((f) => f.content ?? "").join("\n"),
    usesTailwindV4,
    usesTailwind,
  );
  const fallbackUtilityCss = usesTailwind ? generateFallbackUtilityCss(files) : "";
  const tailwindScripts = usesTailwind
    ? `<script>${SHADCN_TAILWIND_CDN_CONFIG}</script>
  <script id="lm-tw-cdn" src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
    onload="window.__twLoaded=1;window.__twBrowserV4=1"></script>
  <script>
  (function() {
    var s = document.getElementById('lm-tw-cdn');
    if (!s) return;
    s.onerror = function() {
      window.__twError = 1;
      var fb = document.createElement('script');
      fb.src = 'https://cdn.tailwindcss.com/3.4.17?plugins=forms,typography,aspect-ratio';
      fb.onload = function() { window.__twLoaded = 1; window.__twError = 0; };
      fb.onerror = function() { window.__twError = 1; };
      document.head.appendChild(fb);
    };
  })();
  </script>`
    : "";
  const styleTypeAttr = usesTailwind ? ' type="text/tailwindcss"' : "";

  /** Resolve ./ and ../ imports to a stable project path for __Mrequire. */
  function resolveProjectImport(fromFile: string, importPath: string): string {
    const clean = importPath.replace(/\.(tsx?|jsx?)$/, "");
    if (clean.startsWith("@/")) return `src/${clean.slice(2)}`;
    if (!clean.startsWith(".")) return clean;
    const base = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
    const parts = `${base}/${clean}`.split("/");
    const out: string[] = [];
    for (const p of parts) {
      if (p === "..") out.pop();
      else if (p !== "." && p) out.push(p);
    }
    return out.join("/");
  }

  /** Default import binding — missing module or non-component export → undefined (shows placeholder). */
  const defaultImportExpr = (modVar: string, binding: string) =>
    `const ${binding} = (function(){var m=${modVar};if(!m||typeof m!=='object')return undefined;var c=m.default!==undefined?m.default:m;return typeof c==='function'?c:undefined;})();`;

  /**
   * Remove // and /* *\/ comments, string-aware so we never touch text inside
   * '...', "...", or \`...\`. Critical: the import-rewriting regexes below would
   * otherwise mangle import-like example text in a comment (e.g.
   * `// import { useCart } from './hooks/useCart'`), and a stray backtick in a
   * comment becomes an "unterminated template" that kills the whole preview.
   */
  function stripCommentsSafe(code: string): string {
    let out = "";
    let i = 0;
    const n = code.length;
    let strDelim: string | null = null;
    while (i < n) {
      const ch = code[i];
      const next = code[i + 1];
      if (strDelim) {
        out += ch;
        if (ch === "\\") { out += next ?? ""; i += 2; continue; }
        if (ch === strDelim) strDelim = null;
        i++;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") { strDelim = ch; out += ch; i++; continue; }
      if (ch === "/" && next === "/") { while (i < n && code[i] !== "\n") i++; continue; }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }

  /** Transform one source file into a self-contained Babel script block */
  function wrapFile(file: ProjectFile): string {
    let src = file.content ?? "";

    // `import.meta.env` / `import.meta` are valid only in real ES modules; in the
    // eval'd preview script they'd be a SyntaxError that crashes the ENTIRE
    // preview — which breaks every Vite app that reads env (e.g. a Supabase URL/
    // anon key). Rewrite them to a runtime global seeded from the project's .env
    // (window.__VITE_ENV, injected below). Only matches files that use them.
    src = src.replace(/import\.meta\.env\.([A-Za-z_$][\w$]*)/g, "(window.__VITE_ENV||{}).$1");
    src = src.replace(/import\.meta\.env\b/g, "(window.__VITE_ENV||{})");
    src = src.replace(/import\.meta\.url\b/g, "(location.href)");
    src = src.replace(/import\.meta\b/g, "({ env: (window.__VITE_ENV||{}), url: location.href })");
    const fileShortPath = file.path.replace(/\.(tsx?|jsx?)$/, "");

    // Defensive: strip markdown code fences if the AI response parser ever
    // let them leak into stored file content (a single backtick fence is an
    // instant Babel SyntaxError that kills the whole preview).
    src = src.replace(/^\s*```[\w-]*\s*\n/, "").replace(/\n```\s*$/m, "");

    // Defensive: detect file content stored as a still-ESCAPED JSON string —
    // one giant line riddled with literal \n sequences. Babel dies on the
    // first stray backslash. Real code has real newlines, so the heuristic is
    // safe: only fires when there are almost no actual line breaks.
    const realNL = (src.match(/\n/g) ?? []).length;
    const escNL = (src.match(/\\n/g) ?? []).length;
    if (escNL >= 3 && realNL <= 2) {
      src = src
        .replace(/\\\\/g, "\\u0000") // placeholder for escaped backslashes — restored last
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "  ")
        .replace(/\\"/g, '"')
        .replace(/\\u0000/g, "\\\\");
    }

    // Next.js source normalization: strip "use client"/"use server" directives
    // and, for files under app/, swap <html>/<body>/<head> intrinsics for divs
    // — a nested <html> rendered inside #root breaks the iframe DOM. See
    // transformNextSourceForPreview for the full decision log (metadata and
    // async default exports are intentionally left alone).
    if (isNextApp && nextDir) src = transformNextSourceForPreview(src, file.path, nextDir);

    let importTempCounter = 0;
    const tempModuleVar = (prefix: string, key: string) =>
      `${prefix}_${key.replace(/[^a-zA-Z0-9]/g, "_")}_${importTempCounter++}`;

    // Strip comments (string-aware) BEFORE any import rewriting, so import-like
    // text or backticks inside comments can't be mangled into broken code.
    src = stripCommentsSafe(src);

    // Strip CSS / asset imports
    src = src.replace(/import\s+['"][^'"]+\.css['"]\s*;?\n?/g, "");
    // Strip `import type` — including MULTI-LINE named forms
    // (`import type {\n  Foo,\n  Bar,\n} from './types'`). The old single-line
    // regex missed those; the final safety net then commented out only the
    // first line, leaving dangling `} from '…'` — a SyntaxError that killed
    // the whole preview.
    src = src.replace(
      /import\s+type\s+(?:\{[\s\S]*?\}|[\w$*][\w$\s,*]*?)\s*from\s+['"][^'"]+['"]\s*;?\n?/g,
      "",
    );
    src = src.replace(/import\s+type\s+[^\n;]+;?\n?/g, "");

    // `import { A as B }` → `{ A: B }`; strip TypeScript `type` imports (no runtime binding)
    const destructure = (named: string) =>
      named
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part && !/^type\s/.test(part))
        .map((part) => part.replace(/^type\s+/, "").replace(/\s+as\s+/g, ": "))
        .filter(Boolean)
        .join(", ");

    // AI sometimes emits window-shim destructuring with import-style `as` aliases
    src = src.replace(
      /const\s*\{([^}]+)\}\s*=\s*(window\.__[\w]+)/g,
      (_, named: string, srcObj: string) => `const { ${destructure(named)} } = ${srcObj}`,
    );

    // Strip `type X` from any remaining const-destructuring (e.g. corrupted utils.ts)
    src = src.replace(
      /const\s*\{([^}]+)\}\s*=/g,
      (_, named: string) => {
        const cleaned = destructure(named);
        return cleaned ? `const { ${cleaned} } =` : "const {} =";
      },
    );

    // import React[, { ... }] from 'react'
    src = src.replace(
      /import\s+React\s*,?\s*(?:\{([^}]*)\})?\s*from\s+['"]react['"]\s*;?\n?/g,
      (_, named?: string) =>
        named?.trim() ? `const { ${destructure(named)} } = React;\n` : ""
    );
    // import { ... } from 'react'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = React;\n`
    );

    // import X from 'react-dom[/client]'
    src = src.replace(
      /import\s+(\w+)\s+from\s+['"]react-dom(?:\/client)?['"]\s*;?\n?/g,
      (_, name: string) => `const ${name} = ReactDOM;\n`
    );
    // import { ... } from 'react-dom[/client]'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react-dom(?:\/client)?['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = ReactDOM;\n`
    );

    // import { ... } from 'lucide-react'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]\s*;?\n?/g,
      (_, named: string) =>
        `const { ${destructure(named)} } = window.__lucideReact || {};\n`
    );
    // import * as X from 'lucide-react'
    src = src.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]lucide-react['"]\s*;?\n?/g,
      (_, name: string) => `const ${name} = window.__lucideReact || {};\n`
    );

    // import { ... } from 'framer-motion'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]framer-motion['"]\s*;?\n?/g,
      (_, named: string) =>
        `const { ${destructure(named)} } = window.__framerMotion || {};\n`
    );

    // import { ... } from 'recharts'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]recharts['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = window.__recharts || {};\n`
    );
    // import * as X from 'recharts'
    src = src.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]recharts['"]\s*;?\n?/g,
      (_, name: string) => `const ${name} = window.__recharts || {};\n`
    );

    // import { ... } from 'react-router-dom'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react-router(?:-dom)?['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = window.__reactRouterDom;\n`
    );

    // import { ... } from '@tanstack/react-query'  or  'react-query'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"](?:@tanstack\/)?react-query['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = window.__reactQuery || {};\n`
    );

    // import { createClient } / import * as Supabase from '@supabase/supabase-js'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]@supabase\/supabase-js['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = window.__supabaseJs || {};\n`
    );
    src = src.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]@supabase\/supabase-js['"]\s*;?\n?/g,
      (_, name: string) => `const ${name} = window.__supabaseJs || {};\n`
    );

    // import { ... } from 'react-hook-form'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react-hook-form['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = window.__reactHookForm || {};\n`
    );

    // import { z } / import * as z from 'zod' / import { z, ZodSchema } from 'zod'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]zod['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = window.__zod ? Object.assign({ z: window.__zod }, window.__zod) : {};\n`
    );
    src = src.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]zod['"]\s*;?\n?/g,
      (_, name: string) => `const ${name} = window.__zod || {};\n`
    );

    // import { format, ... } from 'date-fns'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]date-fns(?:\/[^'"]*)?['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = window.__dateFns || {};\n`
    );

    // import { clsx } from 'clsx'  /  import clsx from 'clsx'
    src = src.replace(
      /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]clsx['"]\s*;?\n?/g,
      (_, named: string | undefined, def: string | undefined) =>
        named ? `const { ${destructure(named)} } = { clsx: window.__clsx };\n`
              : `const ${def} = window.__clsx;\n`
    );

    // import { twMerge } from 'tailwind-merge' / import { cn } from ...
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]tailwind-merge['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = { twMerge: window.__twMerge, merge: window.__twMerge };\n`
    );

    // import { cva, ... } from 'class-variance-authority'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]class-variance-authority['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = { cva: window.__cva, cx: window.__clsx };\n`
    );

    // import { toast, Toaster } from 'sonner'  /  'react-hot-toast'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]sonner['"]\s*;?\n?/g,
      (_, named: string) => `const { ${destructure(named)} } = window.__sonner || {};\n`
    );
    src = src.replace(
      /import\s+(?:(\w+)|\{([^}]+)\})\s*,?\s*(?:\{([^}]+)\})?\s*from\s+['"]react-hot-toast['"]\s*;?\n?/g,
      (_, def: string | undefined, named1: string | undefined, named2: string | undefined) => {
        const lines: string[] = [];
        if (def) lines.push(`const ${def} = window.__reactHotToast?.default || window.__reactHotToast || function(){};`);
        const named = named1 || named2;
        if (named) lines.push(`const { ${destructure(named)} } = window.__reactHotToast || {};`);
        return lines.join("\n") + "\n";
      }
    );

    // Relative imports — default + named: import Foo, { Bar } from './path'
    src = src.replace(
      /import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, def: string, named: string, path: string) => {
        const resolved = resolveProjectImport(file.path, path);
        const v = tempModuleVar("__mod", resolved);
        return [
          `var ${v} = window.__Mrequire('${resolved}');`,
          defaultImportExpr(v, def.trim()),
          `const { ${destructure(named)} } = ${v};`,
        ].join("\n") + "\n";
      }
    );
    // Relative imports — named only: import { Foo, Bar } from './path'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, named: string, path: string) => {
        const resolved = resolveProjectImport(file.path, path);
        const v = tempModuleVar("__mod", resolved);
        return [
          `var ${v} = window.__Mrequire('${resolved}');`,
          `const { ${destructure(named)} } = ${v};`,
        ].join("\n") + "\n";
      }
    );
    // Relative imports — default only: import Foo from './path'
    src = src.replace(
      /import\s+(\w+)\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, name: string, path: string) => {
        const resolved = resolveProjectImport(file.path, path);
        const v = tempModuleVar("__mod", resolved);
        return `var ${v} = window.__Mrequire('${resolved}'); ${defaultImportExpr(v, name)}\n`;
      }
    );

    // ── GENERIC catch-all imports ───────────────────────────────────────────
    // Any import the specific handlers above didn't claim (unknown packages,
    // "@/…" path aliases, multi-line named imports) is routed through
    // __Mrequire. A leftover `import` statement is a guaranteed SyntaxError in
    // these non-module Babel scripts and takes down the ENTIRE preview — an
    // unknown binding is merely undefined and __Mrequire warns about it.
    const genericRequire = (spec: string) => `window.__Mrequire('${spec.replace(/'/g, "\\'")}')`;
    // import * as N from 'x'
    src = src.replace(
      /import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, name: string, spec: string) => `const ${name} = ${genericRequire(spec)};\n`
    );
    // import D, { A, B } from 'x'   (braces may span lines)
    src = src.replace(
      /import\s+([\w$]+)\s*,\s*\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, def: string, named: string, spec: string) => {
        const v = tempModuleVar("__gmod", spec);
        return `var ${v} = ${genericRequire(spec)};\n${defaultImportExpr(v, def)}\nconst { ${destructure(named)} } = ${v};\n`;
      }
    );
    // import { A, B } from 'x'   (braces may span lines)
    src = src.replace(
      /import\s+\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, named: string, spec: string) => `const { ${destructure(named)} } = ${genericRequire(spec)};\n`
    );
    // import D from 'x'
    src = src.replace(
      /import\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, def: string, spec: string) => {
        const v = tempModuleVar("__gmod", spec);
        return `var ${v} = ${genericRequire(spec)};\n${defaultImportExpr(v, def)}\n`;
      }
    );
    // Side-effect imports: import 'x'
    src = src.replace(/import\s+['"][^'"]+['"]\s*;?\n?/g, "");

    // Track default-export name for inline function/class exports
    let defaultExportName: string | null = null;

    // export default [async] function/class — named OR anonymous
    src = src.replace(
      /export\s+default\s+(async\s+)?(function|class)(\s+[\w$]+)?/g,
      (_, asyncKw: string | undefined, kw: string, name: string | undefined) => {
        if (name?.trim()) {
          defaultExportName = name.trim();
          return `${asyncKw ?? ""}${kw}${name}`;
        }
        defaultExportName = "__default_export";
        return `const __default_export = ${asyncKw ?? ""}${kw}`;
      }
    );
    // export default SomeIdentifier;
    src = src.replace(
      /^export\s+default\s+([\w$]+)\s*;?\s*$/m,
      (_, name: string) => {
        defaultExportName = name;
        return `/* default export: ${name} */`;
      }
    );
    // export default <any other expression>  (e.g. memo(X), { … }, () => …)
    src = src.replace(/^([ \t]*)export\s+default\s+/m, (_, indent: string) => {
      if (!defaultExportName) defaultExportName = "__default_export";
      return defaultExportName === "__default_export"
        ? `${indent}const __default_export = `
        : `${indent}const __default_export_extra = `; // a second default — keep it parseable
    });

    // Collected exports as {exported, local} pairs. Bare names can't represent
    // `export { Card as Panel }` (exported name ≠ local binding), which is why the
    // old bare-string list had to smuggle aliases in as a "...(spread)" entry —
    // and the assembly step below then filtered those very entries back out, so
    // `export { … }` silently registered NOTHING. Pairs make aliases first-class.
    const namedExports: Array<{ exported: string; local: string }> = [];
    const addExport = (exported: string, local = exported) => {
      if (/^[\w$]+$/.test(local)) namedExports.push({ exported, local });
    };

    // ── Destructured exports: `export const { a, b: c } = …` / `export const [a] = …`
    // The identifier handler below requires a plain name after const/let/var, so
    // these never matched and fell through to the final safety net. That net is
    // single-line, so a MULTI-line destructure had only its first line commented
    // out, leaving a dangling `} = foo();` — a SyntaxError that blanks the WHOLE
    // preview (Babel failure paints the red error box over #root). Handle them
    // properly: drop the `export` keyword, keep the declaration, register the
    // bound names.
    const bindingNames = (pattern: string): string[] => {
      const inner = pattern.slice(1, -1); // strip the outer { } or [ ]
      const out: string[] = [];
      for (const raw of inner.split(",")) {
        let p = raw.trim();
        if (!p) continue;
        p = p.replace(/^\.\.\./, "");         // rest element
        p = p.split("=")[0].trim();            // default value
        if (p.includes(":")) p = p.split(":").pop()!.trim(); // { a: localName }
        const m = p.match(/^[\w$]+/);
        if (m) out.push(m[0]);
      }
      return out;
    };
    src = src.replace(
      /export\s+(const|let|var)\s+(\{[^}]*\}|\[[^\]]*\])\s*=/g,
      (_, kw: string, pattern: string) => {
        for (const n of bindingNames(pattern)) addExport(n);
        return `${kw} ${pattern} =`;
      }
    );

    // Collect names declared via export const/let/var/function/class
    src = src.replace(
      /export\s+(async\s+)?(const|let|var|function|class)\s+([\w$]+)/g,
      (_, asyncKw: string | undefined, kw: string, name: string) => {
        addExport(name);
        // Keep `async` — dropping just the line via the safety net would leave
        // a dangling function body and a fresh SyntaxError.
        return `${asyncKw ?? ""}${kw} ${name}`;
      }
    );
    // TS-only export forms — strip the export keyword (types vanish at runtime,
    // but the raw `export` keyword is a SyntaxError in these script blocks)
    src = src.replace(/export\s+type\s+/g, "type ");
    src = src.replace(/export\s+(interface|enum|declare)\s+/g, "$1 ");

    const resolveRuntimeSpec = (spec: string) =>
      spec.startsWith(".") ? resolveProjectImport(file.path, spec) : spec;

    // Re-exports: export { A, B as C } from './path'
    // MUST run before the plain `export { … }` handler below, which would
    // otherwise eat the brace group and leave a dangling `from './path'`.
    src = src.replace(
      /export\s+\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, names: string, spec: string) => {
        const resolved = resolveRuntimeSpec(spec);
        const v = tempModuleVar("__re", spec);
        const entries = names
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .map((n) => {
            const [orig, alias] = n.split(/\s+as\s+/).map((s) => s.trim());
            return `${alias ?? orig}: ${v}['${orig}']`;
          })
          .join(", ");
        return `var ${v} = window.__Mrequire('${resolved}');\ntry { const __re_exports = Object.assign(window.__M['${file.path}'] || {}, { ${entries} }); window.__Mdefine('${file.path}', __re_exports); window.__Mdefine('${fileShortPath}', __re_exports); } catch(e) {}\n`;
      }
    );
    // export * from './path'
    src = src.replace(
      /export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, spec: string) =>
        `try { const __star_exports = Object.assign(window.__M['${file.path}'] || {}, window.__Mrequire('${resolveRuntimeSpec(spec)}')); window.__Mdefine('${file.path}', __star_exports); window.__Mdefine('${fileShortPath}', __star_exports); } catch(e) {}\n`
    );

    // export { A, B as C }   (bracket list with no `from` — grouped at file end)
    src = src.replace(
      /export\s+\{([^}]+)\}\s*;?\n?/g,
      (_, names: string) => {
        for (const raw of names.split(",")) {
          const n = raw.trim().replace(/^type\s+/, ""); // `export { type Foo }`
          if (!n) continue;
          const [orig, alias] = n.split(/\s+as\s+/).map((s) => s.trim());
          // The EXPORTED name is the alias when present; the LOCAL binding is orig.
          addExport(alias ?? orig, orig);
        }
        return `/* named exports: ${names} */`;
      }
    );

    // ── FINAL SAFETY NET ────────────────────────────────────────────────────
    // Any import/export statement still standing would be a SyntaxError that
    // kills the entire preview. Comment it out and log it instead — one
    // degraded binding beats a blank screen.
    src = src.replace(/^[ \t]*(import|export)\b[^\n]*$/gm, (line) => {
      const safe = line.replace(/\*\//g, "* /");
      return `/* [preview] unsupported module syntax skipped: ${safe} */`;
    });

    // Register at bottom of script
    const shortPath = fileShortPath;
    if (defaultExportName) {
      src += `\ntry { window.__Mdefine('${file.path}', { default: ${defaultExportName} }); window.__Mdefine('${shortPath}', { default: ${defaultExportName} }); } catch(e) {}\n`;
    }
    if (namedExports.length > 0) {
      // Dedupe on the EXPORTED name (last declaration wins, as in real ESM).
      const byExported = new Map<string, string>();
      for (const { exported, local } of namedExports) byExported.set(exported, local);

      const safeEntries = [...byExported]
        .map(
          ([exported, local]) =>
            `'${exported}': typeof ${local} !== 'undefined' ? ${local} : undefined`
        )
        .join(", ");
      if (safeEntries) {
        src += `\ntry { window.__Mdefine('${file.path}', Object.assign(window.__M['${file.path}'] || {}, { ${safeEntries} })); window.__Mdefine('${shortPath}', window.__M['${file.path}']); } catch(e) {}\n`;
      }
    }

    // Guard against undefined.charAt — the #1 white-screen crash for generated UIs.
    src = hardenCharAtCalls(src);

    // Inert script type — the browser ignores it and Babel's auto-runner skips
    // it. The bootstrap below compiles it explicitly with isTSX/allExtensions
    // (which `data-presets="typescript"` does NOT enable — that was the
    // "Unexpected token" on every TSX type annotation), isolated per file.
    // Guard against a literal </script> inside string content breaking the tag.
    const safeSrc = src.replace(/<\/script>/gi, "<\\/script>");
    return `<script type="text/lifemark-module" data-file="${file.path}">\n${safeSrc}\n</script>`;
  }

  // Virtual Next entry appended LAST — it only defines the root component and
  // requires pages lazily, so ordering relative to real modules is irrelevant,
  // but keeping it last mirrors the App-entry-last convention.
  const fileScripts = sorted.map(wrapFile).join("\n\n") + nextVirtualEntryScript;

  // Seed Vite-style public env (VITE_*) from the project's .env so apps that read
  // import.meta.env (e.g. Supabase URL + anon key) work in the live preview, not
  // just after deploy. VITE_* values are public by design — no secret exposed.
  const viteEnv: Record<string, string> = { MODE: "development", DEV: "true", PROD: "false", BASE_URL: "/" };
  {
    const envFile = files.find((f) => f.path === ".env.local" || f.path === ".env");
    for (const line of (envFile?.content ?? "").split("\n")) {
      const m = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) viteEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  const viteEnvScript = `<script>window.__VITE_ENV = ${JSON.stringify(viteEnv)};</script>`;

  // Next.js client code reads process.env.NEXT_PUBLIC_* — `process` is
  // undefined in the browser, so a bare reference would ReferenceError-crash
  // whichever module touches it. Seed a minimal window.process (public
  // NEXT_PUBLIC_* vars only — same exposure rules as VITE_*). Next-mode only.
  let nextEnvScript = "";
  if (isNextApp) {
    const nextEnv: Record<string, string> = { NODE_ENV: "development" };
    const envFile = files.find((f) => f.path === ".env.local" || f.path === ".env");
    for (const line of (envFile?.content ?? "").split("\n")) {
      const m = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) nextEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    nextEnvScript = `<script>window.process = window.process || { env: ${JSON.stringify(nextEnv)} };</script>`;
  }

  const consoleBridge = `<script>
(function() {
  var _log = console.log, _warn = console.warn, _err = console.error;
  // Babel reports inline-script errors as "Inline Babel script (N)" — useless.
  // Translate N to the actual project file via the script's data-file attribute.
  function nameScript(text) {
    return String(text).replace(/Inline Babel script \\((\\d+)\\)/g, function(m, n) {
      try {
        var scripts = document.querySelectorAll('script[type="text/babel"][data-file]');
        var el = scripts[Number(n)] || scripts[Number(n) - 1];
        var f = el && el.getAttribute('data-file');
        return f ? (m + ' → ' + f) : m;
      } catch (e) { return m; }
    });
  }
  function relay(type, args) {
    var text = Array.from(args).map(function(a) {
      if (a && a.stack) return a.stack;
      if (typeof a === 'string') return a;
      if (a && a.message) return a.message;
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); }
    }).filter(Boolean).join(' ');
    text = nameScript(text);
    if (type === 'error') {
      var m = text.trim();
      if (!m || m === '{}' || m === '[]' || m === '[object Object]') return;
      if (m.length < 4 && !/error|fail/i.test(m)) return;
    }
    try { window.parent.postMessage({ source: 'lifemark-preview', type: type, text: text }, '*'); } catch(e) {}
  }
  function emitPreviewError(kind, message, extra) {
    var text = nameScript(String(message || 'Unknown error'));
    var m = text.trim();
    if (!m || m === '{}' || m === '[]' || m === '[object Object]') return;
    if (m.length < 4 && !/error|fail/i.test(m)) return;
    try {
      window.parent.postMessage({
        source: 'lifemark-preview-errors',
        type: 'preview-error',
        kind: kind,
        message: text,
        extra: extra || {},
        url: location.href,
        timestamp: Date.now()
      }, '*');
    } catch(e) {}
  }
  console.log   = function() { _log.apply(console, arguments);  relay('log',   arguments); };
  console.warn  = function() { _warn.apply(console, arguments); relay('warn',  arguments); };
  console.error = function() { _err.apply(console, arguments);  relay('error', arguments); };
  window.addEventListener('error', function(e) {
    relay('error', [(e.message || 'Unknown error') + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : '')]);
    emitPreviewError('runtime', e.message || 'Unknown error', {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error && e.error.stack ? String(e.error.stack) : ''
    });
  });
  window.addEventListener('unhandledrejection', function(e) {
    relay('error', ['Unhandled promise rejection: ' + (e.reason?.message || String(e.reason))]);
    emitPreviewError('promise', e.reason?.message || String(e.reason), {
      stack: e.reason && e.reason.stack ? String(e.reason.stack) : ''
    });
  });
})();
</script>`;

  const moduleRegistry = `<script>
window.__M = {};
window.__Mdefine = function(name, exports) { window.__M[name] = exports; };
window.__Mrequire = function(path) {
  function normPreviewPath(p) {
    var s = p.replace(/^@\\//, 'src/').replace(/\\.(tsx?|jsx?)$/, '');
    var parts = s.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '..') out.pop();
      else if (parts[i] !== '.' && parts[i] !== '') out.push(parts[i]);
    }
    return out.join('/');
  }
  var norm = normPreviewPath(path);
  var candidates = [path, norm, 'src/' + norm.replace(/^src\\//, ''), norm + '.tsx', norm + '.ts', norm + '.jsx', norm + '.js'];
  // Next-style "@/*" → "./*" alias (project root, NO src/): normPreviewPath
  // mapped '@/components/x' to 'src/components/x', so ALSO try the root-level
  // path (+ index files). Appended AFTER the original candidates so
  // src/-rooted projects keep winning when both exist.
  var rootAlt = norm.replace(/^src\\//, '');
  if (rootAlt !== norm) candidates.push(rootAlt, rootAlt + '.tsx', rootAlt + '.ts', rootAlt + '.jsx', rootAlt + '.js');
  candidates.push(
    norm + '/index', norm + '/index.tsx', norm + '/index.ts', norm + '/index.jsx', norm + '/index.js',
    rootAlt + '/index', rootAlt + '/index.tsx', rootAlt + '/index.ts', rootAlt + '/index.jsx', rootAlt + '/index.js'
  );
  for (var i = 0; i < candidates.length; i++) {
    if (window.__M[candidates[i]]) return window.__M[candidates[i]];
  }
  // React core
  if (path === 'react' || path === 'React') return window.React;
  if (path === 'react-dom' || path === 'react-dom/client') return window.ReactDOM;
  // UI / icons / animation
  if (path === 'lucide-react') return window.__lucideReact || new Proxy({}, { get: function() { return function(){return null;}; } });
  if (path === 'framer-motion') return window.__framerMotion || {};
  // Charts
  if (path === 'recharts') return window.__recharts || {};
  // Routing
  if (path === 'react-router-dom' || path === 'react-router') return window.__reactRouterDom || {};
  // Next.js runtime (App Router preview) — shims injected below in next mode
  // only. 'next/' prefix check keeps 'next-themes' etc. off this branch; when
  // __nextShims is absent (non-Next project) we fall through to the warn+{}.
  if ((path === 'next' || path.indexOf('next/') === 0) && window.__nextShims) return window.__nextShims.resolve(path);
  // Data fetching
  if (path === '@tanstack/react-query' || path === 'react-query') return window.__reactQuery || {};
  if (path === '@supabase/supabase-js') return window.__supabaseJs || {};
  // Forms
  if (path === 'react-hook-form') return window.__reactHookForm || {};
  if (path === '@hookform/resolvers/zod' || path.startsWith('@hookform/')) {
    return { zodResolver: function(schema) { return async function(v) { try { schema.parse(v); return { values: v, errors: {} }; } catch(e) { return { values: {}, errors: {} }; } }; } };
  }
  // Validation
  if (path === 'zod') return window.__zod ? Object.assign({ z: window.__zod }, window.__zod) : {};
  // Date utils
  if (path === 'date-fns' || path.startsWith('date-fns/')) return window.__dateFns || {};
  // Styling utils
  if (path === 'clsx') return { default: window.__clsx, clsx: window.__clsx };
  if (path === 'tailwind-merge') return { default: window.__twMerge, twMerge: window.__twMerge };
  if (path === 'class-variance-authority') return { cva: window.__cva, cx: window.__clsx };
  // Toast
  if (path === 'sonner') return window.__sonner || {};
  if (path === 'react-hot-toast') return window.__reactHotToast || {};
  // Radix UI — return empty proxy so destructuring doesn't crash
  if (path.startsWith('@radix-ui/')) return new Proxy({}, { get: function(_,k) { return k === '__esModule' ? true : function(){return null;}; } });
  console.warn('[preview] module not found:', path);
  if (!window.__lmMissingModules) window.__lmMissingModules = [];
  window.__lmMissingModules.push(path);

  // A missing PROJECT module (src/..., ./..., not a bare package) used to return
  // a bare {} — so \`const { Navbar } = __Mrequire('src/.../Navbar')\` bound
  // Navbar to undefined and the app later died with a stack deep inside
  // react-dom that named neither the symbol nor the file. Hand back a proxy that
  // reports exactly which symbol was pulled from which missing file, ONCE per
  // symbol. Behaviour is unchanged (the value is still undefined) — but the
  // failure is now self-describing, both in the console and in the error overlay.
  //
  // IMPORTANT: do NOT use a regex literal with escaped slashes here. This block
  // lives inside a TS template literal; a single backslash-slash collapses to a
  // bare slash in the emitted HTML and the browser parses an unterminated group
  // (aborts the whole script, so window.__Mrequire is never assigned).
  var looksLikeProjectModule =
    path.indexOf('src/') === 0 ||
    path.indexOf('./') === 0 ||
    path.indexOf('../') === 0 ||
    path.indexOf('/') !== -1;
  if (!looksLikeProjectModule) return {};

  if (!window.__lmMissingExports) window.__lmMissingExports = [];
  var reported = {};
  return new Proxy({}, {
    get: function(_, key) {
      if (typeof key !== 'string') return undefined;
      if (key === '__esModule') return true;
      // React/JSX probe these on any value — never treat them as app symbols.
      if (key === 'default' || key === 'then' || key === '$$typeof' || key === 'prototype') return undefined;
      if (!reported[key]) {
        reported[key] = true;
        window.__lmMissingExports.push({ module: path, symbol: key });
        console.error(
          '[preview] "' + key + '" was imported from "' + path +
          '", but that file does not exist in the project. Create ' + path +
          ' and export ' + key + '.'
        );
      }
      return undefined;
    }
  });
};
// Inline stubs for packages without CDN UMD builds
window.__clsx = function() { return Array.from(arguments).flat(Infinity).filter(function(x) { return !!x && typeof x === 'string'; }).join(' '); };
window.__twMerge = function() { return Array.from(arguments).filter(Boolean).join(' '); };
window.__cva = function(base, config) { return function(opts) { var out = base || ''; if (config && config.variants && opts) { Object.keys(opts).forEach(function(k) { var v = config.variants[k]; if (v && opts[k] != null && v[String(opts[k])]) out += ' ' + v[String(opts[k])]; }); } if (config && config.defaultVariants && !opts) { Object.keys(config.defaultVariants).forEach(function(k) { var v = config.variants && config.variants[k]; if (v && v[config.defaultVariants[k]]) out += ' ' + v[config.defaultVariants[k]]; }); } return out.trim(); }; };
window.__sonner = { toast: Object.assign(function(msg){console.log('[toast]',msg);return '';}, { success:function(m){console.log('[toast:ok]',m);}, error:function(m){console.log('[toast:err]',m);}, info:function(m){console.log('[toast:info]',m);} }), Toaster: function(){ return null; } };
window.__reactHotToast = { default: Object.assign(function(m){console.log('[toast]',m);}, { success:function(m){console.log('[toast:ok]',m);}, error:function(m){console.log('[toast:err]',m);} }), toast: function(m){console.log('[toast]',m);}, Toaster: function(){return null;} };
window.__reactQuery = (function() {
  function QueryClient() {}
  function QueryClientProvider(props) { return React.createElement(React.Fragment, null, props.children); }
  function useQuery() { return { data: undefined, error: null, isLoading: false, isFetching: false, isError: false, isSuccess: true, refetch: function(){ return Promise.resolve({ data: undefined }); } }; }
  function useMutation() { return { mutate: function(){}, mutateAsync: function(){ return Promise.resolve(); }, data: undefined, error: null, isPending: false, isLoading: false, isError: false, isSuccess: false }; }
  return { QueryClient: QueryClient, QueryClientProvider: QueryClientProvider, useQuery: useQuery, useMutation: useMutation, useQueryClient: function(){ return new QueryClient(); } };
})();
// Supabase browser client stub for generated apps previewed before a real
// Lifemark Cloud backend is available.
window.__supabaseJs = (function() {
  function ok(data) { return Promise.resolve({ data: data == null ? null : data, error: null }); }
  function makeBuilder(rows) {
    var state = { rows: Array.isArray(rows) ? rows : [] };
    var builder = {
      select: function() { return builder; },
      insert: function(value) { state.rows = state.rows.concat(Array.isArray(value) ? value : [value]); return builder; },
      upsert: function(value) { state.rows = state.rows.concat(Array.isArray(value) ? value : [value]); return builder; },
      update: function() { return builder; },
      delete: function() { state.rows = []; return builder; },
      eq: function() { return builder; },
      neq: function() { return builder; },
      gt: function() { return builder; },
      gte: function() { return builder; },
      lt: function() { return builder; },
      lte: function() { return builder; },
      like: function() { return builder; },
      ilike: function() { return builder; },
      in: function() { return builder; },
      contains: function() { return builder; },
      order: function() { return builder; },
      limit: function() { return builder; },
      range: function() { return builder; },
      maybeSingle: function() { return ok(state.rows[0] || null); },
      single: function() { return ok(state.rows[0] || null); },
      then: function(resolve, reject) { return ok(state.rows).then(resolve, reject); },
      catch: function(reject) { return ok(state.rows).catch(reject); },
      finally: function(done) { return ok(state.rows).finally(done); },
    };
    return builder;
  }
  function createClient() {
    var tables = {};
    return {
      auth: {
        getUser: function() { return ok({ user: null }); },
        getSession: function() { return ok({ session: null }); },
        onAuthStateChange: function() { return { data: { subscription: { unsubscribe: function() {} } } }; },
        signUp: function() { return ok({ user: null, session: null }); },
        signInWithPassword: function() { return ok({ user: null, session: null }); },
        signInWithOAuth: function() { return ok({ provider: null, url: null }); },
        signOut: function() { return Promise.resolve({ error: null }); },
        resetPasswordForEmail: function() { return Promise.resolve({ data: {}, error: null }); },
      },
      from: function(table) {
        tables[table] = tables[table] || [];
        return makeBuilder(tables[table]);
      },
      rpc: function() { return ok(null); },
      storage: {
        from: function(bucket) {
          return {
            upload: function(path, file) { return ok({ path: path, fullPath: bucket + '/' + path, file: file }); },
            remove: function(paths) { return ok(paths || []); },
            list: function() { return ok([]); },
            getPublicUrl: function(path) { return { data: { publicUrl: 'https://example.supabase.local/storage/v1/object/public/' + bucket + '/' + path } }; },
            createSignedUrl: function(path) { return ok({ signedUrl: 'https://example.supabase.local/storage/v1/object/sign/' + bucket + '/' + path }); },
          };
        },
      },
      channel: function() {
        return {
          on: function() { return this; },
          subscribe: function(callback) { if (callback) setTimeout(function(){ callback('SUBSCRIBED'); }, 0); return this; },
          unsubscribe: function() { return Promise.resolve('ok'); },
        };
      },
      removeChannel: function() { return Promise.resolve('ok'); },
    };
  }
  return { createClient: createClient };
})();
// react-hook-form — stub so Contact/Login forms render without CDN
window.__reactHookForm = (function() {
  function useForm() {
    return {
      register: function() { return {}; },
      handleSubmit: function(fn) { return function(e) { if (e && e.preventDefault) e.preventDefault(); if (fn) fn({}); }; },
      formState: { errors: {} },
    };
  }
  return { useForm: useForm };
})();
// zod — minimal stub so schema definitions at module load don't throw
window.__zod = (function() {
  function field() { return { email: function(){return this;}, min: function(){return this;} }; }
  var z = function() { return z; };
  z.object = function() { return { parse: function(v) { return v || {}; } }; };
  z.string = field;
  z.infer = function() { return {}; };
  return z;
})();
// framer-motion has no browser UMD build — provide an inert stub: motion.div
// etc. render the real DOM element (animation props stripped, layout intact),
// AnimatePresence passes children through, hooks return static values.
// Without this, __Mrequire('framer-motion') returned {} and motion.div crashed
// the whole preview ("Script error.").
window.__framerMotion = (function() {
  var ANIM_PROPS = /^(initial|animate|exit|variants|transition|whileHover|whileTap|whileFocus|whileDrag|whileInView|viewport|layout|layoutId|layoutDependency|drag|dragConstraints|dragElastic|dragMomentum|onAnimationStart|onAnimationComplete|onUpdate|onDragStart|onDragEnd|onDrag|onViewportEnter|onViewportLeave)$/;
  var cache = {};
  function makeComp(tag) {
    return React.forwardRef(function(props, ref) {
      var clean = {};
      for (var k in props) { if (!ANIM_PROPS.test(k) && k !== 'children') clean[k] = props[k]; }
      clean.ref = ref;
      return React.createElement(tag, clean, props.children);
    });
  }
  var motion = new Proxy(function(c) { return c; }, {
    get: function(_, tag) { tag = String(tag); if (!cache[tag]) cache[tag] = makeComp(tag); return cache[tag]; },
    apply: function(_, __, args) { return args[0]; }
  });
  function mv(v) { return { get: function() { return v; }, set: function() {}, on: function() { return function() {}; } }; }
  return {
    motion: motion,
    m: motion,
    AnimatePresence: function(props) { return React.createElement(React.Fragment, null, props.children); },
    LazyMotion: function(props) { return React.createElement(React.Fragment, null, props.children); },
    domAnimation: {},
    useAnimation: function() { return { start: function() { return Promise.resolve(); }, stop: function() {}, set: function() {} }; },
    useAnimationControls: function() { return { start: function() { return Promise.resolve(); }, stop: function() {}, set: function() {} }; },
    useInView: function() { return true; },
    useScroll: function() { return { scrollX: mv(0), scrollY: mv(0), scrollXProgress: mv(0), scrollYProgress: mv(0) }; },
    useMotionValue: mv,
    useTransform: function() { return mv(0); },
    useSpring: function(v) { return mv(typeof v === 'number' ? v : 0); },
    useReducedMotion: function() { return false; }
  };
})();
// lucide-react CDN is unreliable — proxy returns a placeholder icon for any missing name.
window.__lucideReact = (function() {
  var icons = {};
  var stubs = {};
  function stubIcon() {
    return React.forwardRef(function LucideStub(props, ref) {
      var size = props.size || 24;
      return React.createElement('svg', {
        ref: ref,
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        className: props.className,
        'aria-hidden': true,
      }, React.createElement('circle', { cx: 12, cy: 12, r: 9 }));
    });
  }
  return new Proxy(icons, {
    get: function(t, name) {
      if (name === '__esModule') return true;
      var n = String(name);
      if (t[n]) return t[n];
      if (!stubs[n]) stubs[n] = stubIcon();
      return stubs[n];
    },
  });
})();
// react-router-dom CDN path is fragile — in-preview mini-router with SPA navigation.
window.__reactRouterDom = (function() {
  var LocCtx = React.createContext({ pathname: '/', search: '', hash: '', state: null, key: 'default' });
  var ParamsCtx = React.createContext({});
  var listeners = [];

  // The preview iframe is served at /preview/<id>, so window.location.pathname is
  // NOT the app's route ("/"). Route off a VIRTUAL path kept in the URL hash
  // (#/services) instead — it starts at "/" so index routes match on load, and
  // it never collides with the preview host path or 404s on reload.
  function currentVirtualPath() {
    var h = window.location.hash || '';
    if (h.length > 1) {
      var raw = String(h.slice(1) || ''); // drop leading '#'
      return raw.charAt(0) === '/' ? raw : '/' + raw;
    }
    return '/';
  }

  function readLoc() {
    var full = currentVirtualPath();
    var q = full.indexOf('?');
    var pathname = q >= 0 ? full.slice(0, q) : full;
    var search = q >= 0 ? full.slice(q) : '';
    if (!pathname) pathname = '/';
    return { pathname: pathname, search: search, hash: '', state: null, key: String(Date.now()) };
  }

  function notify() { listeners.forEach(function(fn) { fn(); }); }

  function navigate(to) {
    var path = typeof to === 'string'
      ? to
      : (to && typeof to.pathname === 'string' ? to.pathname : '/');
    path = String(path || '/');
    if (path.charAt(0) !== '/') path = '/' + path;
    try {
      window.history.pushState({}, '', '#' + path);
      notify();
    } catch (e) {}
  }

  // Returns the matched route's params object (possibly {}), or null when
  // "pattern" does not match "pathname". Previously this only supported an
  // exact string match or a trailing "/*" wildcard - a dynamic segment like
  // "/blog/:slug" never matched a real URL such as "/blog/hello-world" at
  // all, so any project using this common react-router pattern (detail,
  // product, or post pages) rendered a blank page in the fallback preview
  // (used when the Babel-in-iframe path runs rather than WebContainer/Vite).
  function matchRouteParams(pattern, pathname) {
    pattern = String(pattern == null ? '' : pattern);
    pathname = String(pathname == null ? '' : pathname);
    if (pattern === '' || pattern === '*') {
      return (pathname === '/' || pathname === '') ? {} : null;
    }
    if (pattern === '/') {
      return (pathname === '/' || pathname === '') ? {} : null;
    }
    if (pattern.slice(-2) === '/*') {
      var base = pattern.slice(0, -2);
      if (pathname === base || pathname.indexOf(base + '/') === 0) {
        // This whole runtime is embedded as text inside an outer TS template
        // literal (see the file this shim is generated from) — a literal
        // backslash written here would need doubling to survive that outer
        // template's own escape handling. Plain string ops sidestep the trap
        // entirely rather than relying on getting the doubling right.
        var rest = pathname.slice(base.length);
        if (rest.charAt(0) === '/') rest = rest.slice(1);
        return { '*': rest };
      }
      return null;
    }
    var patternSegs = pattern.split('/').filter(Boolean);
    var pathSegs = pathname.split('/').filter(Boolean);
    if (patternSegs.length !== pathSegs.length) return null;
    var params = {};
    for (var i = 0; i < patternSegs.length; i++) {
      var ps = patternSegs[i];
      var vs = pathSegs[i];
      if (ps.charAt(0) === ':') {
        if (!vs) return null;
        var paramName = ps.slice(1);
        if (paramName.charAt(paramName.length - 1) === '?') paramName = paramName.slice(0, -1);
        try { params[paramName] = decodeURIComponent(vs); } catch (e) { params[paramName] = vs; }
      } else if (ps !== vs) {
        return null;
      }
    }
    return params;
  }

  function matchRoute(pattern, pathname) {
    return matchRouteParams(pattern, pathname) !== null;
  }

  function RouterShell(props) {
    var state = React.useState(readLoc);
    var loc = state[0];
    var setLoc = state[1];
    React.useEffect(function() {
      function sync() { setLoc(readLoc()); }
      listeners.push(sync);
      window.addEventListener('popstate', sync);
      window.addEventListener('hashchange', sync);
      return function() {
        listeners = listeners.filter(function(fn) { return fn !== sync; });
        window.removeEventListener('popstate', sync);
        window.removeEventListener('hashchange', sync);
      };
    }, []);
    return React.createElement(LocCtx.Provider, { value: loc }, props.children);
  }

  function useLocation() { return React.useContext(LocCtx); }

  function Routes(props) {
    var loc = useLocation();
    var pathname = loc.pathname || '/';
    var kids = React.Children.toArray(props.children);
    var indexEl = null;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i];
      if (!r || !r.props) continue;
      var p = r.props.path;
      if (p == null) { indexEl = r.props.element || null; continue; }
      var params = matchRouteParams(p, pathname);
      if (params !== null) {
        return React.createElement(ParamsCtx.Provider, { value: params }, r.props.element || null);
      }
    }
    if ((pathname === '/' || pathname === '') && indexEl) {
      return React.createElement(ParamsCtx.Provider, { value: {} }, indexEl);
    }
    return null;
  }

  function Route() { return null; }

  function Link(props) {
    var p = Object.assign({}, props);
    var to = p.to != null && p.to !== '' ? p.to : '/';
    delete p.to;
    var hrefTo = typeof to === 'string'
      ? to
      : (to && typeof to.pathname === 'string' ? to.pathname : '/');
    hrefTo = String(hrefTo || '/');
    return React.createElement('a', Object.assign({
      href: '#' + (hrefTo.charAt(0) === '/' ? hrefTo : '/' + hrefTo),
      onClick: function(e) {
        e.preventDefault();
        navigate(to);
      }
    }, p));
  }

  function NavLink(props) {
    var p = Object.assign({}, props);
    var to = p.to != null && p.to !== '' ? p.to : '/';
    var cls = p.className;
    delete p.to; delete p.className;
    var loc = useLocation();
    var toPath = typeof to === 'string'
      ? to
      : (to && typeof to.pathname === 'string' ? to.pathname : '/');
    var active = matchRoute(String(toPath || '/'), loc.pathname || '/');
    var merged = typeof cls === 'function' ? cls({ isActive: active }) : ((cls || '') + (active ? ' active' : ''));
    return React.createElement(Link, Object.assign({}, p, { to: toPath, className: merged }));
  }

  return {
    BrowserRouter: RouterShell,
    HashRouter: RouterShell,
    MemoryRouter: RouterShell,
    Router: RouterShell,
    Routes: Routes,
    Route: Route,
    Link: Link,
    NavLink: NavLink,
    Outlet: function() { return null; },
    Navigate: function(props) { navigate(props && props.to ? props.to : '/'); return null; },
    useNavigate: function() { return navigate; },
    useParams: function() { return React.useContext(ParamsCtx); },
    useLocation: useLocation,
    useSearchParams: function() { return [new URLSearchParams(), function() {}]; },
  };
})();
${isNextApp ? NEXT_RUNTIME_SHIMS : ""}
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
  ${tailwindScripts}
  <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <!-- crossorigin on all CDN scripts: without it, runtime errors that surface
       through cross-origin code (notably Babel-executed output) are masked as
       the useless "Script error." — with it, real messages reach the console
       bridge. unpkg + jsdelivr both send Access-Control-Allow-Origin: *. -->
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js" crossorigin
    onerror="(function(){var s=document.createElement('script');s.src='https://unpkg.com/@babel/standalone/babel.min.js';s.crossOrigin='anonymous';document.head.appendChild(s);})();"></script>
  <!-- lucide-react and recharts use inline stubs below; their browser bundles
       are optional and have caused preview-blocking CDN/runtime errors. -->
  <!-- react-router-dom UMD requires react-router + @remix-run/router peers — loading it
       without those deps overwrote our function stubs with broken module objects
       ("Element type is invalid: got: object"). In-preview routing uses __reactRouterDom stubs. -->
  <script async src="https://cdn.jsdelivr.net/npm/react-hook-form@7/dist/index.umd.js" crossorigin
    onload="window.__reactHookForm=window.__reactHookForm||{};if(window.ReactHookForm)Object.assign(window.__reactHookForm,window.ReactHookForm);"
    onerror="console.warn('[preview] react-hook-form CDN failed — using stubs');"></script>
  <script async src="https://cdn.jsdelivr.net/npm/zod@3/lib/index.umd.js" crossorigin
    onload="if(window.Zod)window.__zod=window.Zod;"
    onerror="console.warn('[preview] zod CDN failed — using stubs');"></script>
  <script async src="https://cdn.jsdelivr.net/npm/date-fns@3/cdn.min.js" crossorigin
    onload="window.__dateFns=window.dateFns||{};"
    onerror="window.__dateFns={};"></script>
  <style${styleTypeAttr}>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${inlineCss}
  </style>
  ${fallbackUtilityCss ? `<style id="lifemark-fallback-utils">\n${fallbackUtilityCss}\n</style>` : ""}
</head>
<body>
  <div id="root"></div>
  ${viteEnvScript}
  ${nextEnvScript}
  ${consoleBridge}
  ${moduleRegistry}
  ${fileScripts}
  <script>
  (function() {
    function showError(file, msg, err) {
      var text = String(msg == null ? '' : msg);
      try {
        window.parent.postMessage({
          source: 'lifemark-preview-errors',
          type: 'preview-error',
          kind: 'runtime',
          message: text,
          extra: {
            filename: file,
            stack: err && err.stack ? String(err.stack) : ''
          },
          url: location.href,
          timestamp: Date.now()
        }, '*');
      } catch (e) {}
      try { console.error('[preview] ' + file + ': ' + msg); } catch (e) {}
      var esc = text.replace(/[&<>]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
      });
      var root = document.getElementById('root');
      if (root) root.innerHTML =
        '<div style="padding:24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'color:#f43f5e;background:#0a0a0f;min-height:100vh;white-space:pre-wrap;font-size:13px;line-height:1.6">' +
        '<div style="font-weight:700;margin-bottom:8px">\\u26A0 Error in ' + file + '</div>' + esc + '</div>';
    }
    function run() {
      if (typeof Babel === 'undefined') { showError('preview', 'Babel failed to load — check your network connection.'); return; }
      // Dedupe createRoot per container: generated src/main.tsx mounts the app
      // itself AND the bootstrap below renders the entry — two createRoot calls
      // on #root warn "container already passed to createRoot". Returning a
      // cached root makes both share one (whoever renders last wins; same App).
      try {
        if (ReactDOM && ReactDOM.createRoot && !ReactDOM.__patched) {
          var _origCreateRoot = ReactDOM.createRoot.bind(ReactDOM);
          ReactDOM.createRoot = function (c) {
            if (!c) return _origCreateRoot(c);
            if (!c.__lifemarkRoot) c.__lifemarkRoot = _origCreateRoot(c);
            return c.__lifemarkRoot;
          };
          ReactDOM.__patched = true;
        }
      } catch (e) {}
      var mods = document.querySelectorAll('script[type="text/lifemark-module"]');
      for (var i = 0; i < mods.length; i++) {
        var el = mods[i];
        var file = el.getAttribute('data-file') || ('module ' + i);
        var code;
        // Compile generated files as TypeScript, enabling JSX only for files
        // that can actually contain JSX. Babel standalone removed the older
        // allExtensions/isTSX switches; ignoreExtensions keeps parsing stable.
        try {
          // Plain .ts files must not get syntax-jsx because generic arrows
          // like <T,>(x:T)=>x would be parsed as JSX.
          var __isTSX = !/\\.ts$/.test(file);
          code = Babel.transform(el.textContent, {
            presets: [
              ['react', { runtime: 'classic' }],
              ['typescript', { ignoreExtensions: true }],
            ],
            plugins: __isTSX ? ['syntax-jsx'] : [],
            sourceType: 'unambiguous',
            filename: file,
          }).code;
        } catch (err) { showError(file, (err && err.message) || err, err); return; }
        // Execute in an isolated IIFE so per-file const/let can't collide; cross
        // file linkage goes through window.__M (define/require), not scope.
        try {
          (0, eval)('(function(){"use strict";\\n' + code + '\\n})()');
        } catch (err) { showError(file, (err && err.message) || err, err); return; }
      }
      try {
        var mod = window.__Mrequire('${entryPath}');
        var _entry = mod && (mod.default !== undefined ? mod.default : mod);
        var AppComp = typeof _entry === 'function' ? _entry : null;
        if (!AppComp) { showError('${entryPath}', 'No default export (App component) found.'); return; }
        // Reliability guard: a single undefined component (bad import or a
        // default/named export mismatch, or a member of an unshimmed dep) must
        // NOT throw React #130 and freeze the whole preview. Render a visible
        // placeholder + warn instead, so the rest of the app still shows.
        if (window.React && !React.__lmGuarded) {
          var __lmOrigCreate = React.createElement;
          var __lmMissingCount = 0;
          function __LmMissing() {
            __lmMissingCount++;
            return __lmOrigCreate('span', { style: { display: 'inline-block', padding: '1px 6px', margin: '2px', border: '1px dashed #f59e0b', borderRadius: '4px', color: '#b45309', background: '#fffbeb', font: '11px ui-monospace, monospace' } }, '\\u26A0 missing component');
          }
          React.createElement = function(type) {
            if (type === undefined || type === null) {
              try { console.warn('[preview] Rendered an undefined component — likely a bad import or a default/named export mismatch.'); } catch (e) {}
              var rest = Array.prototype.slice.call(arguments, 1);
              return __lmOrigCreate.apply(React, [__LmMissing].concat(rest));
            }
            return __lmOrigCreate.apply(React, arguments);
          };
          React.__lmGuarded = true;
          window.__lmMissingCount = function() { return __lmMissingCount; };
        }
        var root = ReactDOM.createRoot(document.getElementById('root'));
        // Catch render-time crashes (e.g. foo.bar.charAt on undefined) so the
        // iframe shows a fixable overlay instead of a white blank page.
        var PreviewErrorBoundary = (function() {
          function Boundary(props) {
            this.props = props;
            this.state = { error: null };
          }
          Boundary.prototype = Object.create(React.Component.prototype);
          Boundary.prototype.constructor = Boundary;
          Boundary.prototype.getDerivedStateFromError = function(error) {
            return { error: error };
          };
          // React 17/18 class API
          Boundary.getDerivedStateFromError = function(error) {
            return { error: error };
          };
          Boundary.prototype.componentDidCatch = function(error, info) {
            var extra = (info && info.componentStack) ? ('\\n' + String(info.componentStack)) : '';
            try {
              showError('${entryPath}', ((error && error.message) || String(error)) + extra, error);
            } catch (e) {}
          };
          Boundary.prototype.render = function() {
            if (this.state && this.state.error) {
              var msg = (this.state.error && this.state.error.message) || String(this.state.error);
              return React.createElement('div', {
                style: {
                  minHeight: '100vh',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontFamily: 'ui-sans-serif, system-ui, sans-serif'
                }
              }, React.createElement('div', { style: { maxWidth: 560 } },
                React.createElement('div', { style: { color: '#f87171', fontWeight: 600, marginBottom: 8 } }, 'Preview crashed'),
                React.createElement('pre', {
                  style: {
                    whiteSpace: 'pre-wrap',
                    fontSize: 12,
                    lineHeight: 1.5,
                    background: '#1e293b',
                    padding: 12,
                    borderRadius: 8,
                    color: '#fecaca'
                  }
                }, msg),
                React.createElement('p', { style: { marginTop: 12, fontSize: 12, color: '#94a3b8' } },
                  'Ask the AI to fix this runtime error, or check the console for details.')
              ));
            }
            return this.props.children;
          };
          return Boundary;
        })();
        root.render(
          React.createElement(React.StrictMode, null,
            React.createElement(PreviewErrorBoundary, null,
              React.createElement(AppComp)
            )
          )
        );
        function refreshTailwind() {
          try {
            if (typeof tailwind !== 'undefined' && typeof tailwind.refresh === 'function') {
              tailwind.refresh();
            }
          } catch (e) {}
        }
        refreshTailwind();
        requestAnimationFrame(refreshTailwind);
        setTimeout(refreshTailwind, 0);
        setTimeout(refreshTailwind, 100);
        setTimeout(refreshTailwind, 400);
        setTimeout(function() {
          var counted = (typeof window.__lmMissingCount === 'function') ? window.__lmMissingCount() : 0;
          var domHits = (((document.body && document.body.innerText) || '').match(/\\u26A0 missing component|missing component/gi) || []).length;
          var missing = Math.max(counted, domHits);
          if (missing > 0) {
            var mods = window.__lmMissingModules || [];
            var modDetail = mods.length ? (' Missing module path(s): ' + mods.join(', ') + '.') : '';
            try {
              window.parent.postMessage({
                source: 'lifemark-preview-errors',
                type: 'preview-error',
                kind: 'runtime',
                message: missing + ' component(s) failed to resolve (shown as \\u26A0 missing component).' + modDetail + ' Check imports/exports or create the missing file(s).',
                extra: { filename: '${entryPath}' },
                url: location.href,
                timestamp: Date.now()
              }, '*');
              window.parent.postMessage({
                source: 'lifemark-preview',
                type: 'error',
                text: missing + ' component(s) failed to resolve (shown as \\u26A0 missing component).' + modDetail + ' Check imports/exports or create the missing file(s).'
              }, '*');
            } catch (e) {}
            return;
          }
          try { window.parent.postMessage({ source: 'lifemark-preview', type: 'success', text: 'render ok' }, '*'); } catch (e) {}
        }, 600);
      } catch (err) { showError('${entryPath}', (err && err.message) || err, err); }
    }
    function tailwindRuntimeReady() {
      if (window.__twBrowserV4 && window.__twLoaded) return true;
      return typeof tailwind !== 'undefined';
    }
    function whenRuntimeReady(cb) {
      var attempts = 0;
      (function poll() {
        attempts++;
        if (tailwindRuntimeReady() || window.__twError || attempts > 100) { cb(); return; }
        setTimeout(poll, 50);
      })();
    }
    function boot() { whenRuntimeReady(run); }
    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot);
  })();
  </script>

  <!-- URL sync — keeps the parent's address bar aligned with the in-iframe
       location. Three triggers:
         1. Initial mount: post the current pathname once.
         2. history.pushState / replaceState patches: post on every nav.
         3. popstate (back/forward + programmatic): post.
       And one inbound:
         4. lifemark-preview-navigate from parent → history.pushState
            + dispatchEvent(popstate) so react-router re-renders. -->
  <script>
  (function() {
    function reportLocation() {
      try {
        // This document is a srcdoc iframe (about:srcdoc → pathname "srcdoc")
        // and the in-preview router routes off a VIRTUAL hash path (#/route).
        // Report that virtual path — reporting window.location.pathname put a
        // literal "srcdoc" in the editor's address bar.
        var h = window.location.hash || '';
        var path = '/';
        if (h.length > 1) {
          var raw = String(h.slice(1) || '');
          path = raw.charAt(0) === '/' ? raw : '/' + raw;
        }
        window.parent.postMessage({
          type: 'lifemark-preview-location',
          pathname: path,
          origin: window.location.origin,
          href: window.location.href,
        }, '*');
      } catch (e) {}
    }

    // Liveness handshake — the same contract the sandbox bridge speaks (see
    // veb-bridge.ts). The parent pings after every iframe load and reads
    // silence as "this frame navigated away from the app". Without an answer
    // here, a fallback preview that had reported a location once would be
    // mistaken for an escaped frame on its next load and reset to "/".
    window.addEventListener('message', function (e) {
      var d = e && e.data;
      if (!d || typeof d !== 'object' || d.type !== 'lifemark-preview-ping') return;
      try {
        window.parent.postMessage({
          type: 'lifemark-preview-pong',
          token: d.token,
          origin: window.location.origin,
          href: window.location.href,
        }, '*');
      } catch (err) {}
    });

    // Patch history methods so SPA navigations are observable.
    var origPush = window.history.pushState;
    var origReplace = window.history.replaceState;
    window.history.pushState = function() {
      origPush.apply(this, arguments);
      reportLocation();
    };
    window.history.replaceState = function() {
      origReplace.apply(this, arguments);
      reportLocation();
    };
    window.addEventListener('popstate', reportLocation);
    // The in-preview router routes off location.hash (#/route); report on hash
    // changes too so the parent address bar stays in sync.
    window.addEventListener('hashchange', reportLocation);

    // Inbound navigation requests from the parent address bar. The in-preview
    // router reads location.hash, so drive navigation via the hash (not the real
    // pathname, which is the /preview/<id> host path).
    window.addEventListener('message', function(e) {
      if (!e.data || e.data.type !== 'lifemark-preview-navigate') return;
      var next = e.data.pathname || '/';
      try {
        // Strip any scheme/host (preview://… or http://…) and existing hash.
        if (/^[a-z][a-z0-9+.-]*:\\/\\//i.test(next)) {
          try { next = new URL(next).pathname; } catch (e2) {}
        }
        if (next.indexOf('#') >= 0) next = next.slice(next.indexOf('#') + 1);
        if (!next) next = '/';
        next = String(next || '/');
        if (next.charAt(0) !== '/') next = '/' + next;
        if (window.location.hash !== '#' + next) {
          window.location.hash = next; // fires hashchange → router re-renders
        }
      } catch (err) {}
    });

    // Initial report — small delay so React has mounted and any redirects
    // settled before we send the first pathname.
    setTimeout(reportLocation, 50);
  })();
  </script>

  <!-- Network panel — fetch interceptor for preview devtools -->
  <script>
  (function() {
    if (window.parent === window) return;
    var _fetch = window.fetch;
    window.fetch = function(input, init) {
      var method = ((init && init.method) || 'GET').toUpperCase();
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var start = Date.now();
      function postNet(extra) {
        try {
          window.parent.postMessage(Object.assign({
            source: 'lifemark-preview-network',
            method: method,
            url: url,
            durationMs: Date.now() - start
          }, extra || {}), '*');
        } catch (e) {}
      }
      return _fetch.apply(this, arguments).then(function(res) {
        var ct = '';
        try { ct = res.headers.get('content-type') || ''; } catch (e) {}
        postNet({ status: res.status, ok: res.ok, contentType: ct });
        return res;
      }).catch(function(err) {
        postNet({ status: 0, ok: false, error: String((err && err.message) || err) });
        throw err;
      });
    };
    if (window.XMLHttpRequest) {
      var _XHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        var xhr = new _XHR();
        var method = 'GET';
        var url = '';
        var start = 0;
        var _open = xhr.open;
        xhr.open = function(m, u) {
          method = String(m || 'GET').toUpperCase();
          url = String(u || '');
          return _open.apply(xhr, arguments);
        };
        xhr.addEventListener('loadend', function() {
          try {
            window.parent.postMessage({
              source: 'lifemark-preview-network',
              method: method,
              url: url,
              status: xhr.status,
              ok: xhr.status >= 200 && xhr.status < 400,
              durationMs: start ? (Date.now() - start) : 0,
              contentType: xhr.getResponseHeader('content-type') || ''
            }, '*');
          } catch (e) {}
        });
        var _send = xhr.send;
        xhr.send = function() {
          start = Date.now();
          return _send.apply(xhr, arguments);
        };
        return xhr;
      };
    }
  })();
  </script>

  <!-- Performance snapshot for preview devtools -->
  <script>
  ${PREVIEW_PERF_SCRIPT}
  </script>

  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" async></script>
  <script>
  (function() {
    window.addEventListener('message', function(e) {
      if (!e.data || e.data.type !== 'lifemark-capture') return;
      var msgId = e.data.messageId;
      var src = e.source;
      function doCapture() {
        if (typeof html2canvas !== 'undefined') {
          html2canvas(document.documentElement, {
            scale: 0.4, useCORS: true, logging: false,
            width: 800, height: 600, windowWidth: 800, windowHeight: 600
          }).then(function(canvas) {
            var dataUrl = canvas.toDataURL('image/jpeg', 0.72);
            src.postMessage({ type: 'lifemark-screenshot', messageId: msgId, dataUrl: dataUrl }, '*');
          }).catch(function() {
            src.postMessage({ type: 'lifemark-screenshot', messageId: msgId, dataUrl: null }, '*');
          });
        } else {
          setTimeout(doCapture, 400);
        }
      }
      setTimeout(doCapture, 800);
    });
  })();
  </script>
</body>
</html>`;
}

export function buildDiagnosticHtml(title: string, detail: string): string {
  // Plain-text escape so file paths with HTML chars don't break the doc.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html><head><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-950 flex items-center justify-center min-h-screen p-6">
  <div class="max-w-lg text-center">
    <div class="text-4xl mb-3">⚠️</div>
    <p class="text-amber-300 font-medium mb-2">${esc(title)}</p>
    <p class="text-sm text-slate-400 leading-relaxed mb-4">${esc(detail)}</p>
    <p class="text-xs text-slate-600">Open the Code tab to inspect what was generated, or ask the AI to rename the entry file to App.tsx.</p>
  </div>
</body></html>`;
}

export const EMPTY_PREVIEW_HTML = `<!DOCTYPE html>
<html><head><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-950 flex items-center justify-center min-h-screen">
  <div class="text-center text-slate-500">
    <div class="text-5xl mb-4">⚡</div>
    <p class="text-slate-300 font-medium">Your preview will appear here</p>
    <p class="text-sm mt-2">Start chatting with the AI to build your app</p>
  </div>
</body></html>`;
