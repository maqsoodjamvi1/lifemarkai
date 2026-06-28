import type { ProjectFile } from "@/types/database";
import { generateFallbackUtilityCss } from "@/lib/preview/generate-fallback-utilities";

/** Bump when preview transform logic changes — forces iframe remount in editor. */
export const PREVIEW_ENGINE_REV = "22";

/** Strip PostCSS-only directives — invalid in a raw <style> tag. */
export function sanitizePreviewCss(css: string): string {
  return css
    .replace(/@tailwind\s+[^;]+;/g, "")
    .replace(/@import\s+["'][^"']*tailwindcss[^"']*["']\s*;?/gi, "")
    .replace(/@apply\s+[^;]+;/g, "")
    .trim();
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

const SHADCN_TAILWIND_CDN_CONFIG = `tailwind.config = {
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
  // Static HTML project — serve as-is
  const indexHtml = files.find(
    (f) => f.path === "index.html" || f.path === "/index.html"
  );
  if (
    indexHtml?.content &&
    !indexHtml.content.includes("src/main.tsx") &&
    !indexHtml.content.includes('type="module"')
  ) {
    return indexHtml.content;
  }

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
    if (/(^|\/)app\.(tsx|jsx)$/.test(s)) return 5; // entry — render root, last
    if (/\/pages?\//.test(s)) return 4;
    if (/\/components?\//.test(s)) return 3;
    if (
      /\/(lib|utils?|types?|constants?|data|hooks?|context|contexts|store|stores|config|services?|api|helpers?)\//.test(s) ||
      /(^|\/)(types?|utils?|constants?|helpers?)\.(t|j)sx?$/.test(s)
    ) return 1; // leaf/dependency modules first
    return 2; // everything else between leaves and components
  };
  const sorted = [...codeFiles].sort((a, b) => {
    const ra = loadRank(a.path), rb = loadRank(b.path);
    if (ra !== rb) return ra - rb;
    return a.path.localeCompare(b.path);
  });

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

  /** Default import binding — {} from a failed require is NOT a valid component. */
  const defaultImportExpr = (modVar: string, binding: string) =>
    `const ${binding} = (function(){var m=${modVar};var c=m&&(m.default!==undefined?m.default:m);return typeof c==='function'?c:function(){return null;};})();`;

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
    let importTempCounter = 0;
    const tempModuleVar = (prefix: string, key: string) =>
      `${prefix}_${key.replace(/[^a-zA-Z0-9]/g, "_")}_${importTempCounter++}`;

    // Strip comments (string-aware) BEFORE any import rewriting, so import-like
    // text or backticks inside comments can't be mangled into broken code.
    src = stripCommentsSafe(src);

    // Strip CSS / asset imports
    src = src.replace(/import\s+['"][^'"]+\.css['"]\s*;?\n?/g, "");
    // Strip import type
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

    // Collect names declared via export const/let/var/function/class
    const namedExports: string[] = [];
    src = src.replace(
      /export\s+(async\s+)?(const|let|var|function|class)\s+([\w$]+)/g,
      (_, asyncKw: string | undefined, kw: string, name: string) => {
        namedExports.push(name);
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

    // export { A, B as C }
    src = src.replace(
      /export\s+\{([^}]+)\}\s*;?\n?/g,
      (_, names: string) => {
        const entries = names
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .map((n) => {
            const [orig, alias] = n.split(/\s+as\s+/).map((s) => s.trim());
            return alias ? `${alias}: ${orig}` : `${n}: ${n}`;
          })
          .join(", ");
        namedExports.push(`...({${entries}})`);
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
      const safeEntries = namedExports
        .filter((n) => !n.startsWith("..."))
        .map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`)
        .join(", ");
      if (safeEntries) {
        src += `\ntry { window.__Mdefine('${file.path}', Object.assign(window.__M['${file.path}'] || {}, { ${safeEntries} })); window.__Mdefine('${shortPath}', window.__M['${file.path}']); } catch(e) {}\n`;
      }
    }

    // Inert script type — the browser ignores it and Babel's auto-runner skips
    // it. The bootstrap below compiles it explicitly with isTSX/allExtensions
    // (which `data-presets="typescript"` does NOT enable — that was the
    // "Unexpected token" on every TSX type annotation), isolated per file.
    // Guard against a literal </script> inside string content breaking the tag.
    const safeSrc = src.replace(/<\/script>/gi, "<\\/script>");
    return `<script type="text/lifemark-module" data-file="${file.path}">\n${safeSrc}\n</script>`;
  }

  const fileScripts = sorted.map(wrapFile).join("\n\n");

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
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); }
    }).join(' ');
    text = nameScript(text);
    try { window.parent.postMessage({ source: 'lifemark-preview', type: type, text: text }, '*'); } catch(e) {}
  }
  console.log   = function() { _log.apply(console, arguments);  relay('log',   arguments); };
  console.warn  = function() { _warn.apply(console, arguments); relay('warn',  arguments); };
  console.error = function() { _err.apply(console, arguments);  relay('error', arguments); };
  window.addEventListener('error', function(e) {
    relay('error', [(e.message || 'Unknown error') + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : '')]);
  });
  window.addEventListener('unhandledrejection', function(e) {
    relay('error', ['Unhandled promise rejection: ' + (e.reason?.message || String(e.reason))]);
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
  var candidates = [path, norm, 'src/' + norm.replace(/^src\\//, ''), norm + '.tsx', norm + '.jsx'];
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
  // Data fetching
  if (path === '@tanstack/react-query' || path === 'react-query') return window.__reactQuery || {};
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
  return {};
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
  var listeners = [];

  // The preview iframe is served at /preview/<id>, so window.location.pathname is
  // NOT the app's route ("/"). Route off a VIRTUAL path kept in the URL hash
  // (#/services) instead — it starts at "/" so index routes match on load, and
  // it never collides with the preview host path or 404s on reload.
  function currentVirtualPath() {
    var h = window.location.hash || '';
    if (h.length > 1) {
      var raw = h.slice(1); // drop leading '#'
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
    var path = typeof to === 'string' ? to : (to && to.pathname ? to.pathname : '/');
    if (!path.startsWith('/')) path = '/' + path;
    try {
      window.history.pushState({}, '', '#' + path);
      notify();
    } catch (e) {}
  }

  function matchRoute(pattern, pathname) {
    if (pattern == null || pattern === '*') return pathname === '/' || pathname === '';
    if (pattern === '/') return pathname === '/' || pathname === '';
    if (pattern.endsWith('/*')) {
      var base = pattern.slice(0, -2);
      return pathname === base || pathname.indexOf(base + '/') === 0;
    }
    return pattern === pathname;
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
      if (matchRoute(p, pathname)) return r.props.element || null;
    }
    if ((pathname === '/' || pathname === '') && indexEl) return indexEl;
    return null;
  }

  function Route() { return null; }

  function Link(props) {
    var p = Object.assign({}, props);
    var to = p.to || '/';
    delete p.to;
    var hrefTo = typeof to === 'string' ? to : (to && to.pathname ? to.pathname : '/');
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
    var to = p.to || '/';
    var cls = p.className;
    delete p.to; delete p.className;
    var loc = useLocation();
    var active = matchRoute(to, loc.pathname || '/');
    var merged = typeof cls === 'function' ? cls({ isActive: active }) : ((cls || '') + (active ? ' active' : ''));
    return React.createElement(Link, Object.assign({}, p, { to: to, className: merged }));
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
    useParams: function() { return {}; },
    useLocation: useLocation,
    useSearchParams: function() { return [new URLSearchParams(), function() {}]; },
  };
})();
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
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js" crossorigin></script>
  <!-- lucide-react and recharts use inline stubs below; their browser bundles
       are optional and have caused preview-blocking CDN/runtime errors. -->
  <!-- react-router-dom UMD requires react-router + @remix-run/router peers — loading it
       without those deps overwrote our function stubs with broken module objects
       ("Element type is invalid: got: object"). In-preview routing uses __reactRouterDom stubs. -->
  <script async src="https://cdn.jsdelivr.net/npm/react-hook-form@7/dist/index.umd.js" crossorigin
    onload="if(window.ReactHookForm)Object.assign(window.__reactHookForm,window.ReactHookForm);"
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
  ${consoleBridge}
  ${moduleRegistry}
  ${fileScripts}
  <script>
  (function() {
    function showError(file, msg) {
      try { console.error('[preview] ' + file + ': ' + msg); } catch (e) {}
      var esc = String(msg == null ? '' : msg).replace(/[&<>]/g, function (c) {
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
        } catch (err) { showError(file, (err && err.message) || err); return; }
        // Execute in an isolated IIFE so per-file const/let can't collide; cross
        // file linkage goes through window.__M (define/require), not scope.
        try {
          (0, eval)('(function(){"use strict";\\n' + code + '\\n})()');
        } catch (err) { showError(file, (err && err.message) || err); return; }
      }
      try {
        var mod = window.__Mrequire('${mainFile.path}');
        var _entry = mod && (mod.default !== undefined ? mod.default : mod);
        var AppComp = typeof _entry === 'function' ? _entry : null;
        if (!AppComp) { showError('${mainFile.path}', 'No default export (App component) found.'); return; }
        var root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(React.StrictMode, null, React.createElement(AppComp)));
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
        try { window.parent.postMessage({ source: 'lifemark-preview', type: 'success', text: 'render ok' }, '*'); } catch (e) {}
      } catch (err) { showError('${mainFile.path}', (err && err.message) || err); }
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
        window.parent.postMessage({
          type: 'lifemark-preview-location',
          pathname: window.location.pathname + window.location.search + window.location.hash,
        }, '*');
      } catch (e) {}
    }

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
