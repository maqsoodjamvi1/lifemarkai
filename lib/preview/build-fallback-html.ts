import type { ProjectFile } from "@/types/database";

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

  // Sort so dependency files come before entry points
  const sorted = [...codeFiles].sort((a, b) => {
    const isEntry = (p: string) =>
      p.includes("App.") || p === "src/index.tsx" || p === "src/main.tsx";
    return (isEntry(a.path) ? 1 : 0) - (isEntry(b.path) ? 1 : 0);
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

  const inlineCss = cssFiles.map((f) => f.content ?? "").join("\n");

  /** Transform one source file into a self-contained Babel script block */
  function wrapFile(file: ProjectFile): string {
    let src = file.content ?? "";

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

    // Strip CSS / asset imports
    src = src.replace(/import\s+['"][^'"]+\.css['"]\s*;?\n?/g, "");
    // Strip import type
    src = src.replace(/import\s+type\s+[^\n;]+;?\n?/g, "");

    // import React[, { ... }] from 'react'
    src = src.replace(
      /import\s+React\s*,?\s*(?:\{([^}]*)\})?\s*from\s+['"]react['"]\s*;?\n?/g,
      (_, named?: string) =>
        named?.trim() ? `const { ${named.trim()} } = React;\n` : ""
    );
    // import { ... } from 'react'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = React;\n`
    );

    // import X from 'react-dom[/client]'
    src = src.replace(
      /import\s+(\w+)\s+from\s+['"]react-dom(?:\/client)?['"]\s*;?\n?/g,
      (_, name: string) => `const ${name} = ReactDOM;\n`
    );
    // import { ... } from 'react-dom[/client]'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react-dom(?:\/client)?['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = ReactDOM;\n`
    );

    // import { ... } from 'lucide-react'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]\s*;?\n?/g,
      (_, named: string) =>
        `const { ${named.trim()} } = window.__lucideReact || {};\n`
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
        `const { ${named.trim()} } = window.__framerMotion || {};\n`
    );

    // import { ... } from 'recharts'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]recharts['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = window.__recharts || {};\n`
    );
    // import * as X from 'recharts'
    src = src.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]recharts['"]\s*;?\n?/g,
      (_, name: string) => `const ${name} = window.__recharts || {};\n`
    );

    // import { ... } from 'react-router-dom'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react-router(?:-dom)?['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = window.__reactRouterDom || {};\n`
    );

    // import { ... } from '@tanstack/react-query'  or  'react-query'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"](?:@tanstack\/)?react-query['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = window.__reactQuery || {};\n`
    );

    // import { ... } from 'react-hook-form'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react-hook-form['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = window.__reactHookForm || {};\n`
    );

    // import { z } / import * as z from 'zod' / import { z, ZodSchema } from 'zod'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]zod['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = window.__zod ? Object.assign({ z: window.__zod }, window.__zod) : {};\n`
    );
    src = src.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]zod['"]\s*;?\n?/g,
      (_, name: string) => `const ${name} = window.__zod || {};\n`
    );

    // import { format, ... } from 'date-fns'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]date-fns(?:\/[^'"]*)?['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = window.__dateFns || {};\n`
    );

    // import { clsx } from 'clsx'  /  import clsx from 'clsx'
    src = src.replace(
      /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]clsx['"]\s*;?\n?/g,
      (_, named: string | undefined, def: string | undefined) =>
        named ? `const { ${named.trim()} } = { clsx: window.__clsx };\n`
              : `const ${def} = window.__clsx;\n`
    );

    // import { twMerge } from 'tailwind-merge' / import { cn } from ...
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]tailwind-merge['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = { twMerge: window.__twMerge, merge: window.__twMerge };\n`
    );

    // import { cva, ... } from 'class-variance-authority'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]class-variance-authority['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = { cva: window.__cva, cx: window.__clsx };\n`
    );

    // import { toast, Toaster } from 'sonner'  /  'react-hot-toast'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]sonner['"]\s*;?\n?/g,
      (_, named: string) => `const { ${named.trim()} } = window.__sonner || {};\n`
    );
    src = src.replace(
      /import\s+(?:(\w+)|\{([^}]+)\})\s*,?\s*(?:\{([^}]+)\})?\s*from\s+['"]react-hot-toast['"]\s*;?\n?/g,
      (_, def: string | undefined, named1: string | undefined, named2: string | undefined) => {
        const lines: string[] = [];
        if (def) lines.push(`const ${def} = window.__reactHotToast?.default || window.__reactHotToast || function(){};`);
        const named = named1 || named2;
        if (named) lines.push(`const { ${named.trim()} } = window.__reactHotToast || {};`);
        return lines.join("\n") + "\n";
      }
    );

    // Relative imports — default + named: import Foo, { Bar } from './path'
    src = src.replace(
      /import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, def: string, named: string, path: string) => {
        const v = `__mod_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
        return [
          `const ${v} = window.__Mrequire('${path}');`,
          `const ${def.trim()} = ${v}.default ?? ${v};`,
          `const { ${named.trim()} } = ${v};`,
        ].join("\n") + "\n";
      }
    );
    // Relative imports — named only: import { Foo, Bar } from './path'
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, named: string, path: string) => {
        const v = `__mod_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
        return [
          `const ${v} = window.__Mrequire('${path}');`,
          `const { ${named.trim()} } = ${v};`,
        ].join("\n") + "\n";
      }
    );
    // Relative imports — default only: import Foo from './path'
    src = src.replace(
      /import\s+(\w+)\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, name: string, path: string) => {
        const v = `__mod_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
        return `const ${v} = window.__Mrequire('${path}'); const ${name} = ${v}.default ?? ${v};\n`;
      }
    );

    // ── GENERIC catch-all imports ───────────────────────────────────────────
    // Any import the specific handlers above didn't claim (unknown packages,
    // "@/…" path aliases, multi-line named imports) is routed through
    // __Mrequire. A leftover `import` statement is a guaranteed SyntaxError in
    // these non-module Babel scripts and takes down the ENTIRE preview — an
    // unknown binding is merely undefined and __Mrequire warns about it.
    const genericRequire = (spec: string) => `window.__Mrequire('${spec.replace(/'/g, "\\'")}')`;
    // `import { A as B }` must become `{ A: B }` in destructuring
    const destructure = (named: string) => named.trim().replace(/\s+as\s+/g, ": ");
    // import * as N from 'x'
    src = src.replace(
      /import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, name: string, spec: string) => `const ${name} = ${genericRequire(spec)};\n`
    );
    // import D, { A, B } from 'x'   (braces may span lines)
    src = src.replace(
      /import\s+([\w$]+)\s*,\s*\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, def: string, named: string, spec: string) => {
        const v = `__gmod_${spec.replace(/[^a-zA-Z0-9]/g, "_")}`;
        return `var ${v} = ${genericRequire(spec)};\nconst ${def} = ${v}.default ?? ${v};\nconst { ${destructure(named)} } = ${v};\n`;
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
        const v = `__gmod_${spec.replace(/[^a-zA-Z0-9]/g, "_")}`;
        return `const ${v} = ${genericRequire(spec)};\nconst ${def} = ${v}.default ?? ${v};\n`;
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

    // Re-exports: export { A, B as C } from './path'
    // MUST run before the plain `export { … }` handler below, which would
    // otherwise eat the brace group and leave a dangling `from './path'`.
    src = src.replace(
      /export\s+\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, names: string, spec: string) => {
        const v = `__re_${spec.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const entries = names
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .map((n) => {
            const [orig, alias] = n.split(/\s+as\s+/).map((s) => s.trim());
            return `${alias ?? orig}: ${v}['${orig}']`;
          })
          .join(", ");
        // `var` (not const) — barrel files often re-export from the same path
        // twice, and a duplicate const declaration is itself a SyntaxError.
        return `var ${v} = window.__Mrequire('${spec}');\ntry { window.__Mdefine('${file.path}', Object.assign(window.__M['${file.path}'] || {}, { ${entries} })); } catch(e) {}\n`;
      }
    );
    // export * from './path'
    src = src.replace(
      /export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?\n?/g,
      (_, spec: string) =>
        `try { window.__Mdefine('${file.path}', Object.assign(window.__M['${file.path}'] || {}, window.__Mrequire('${spec}'))); } catch(e) {}\n`
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
    const shortPath = file.path.replace(/\.(tsx?|jsx?)$/, "");
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
  var norm = path.replace(/^@\\//,'').replace(/^\\.\\//,'').replace(/\\.(tsx?|jsx?)$/,'');
  var candidates = [path, norm, 'src/' + norm, norm.replace(/^src\\//,'')];
  for (var i = 0; i < candidates.length; i++) {
    if (window.__M[candidates[i]]) return window.__M[candidates[i]];
  }
  // React core
  if (path === 'react' || path === 'React') return window.React;
  if (path === 'react-dom' || path === 'react-dom/client') return window.ReactDOM;
  // UI / icons / animation
  if (path === 'lucide-react') return window.__lucideReact || {};
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
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <!-- crossorigin on all CDN scripts: without it, runtime errors that surface
       through cross-origin code (notably Babel-executed output) are masked as
       the useless "Script error." — with it, real messages reach the console
       bridge. unpkg + jsdelivr both send Access-Control-Allow-Origin: *. -->
  <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
  <script src="https://cdn.jsdelivr.net/npm/lucide-react@latest/dist/umd/lucide-react.js" crossorigin
    onload="window.__lucideReact=window.LucideReact||window.lucideReact||window.lucide||{};"
    onerror="window.__lucideReact={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/recharts@2/umd/Recharts.js" crossorigin
    onload="window.__recharts=window.Recharts||{};"
    onerror="window.__recharts={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-router-dom@6/umd/react-router-dom.development.js" crossorigin
    onload="window.__reactRouterDom=window.ReactRouterDOM||{};"
    onerror="window.__reactRouterDom={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/@tanstack/react-query@5/build/umd/index.development.js" crossorigin
    onload="window.__reactQuery=window.ReactQuery||{};"
    onerror="window.__reactQuery={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-hook-form@7/dist/index.umd.js" crossorigin
    onload="window.__reactHookForm=window.ReactHookForm||{};"
    onerror="window.__reactHookForm={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/zod@3/lib/index.umd.js" crossorigin
    onload="window.__zod=window.Zod||{};"
    onerror="window.__zod={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/date-fns@3/cdn.min.js" crossorigin
    onload="window.__dateFns=window.dateFns||{};"
    onerror="window.__dateFns={};"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${inlineCss}
  </style>
</head>
<body>
  <div id="root"></div>
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
        // Compile TSX explicitly: isTSX + allExtensions make preset-typescript
        // strip type annotations / generics / 'type' aliases (auto data-presets
        // does NOT, which produced "Unexpected token" on every typed file).
        try {
          code = Babel.transform(el.textContent, {
            presets: [['react', { runtime: 'classic' }], ['typescript', { isTSX: true, allExtensions: true, allowDeclareFields: true }]],
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
        var AppComp = (mod && mod.default) || null;
        if (!AppComp) { showError('${mainFile.path}', 'No default export (App component) found.'); return; }
        var root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(React.StrictMode, null, React.createElement(AppComp)));
      } catch (err) { showError('${mainFile.path}', (err && err.message) || err); }
    }
    // Wait for window load so the async CDN libs (lucide/recharts/etc.) are ready.
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run);
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

    // Inbound navigation requests from the parent address bar.
    window.addEventListener('message', function(e) {
      if (!e.data || e.data.type !== 'lifemark-preview-navigate') return;
      var next = e.data.pathname || '/';
      try {
        if (next !== window.location.pathname + window.location.search + window.location.hash) {
          window.history.pushState({}, '', next);
          window.dispatchEvent(new PopStateEvent('popstate'));
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