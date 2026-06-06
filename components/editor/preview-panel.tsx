"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  RefreshCw, Smartphone, Tablet, Monitor,
  ExternalLink, MousePointer, Terminal, Loader2,
  Check, X, Wand2, AlignLeft, AlignCenter, AlignRight,
  AlertTriangle, Wrench, Frame, MessageSquarePlus, Pencil,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatePresence, motion } from "framer-motion";
import { VisualEditOverlay } from "./visual-edit-overlay";
import { PreviewAnnotations } from "./preview-annotations";
import { PreviewAnnotateModal } from "./preview-annotate-modal";
import { LifemarkBadge } from "@/components/shared/lifemark-badge";
import type { ProjectFile } from "@/types/database";

// Sandpack stubs — these branches are never reached (sandpackReady is always false)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SandpackProvider = "div" as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SandpackConsoleComp = "div" as any;

// Sandpack dynamic imports kept for type reference but not used at runtime —
// the preview always uses the local srcdoc/Babel engine (sandpackReady=false).
// Removing these would require a larger refactor of the conditional render tree.

// Visual Edit Bridge — injected into Sandpack iframe via files map
const VEB_SCRIPT = `(function() {
  if (window.parent === window) return;
  var style = document.createElement('style');
  style.textContent = [
    '.lm-hover{outline:2px solid #7c3aed!important;outline-offset:2px;cursor:pointer!important}',
    '.lm-selected{outline:2px solid #0e90e8!important;outline-offset:2px}'
  ].join('');
  document.head.appendChild(style);
  var hovered = null;
  function getXPath(el) {
    var parts = [], cur = el;
    while (cur && cur !== document.body) {
      var tag = cur.tagName.toLowerCase();
      var parent = cur.parentElement;
      var sibs = parent ? Array.from(parent.children).filter(function(c){return c.tagName===cur.tagName}) : [cur];
      parts.unshift(sibs.length > 1 ? tag+'['+(sibs.indexOf(cur)+1)+']' : tag);
      cur = parent;
    }
    return '//'+parts.join('/');
  }
  document.addEventListener('mouseover', function(e) {
    if (hovered && hovered !== e.target) hovered.classList.remove('lm-hover');
    hovered = e.target;
    if (hovered) hovered.classList.add('lm-hover');
  });
  document.addEventListener('mouseout', function(e) {
    if (e.target) e.target.classList.remove('lm-hover');
  });
  document.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    var rect = el.getBoundingClientRect();
    document.querySelectorAll('.lm-selected').forEach(function(n){n.classList.remove('lm-selected')});
    el.classList.add('lm-selected');
    window.parent.postMessage({
      source: 'lifemark-veb',
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || '').trim(),
      classList: Array.from(el.classList).filter(function(c){return !c.startsWith('lm-')}),
      xpath: getXPath(el),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }, '*');
  }, true);
})();`;

type DeviceSize = "mobile" | "tablet" | "desktop";

interface VebElement {
  tagName: string;
  textContent: string;
  classList: string[];
  xpath: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface PreviewPanelProps {
  files: ProjectFile[];
  projectId?: string;
  activeFile?: ProjectFile | null;
  isVisualEditActive?: boolean;
  onVisualEditToggle?: () => void;
  onFileUpdate?: (file: ProjectFile) => void;
  onError?: (error: string) => void;
  onFixWithAI?: (error: string) => void;
  /** When true, use WebContainers for preview instead of static bundler */
  useWebContainers?: boolean;
  /** When true, overlay a generation shimmer with file count */
  isGenerating?: boolean;
  /** Number of files currently being written by the AI */
  generatingFileCount?: number;
  /** Live deployed URL — used by Open in new tab */
  deployedUrl?: string;
  /** When true, the "Built with LifemarkAI" badge is hidden (Pro feature) */
  badgeHidden?: boolean;
  /** Send annotated screenshot + prompt to chat */
  onSendAnnotatedToChat?: (prompt: string, imageBase64: string) => void;
}

const DEVICE_WIDTHS: Record<DeviceSize, string> = {
  mobile: "390px",
  tablet: "768px",
  desktop: "100%",
};

const TAILWIND_SIZES = ["text-xs","text-sm","text-base","text-lg","text-xl","text-2xl","text-3xl","text-4xl"];
const TAILWIND_WEIGHTS = ["font-normal","font-medium","font-semibold","font-bold","font-extrabold"];
const TAILWIND_COLORS = [
  "text-white","text-black","text-gray-500","text-red-500",
  "text-blue-500","text-green-500","text-yellow-500","text-purple-500",
];
const BG_COLORS = [
  "bg-transparent","bg-white","bg-black","bg-gray-100",
  "bg-blue-500","bg-green-500","bg-red-500","bg-yellow-500",
];

function detectTemplate(files: ProjectFile[]): "react-ts" | "react" | "static" {
  const paths = files.map((f) => f.path);
  if (paths.some((p) => p.endsWith(".tsx") || p.endsWith(".ts"))) return "react-ts";
  if (paths.some((p) => p.endsWith(".jsx"))) return "react";
  return "static";
}

function toSandpackFiles(files: ProjectFile[]): Record<string, { code: string }> {
  const map: Record<string, { code: string }> = {};
  for (const f of files) {
    let sp = f.path.startsWith("/") ? f.path : `/${f.path}`;
    sp = sp.replace(/^\/src\//, "/");
    map[sp] = { code: f.content ?? "" };
  }
  if (!map["/index.css"] && !map["/styles.css"]) {
    map["/index.css"] = { code: "@tailwind base;\n@tailwind components;\n@tailwind utilities;" };
  }
  return map;
}

function addVebBridge(
  files: Record<string, { code: string }>
): Record<string, { code: string }> {
  const result = { ...files };
  // Inject the bridge script file
  result["/__veb.js"] = { code: VEB_SCRIPT };
  // Inject into index.html (used by static template) or public/index.html (react template)
  const htmlKey = result["/public/index.html"] ? "/public/index.html"
    : result["/index.html"] ? "/index.html"
    : null;
  if (htmlKey) {
    result[htmlKey] = {
      code: result[htmlKey].code.replace("</body>", '<script src="/__veb.js"></script></body>'),
    };
  } else {
    // Provide a custom index.html that includes the bridge
    result["/public/index.html"] = {
      code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
</head>
<body>
  <div id="root"></div>
  <script src="/__veb.js"></script>
</body>
</html>`,
    };
  }
  return result;
}

/**
 * Build a self-contained HTML preview for a multi-file React/TS project.
 *
 * Strategy:
 *  - All project CSS is inlined as <style>
 *  - React 18, ReactDOM, Babel standalone, and Tailwind CDN are loaded from CDN
 *  - Each TS/TSX/JSX file becomes a <script type="text/babel"> block
 *  - A lightweight module registry (window.__M / __Mdefine / __Mrequire) handles
 *    relative imports between files so multi-file apps work correctly
 *  - A console bridge relays log/warn/error messages to the parent frame
 */
function buildFallbackHtml(files: ProjectFile[]): string {
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
    if (files.length === 0) return EMPTY_HTML;
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

const EMPTY_HTML = `<!DOCTYPE html>
<html><head><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-950 flex items-center justify-center min-h-screen">
  <div class="text-center text-slate-500">
    <div class="text-5xl mb-4">⚡</div>
    <p class="text-slate-300 font-medium">Your preview will appear here</p>
    <p class="text-sm mt-2">Start chatting with the AI to build your app</p>
  </div>
</body></html>`;

/**
 * Render a diagnostic placeholder when files exist but the build pipeline
 * can't produce a runnable preview. Lets the user (and us) see WHY the
 * preview is blank instead of the generic "Start chatting" placeholder
 * which falsely implies no files were generated.
 */
function buildDiagnosticHtml(title: string, detail: string): string {
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

// ── Device frame components ───────────────────────────────────────────────────

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-full py-4">
      {/* Outer bezel */}
      <div
        className="relative flex flex-col rounded-[44px] overflow-hidden shadow-[0_0_0_2px_#3a3a3c,0_0_0_8px_#1c1c1e,0_20px_60px_rgba(0,0,0,0.7)]"
        style={{ width: 390, height: 812, background: "#000", flexShrink: 0 }}
      >
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-20 flex items-center justify-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]" />
          <div className="w-3.5 h-3.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]" />
        </div>
        {/* Status bar */}
        <div className="relative z-10 flex items-center justify-between px-8 pt-4 pb-1 text-white bg-transparent pointer-events-none">
          <span className="text-[13px] font-semibold">9:41</span>
          <div className="flex items-center gap-1.5 text-white">
            <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" opacity="0.9"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.3"/></svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" opacity="0.9"><path d="M8 2.4C5.1 2.4 2.5 3.7 0.8 5.8L2.2 7.2C3.5 5.5 5.6 4.4 8 4.4s4.5 1.1 5.8 2.8l1.4-1.4C13.5 3.7 10.9 2.4 8 2.4zM8 6.4c-1.6 0-3 .7-4 1.8L5.4 9.6C6.1 8.8 7 8.4 8 8.4s1.9.4 2.6 1.2l1.4-1.4C11 7.1 9.6 6.4 8 6.4zM8 10.4c-.6 0-1.1.2-1.5.5L8 13l1.5-2.1c-.4-.3-.9-.5-1.5-.5z"/></svg>
            <svg width="25" height="12" viewBox="0 0 25 12" fill="currentColor" opacity="0.9"><rect x="0" y="1" width="21" height="10" rx="2.5" stroke="white" strokeWidth="1" fill="none" opacity="0.4"/><rect x="22" y="4" width="3" height="4" rx="1"/><rect x="1.5" y="2.5" width="16" height="7" rx="1.5"/></svg>
          </div>
        </div>
        {/* Screen content */}
        <div className="flex-1 overflow-hidden">{children}</div>
        {/* Home indicator */}
        <div className="flex justify-center pb-2 pt-1 bg-black">
          <div className="w-28 h-1 bg-white/30 rounded-full" />
        </div>
      </div>
      {/* Side buttons */}
      <div className="absolute left-[-3px] top-[120px] w-[3px] h-8 bg-[#3a3a3c] rounded-l-sm" />
      <div className="absolute left-[-3px] top-[160px] w-[3px] h-12 bg-[#3a3a3c] rounded-l-sm" />
      <div className="absolute left-[-3px] top-[184px] w-[3px] h-12 bg-[#3a3a3c] rounded-l-sm" />
      <div className="absolute right-[-3px] top-[150px] w-[3px] h-16 bg-[#3a3a3c] rounded-r-sm" />
    </div>
  );
}

function TabletFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-full py-4">
      <div
        className="relative rounded-[24px] overflow-hidden shadow-[0_0_0_2px_#3a3a3c,0_0_0_10px_#1c1c1e,0_20px_60px_rgba(0,0,0,0.7)]"
        style={{ width: 768, maxWidth: "calc(100vw - 120px)", height: 680, background: "#000", flexShrink: 0 }}
      >
        {/* Camera */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#2a2a2a] rounded-full z-20 border border-[#3a3a3c]" />
        {/* Status bar */}
        <div className="relative z-10 flex items-center justify-between px-6 pt-2 pb-1 text-white bg-transparent pointer-events-none">
          <span className="text-[12px] font-semibold">9:41</span>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="11" viewBox="0 0 17 12" fill="currentColor" opacity="0.9"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/></svg>
            <svg width="22" height="11" viewBox="0 0 25 12" fill="currentColor" opacity="0.9"><rect x="0" y="1" width="21" height="10" rx="2.5" stroke="white" strokeWidth="1" fill="none" opacity="0.4"/><rect x="22" y="4" width="3" height="4" rx="1"/><rect x="1.5" y="2.5" width="16" height="7" rx="1.5"/></svg>
          </div>
        </div>
        <div className="flex-1 overflow-hidden h-[calc(100%-32px)]">{children}</div>
        {/* Home bar */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-20 h-1 bg-white/20 rounded-full" />
      </div>
    </div>
  );
}

function BrowserFrame({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className="flex flex-col h-full">
      {/* Browser chrome — Lovable style */}
      <div className="flex items-center gap-2 px-3 h-9 bg-muted/40 border-b border-border shrink-0">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e]/60" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d4a017]/60" />
          <div className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29]/60" />
        </div>
        {/* Nav arrows */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Back">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2L3.5 6L7.5 10"/></svg>
          </button>
          <button className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Forward">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 2L8.5 6L4.5 10"/></svg>
          </button>
        </div>
        {/* URL bar */}
        <div className="flex-1 flex items-center gap-1.5 bg-background border border-border rounded-md px-2.5 py-1 mx-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500/50 shrink-0" />
          <span className="text-[11px] text-muted-foreground font-mono truncate flex-1 text-center">{url}</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export function PreviewPanel({
  files,
  projectId,
  activeFile,
  isVisualEditActive,
  onVisualEditToggle,
  onFileUpdate,
  onError,
  onFixWithAI,

  isGenerating = false,
  generatingFileCount = 0,
  deployedUrl,
  badgeHidden = false,
  onSendAnnotatedToChat,
}: PreviewPanelProps) {
  const [device, setDevice] = useState<DeviceSize>("desktop");
  const [showFrame, setShowFrame] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  // Tracks the in-iframe pathname so the URL bar reflects React Router
  // navigations inside the preview. Updated by `lifemark-preview-location`
  // postMessage events from the iframe (see the URL-sync script injected
  // into fallbackHtml below). Defaults to "/" until the first nav fires.
  const [previewPath, setPreviewPath] = useState<string>("/");
  // Local-edit copy of the URL while user types; commits to navigation on
  // Enter, falls back to previewPath when the input loses focus without
  // committing.
  const [urlInput, setUrlInput] = useState<string>("/");
  const [urlEditing, setUrlEditing] = useState(false);
  const [visualEdit, setVisualEdit] = useState(isVisualEditActive ?? false);
  const [showConsole, setShowConsole] = useState(false);
  const [annotateScreenshot, setAnnotateScreenshot] = useState<string | null>(null);
  const [sandpackReady, setSandpackReady] = useState<boolean | null>(null);
  const [consoleLines, setConsoleLines] = useState<{ type: string; text: string }[]>([]);
  const [vebSelected, setVebSelected] = useState<VebElement | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sandpackContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [annotationsEnabled, setAnnotationsEnabled] = useState(false);

  useEffect(() => {
    if (isVisualEditActive !== undefined) setVisualEdit(isVisualEditActive);
  }, [isVisualEditActive]);

  useEffect(() => {
    if (!visualEdit) setVebSelected(null);
  }, [visualEdit]);

  // Always use the local srcdoc/Babel preview engine — Sandpack requires an
  // active connection to CodeSandbox CDN servers which causes timeout errors.
  // Setting sandpackReady=false immediately activates the offline fallback.
  useEffect(() => {
    setSandpackReady(false);
  }, []);

  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.source === "lifemark-veb" && visualEdit) {
        const data = e.data as VebElement & { source: string };
        // Get the sandpack iframe's position to offset the rect
        const iframe = sandpackContainerRef.current?.querySelector("iframe");
        const iframeRect = iframe?.getBoundingClientRect();
        setVebSelected({
          tagName: data.tagName,
          textContent: data.textContent,
          classList: data.classList,
          xpath: data.xpath,
          rect: {
            top: data.rect.top + (iframeRect?.top ?? 0),
            left: data.rect.left + (iframeRect?.left ?? 0),
            width: data.rect.width,
            height: data.rect.height,
          },
        });
      }
      if (e.data?.source === "lifemark-preview") {
        const { type, text } = e.data as { source: string; type: string; text: string };
        setConsoleLines((prev) => [...prev.slice(-99), { type, text }]);
        if (type === "error") {
          if (onError) onError(text);
          setActiveError(text);
          setErrorDismissed(false);
        }
      }
      if (e.data?.type === "lifemark-screenshot") {
        const { messageId, dataUrl } = e.data as { type: string; messageId: string; dataUrl: string | null };
        if (messageId && dataUrl) {
          window.dispatchEvent(new CustomEvent("lifemark-screenshot-ready", { detail: { messageId, dataUrl } }));
        }
      }
      // URL sync — the iframe boot script reports its current path on initial
      // mount and on every history change so the address bar stays in sync
      // with react-router navigations inside the running app.
      if (e.data?.type === "lifemark-preview-location") {
        const { pathname } = e.data as { type: string; pathname: string };
        if (typeof pathname === "string" && pathname.length > 0) {
          setPreviewPath(pathname);
          // Don't clobber whatever the user is typing into the address bar.
          if (!urlEditing) setUrlInput(pathname);
        }
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onError, visualEdit]);

  // Relay screenshot capture requests from ChatPanel → preview iframe
  useEffect(() => {
    function handleCaptureRequest(e: Event) {
      const { messageId } = (e as CustomEvent<{ messageId: string }>).detail;
      iframeRef.current?.contentWindow?.postMessage({ type: "lifemark-capture", messageId }, "*");
    }
    window.addEventListener("lifemark-request-screenshot", handleCaptureRequest);
    return () => window.removeEventListener("lifemark-request-screenshot", handleCaptureRequest);
  }, []);

  const captureForAnnotation = useCallback(() => {
    const msgId = `ann-${Date.now()}`;
    const handleReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as { messageId: string; dataUrl: string | null };
      if (detail.messageId !== msgId) return;
      window.removeEventListener("lifemark-screenshot-ready", handleReady);
      if (detail.dataUrl) setAnnotateScreenshot(detail.dataUrl);
    };
    window.addEventListener("lifemark-screenshot-ready", handleReady);
    window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: msgId } }));
    // Cleanup listener after 5s in case iframe never responds
    setTimeout(() => window.removeEventListener("lifemark-screenshot-ready", handleReady), 5000);
  }, []);

  const template = useMemo(() => detectTemplate(files), [files]);
  const sandpackFiles = useMemo(() => {
    const base = toSandpackFiles(files);
    return visualEdit ? addVebBridge(base) : base;
  }, [files, visualEdit]);
  const fallbackHtml = useMemo(
    () => (sandpackReady === false ? buildFallbackHtml(files) : ""),
    [files, sandpackReady]
  );

  const hasFiles = files.length > 0;
  const useFallback = sandpackReady === false;

  function refresh() {
    setRefreshKey((k) => k + 1);
    setConsoleLines([]);
    setVebSelected(null);
  }

  function openInNewTab() {
    if (deployedUrl) {
      window.open(deployedUrl, "_blank", "noopener,noreferrer");
    } else if (projectId) {
      window.open(`/preview/${projectId}`, "_blank", "noopener,noreferrer");
    } else if (useFallback && fallbackHtml) {
      const blob = new Blob([fallbackHtml], { type: "text/html" });
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    }
  }

  // ⌘⇧O keyboard shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openInNewTab();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployedUrl, projectId, useFallback, fallbackHtml]);

  function handleVebFileChange(path: string, content: string) {
    const file = files.find((f) => f.path === path);
    if (file && onFileUpdate) {
      onFileUpdate({ ...file, content });
    }
  }

  // When device frame is on, delegate sizing to PhoneFrame/TabletFrame
  const deviceStyle: React.CSSProperties =
    device === "desktop" || showFrame
      ? { width: "100%", height: "100%" }
      : {
          width: DEVICE_WIDTHS[device],
          height: device === "mobile" ? "812px" : "1024px",
          maxHeight: "calc(100% - 16px)",
        };

  const deviceWrapper =
    device === "desktop" ? "w-full h-full"
    : showFrame ? "w-full h-full"
    : "mx-auto rounded-xl overflow-hidden shadow-2xl bg-white";

  /**
   * Wrap `children` in the appropriate device frame (or nothing for desktop).
   */
  function withDeviceFrame(children: React.ReactNode): React.ReactNode {
    const previewUrl = sandpackReady === true
      ? `sandpack://${template}`
      : `preview://project/${projectId ?? "local"}`;

    if (device === "mobile" && showFrame) return <PhoneFrame>{children}</PhoneFrame>;
    if (device === "tablet" && showFrame) return <TabletFrame>{children}</TabletFrame>;
    if (device === "desktop") return <BrowserFrame url={previewUrl}>{children}</BrowserFrame>;
    // no-frame mobile/tablet
    return (
      <div className="flex items-start justify-center w-full h-full bg-muted/20 overflow-auto p-4">
        <div className="mx-auto rounded-xl overflow-hidden shadow-2xl bg-white" style={deviceStyle}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex flex-col h-full bg-background">
        {/* Toolbar — Lovable style */}
        <div className="flex items-center gap-1.5 px-2.5 h-9 border-b border-border bg-background shrink-0">
          {/* Device switcher */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/50 shrink-0">
            {([
              { d: "mobile" as DeviceSize, icon: Smartphone, label: "Mobile (390px)" },
              { d: "tablet" as DeviceSize, icon: Tablet, label: "Tablet (768px)" },
              { d: "desktop" as DeviceSize, icon: Monitor, label: "Desktop" },
            ] as const).map(({ d, icon: Icon, label }) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setDevice(d)}
                    className={`p-1.5 rounded transition-all ${
                      device === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* URL bar — Lovable style center address bar. Editable when the
              preview is the local Babel iframe so users can type a route and
              hit Enter to navigate. Read-only when showing a deployed URL. */}
          <div className="flex-1 flex items-center justify-center min-w-0 px-1">
            <div className="flex items-center gap-1.5 h-6 w-full max-w-xs bg-muted/40 hover:bg-muted/70 border border-border/50 rounded-md px-2.5 transition-colors cursor-text group">
              {/* Lock / protocol icon */}
              <svg className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {deployedUrl ? (
                <span className="flex-1 text-[11px] text-muted-foreground/70 truncate font-mono select-none">
                  {deployedUrl.replace(/^https?:\/\//, "")}
                </span>
              ) : (
                <input
                  value={urlEditing ? urlInput : previewPath}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlEditing(true); }}
                  onFocus={() => { setUrlInput(previewPath); setUrlEditing(true); }}
                  onBlur={() => setUrlEditing(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const target = urlInput.startsWith("/") ? urlInput : `/${urlInput}`;
                      // Tell the iframe to navigate. The iframe's URL-sync
                      // script (injected into fallbackHtml) listens for this
                      // and calls history.pushState + dispatches popstate so
                      // react-router picks it up.
                      iframeRef.current?.contentWindow?.postMessage(
                        { type: "lifemark-preview-navigate", pathname: target },
                        "*",
                      );
                      setPreviewPath(target);
                      setUrlEditing(false);
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      setUrlInput(previewPath);
                      setUrlEditing(false);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="flex-1 text-[11px] text-muted-foreground/80 truncate font-mono bg-transparent outline-none focus:text-foreground"
                  spellCheck={false}
                  aria-label="Preview URL"
                />
              )}
              {deployedUrl && (
                <button
                  onClick={openInNewTab}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-foreground"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            {sandpackReady === true && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 mr-1">
                Live
              </span>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setVisualEdit(!visualEdit); onVisualEditToggle?.(); }}
                  className={`p-1.5 rounded-md transition-all ${
                    visualEdit
                      ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Visual Edit {visualEdit ? "(on)" : "(off)"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setAnnotationsEnabled((v) => !v)}
                  className={`p-1.5 rounded-md transition-all ${
                    annotationsEnabled
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Preview Annotations {annotationsEnabled ? "(on)" : "(off)"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowConsole((v) => !v)}
                  className={`p-1.5 rounded-md transition-all ${
                    showConsole
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Console</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowFrame((v) => !v)}
                  className={`p-1.5 rounded-md transition-all ${
                    showFrame && device !== "desktop"
                      ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                  disabled={device === "desktop"}
                >
                  <Frame className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Toggle device frame</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={refresh} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Refresh preview</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={openInNewTab} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Open in new tab (⌘⇧O)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={captureForAnnotation} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Capture &amp; annotate for AI</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Preview content */}
        {!hasFiles ? (
          <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] text-muted-foreground">
            <div className="text-center px-8 py-10 max-w-xs">
              {/* Animated placeholder frames */}
              <div className="relative w-48 h-32 mx-auto mb-6">
                <div className="absolute inset-0 rounded-xl bg-muted/10 border border-border/30" />
                <div className="absolute top-3 left-3 right-3 h-3 rounded bg-muted/20 animate-pulse" />
                <div className="absolute top-8 left-3 right-8 h-2 rounded bg-muted/15 animate-pulse [animation-delay:150ms]" />
                <div className="absolute top-12 left-3 right-5 h-2 rounded bg-muted/15 animate-pulse [animation-delay:300ms]" />
                <div className="absolute top-16 left-3 right-10 h-2 rounded bg-muted/10 animate-pulse [animation-delay:450ms]" />
                <div className="absolute bottom-3 left-3 w-16 h-5 rounded-md bg-muted/20 animate-pulse [animation-delay:200ms]" />
              </div>
              <p className="text-sm font-medium text-foreground/80 mb-1.5">Your app preview will appear here</p>
              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                Describe what you want to build in the chat and LifemarkAI will generate a live preview.
              </p>
            </div>
          </div>
        ) : sandpackReady === null ? (
          <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
            <div className="text-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/40">Loading preview…</p>
            </div>
          </div>
        ) : sandpackReady === true ? (
          <div className="flex flex-col flex-1 overflow-hidden relative" ref={sandpackContainerRef}>
            <SandpackProvider
              key={refreshKey}
              template={template}
              files={sandpackFiles}
              theme="dark"
              options={{
                externalResources: ["https://cdn.tailwindcss.com"],
                recompileMode: "delayed",
                recompileDelay: 600,
              }}
              customSetup={{
                dependencies: {
                  "lucide-react": "latest",
                  "framer-motion": "^11.0.0",
                  "date-fns": "^3.0.0",
                },
              }}
            >
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-hidden flex flex-col bg-[#13131a]">
                  {withDeviceFrame(
                    /* @ts-expect-error dynamic sandpack types */
                    <SandpackPreviewComp
                      showNavigator={false}
                      showOpenInCodeSandbox={false}
                      style={{ width: "100%", height: "100%", border: "none" }}
                    />
                  )}
                </div>
                {showConsole && (
                  <div className="h-40 border-t border-[#1e1e2e] bg-[#0d0d14] overflow-hidden">
                    <SandpackConsoleComp style={{ height: "100%" }} />
                  </div>
                )}
              </div>
            </SandpackProvider>

            {/* VEB selection overlay for Sandpack mode */}
            {visualEdit && vebSelected && (
              <VebPopover
                selected={vebSelected}
                files={files}
                onFileChange={handleVebFileChange}
                onClose={() => setVebSelected(null)}
              />
            )}

            {/* Visual edit hint banner */}
            {visualEdit && !vebSelected && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-violet-600/90 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
                Click any element to edit it
              </div>
            )}
          </div>
        ) : (
          /* Fallback: Babel + CDN iframe (same-origin, so VisualEditOverlay can inject directly) */
          <div ref={previewContainerRef} className="flex flex-col flex-1 overflow-hidden relative">
            <div className="flex-1 overflow-hidden flex flex-col bg-background">
              {withDeviceFrame(
                <iframe
                  // Re-key on srcDoc length so the iframe actually re-renders
                  // when files change. srcDoc updates on an existing iframe
                  // element are NOT observable in most browsers without a
                  // full element recreation. The refreshKey covers manual
                  // refresh; the length suffix covers automatic file updates.
                  key={`${refreshKey}-${fallbackHtml.length}`}
                  ref={iframeRef}
                  srcDoc={fallbackHtml}
                  className="w-full h-full border-0"
                  title="App Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              )}
            </div>

            {/* VisualEditOverlay — works because srcDoc iframe is same-origin */}
            <VisualEditOverlay
              iframeRef={iframeRef}
              files={files}
              onFileChange={handleVebFileChange}
              enabled={visualEdit}
            />

            {/* Preview Annotations overlay */}
            {projectId && (
              <PreviewAnnotations
                projectId={projectId}
                enabled={annotationsEnabled}
              />
            )}

            {showConsole && (
              <div className="h-40 border-t border-border bg-muted/30 overflow-y-auto p-2 font-mono text-xs space-y-0.5">
                {consoleLines.length === 0 ? (
                  <p className="text-muted-foreground">No console output yet…</p>
                ) : (
                  consoleLines.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.type === "error" ? "text-red-400"
                          : line.type === "warn" ? "text-yellow-400"
                          : "text-emerald-400"
                      }
                    >
                      {line.text}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* LifemarkAI badge — overlaid on the preview (mirrors what appears on published apps) */}
        {!badgeHidden && (
          <div className="absolute bottom-0 right-0 pointer-events-none" style={{ zIndex: 50 }}>
            <div className="pointer-events-auto">
              <LifemarkBadge hidden={badgeHidden} projectRef={projectId} />
            </div>
          </div>
        )}

        {/* Generation shimmer overlay */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-40 pointer-events-none"
            >
              {/* Frosted glass dimmer */}
              <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px]" />
              {/* Scanning shimmer line */}
              <motion.div
                className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-400 to-transparent opacity-70"
                animate={{ top: ["0%", "100%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
              />
              {/* Status badge */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2.5 bg-background/90 backdrop-blur-md border border-violet-500/30 rounded-full px-4 py-2 shadow-xl">
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-violet-400"
                        animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
                      />
                    ))}
                  </div>
                  <span className="text-[12px] text-violet-200 font-medium">
                    {generatingFileCount > 0
                      ? `Writing ${generatingFileCount} file${generatingFileCount !== 1 ? "s" : ""}…`
                      : "AI is generating…"}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fix-with-AI error banner */}
        <AnimatePresence>
          {activeError && !errorDismissed && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 max-w-[90%] bg-red-950/95 backdrop-blur-sm border border-red-500/40 text-red-200 text-xs px-3 py-2 rounded-xl shadow-2xl"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="flex-1 truncate min-w-0 font-mono opacity-80">
                {activeError.length > 80 ? activeError.slice(0, 80) + "…" : activeError}
              </span>
              {onFixWithAI && (
                <button
                  onClick={() => { onFixWithAI(activeError); setErrorDismissed(true); }}
                  className="flex items-center gap-1 shrink-0 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 px-2 py-1 rounded-lg transition-colors"
                >
                  <Wrench className="w-3 h-3" />
                  Fix with AI
                </button>
              )}
              <button
                onClick={() => setErrorDismissed(true)}
                className="shrink-0 text-red-400/60 hover:text-red-300 transition-colors ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    {/* Capture & annotate modal */}
    {annotateScreenshot && (
      <PreviewAnnotateModal
        screenshotDataUrl={annotateScreenshot}
        onClose={() => setAnnotateScreenshot(null)}
        onSend={(annotatedDataUrl, prompt) => {
          onSendAnnotatedToChat?.(prompt, annotatedDataUrl);
          setAnnotateScreenshot(null);
        }}
      />
    )}
    </TooltipProvider>
  );
}

// ── VebPopover ─────────────────────────────────────────────────────────────────
// Popover that appears when the VEB bridge reports a click inside the Sandpack iframe.

interface VebPopoverProps {
  selected: VebElement;
  files: ProjectFile[];
  onFileChange: (path: string, content: string) => void;
  onClose: () => void;
}

function VebPopover({ selected, files, onFileChange, onClose }: VebPopoverProps) {
  const [activeTab, setActiveTab] = useState<"text" | "colors" | "spacing">("text");
  const [editText, setEditText] = useState(selected.textContent);
  const [editClasses, setEditClasses] = useState(selected.classList.join(" "));

  const left = Math.min(selected.rect.left + selected.rect.width / 2 - 136, window.innerWidth - 288);
  const top = Math.min(selected.rect.top + selected.rect.height + 8, window.innerHeight - 420);

  function applyFileChange({ textContent, classes }: { textContent?: string; classes?: string }) {
    const appFile =
      files.find((f) => f.path.endsWith("App.tsx") || f.path.endsWith("App.jsx")) ??
      files.find((f) => f.path.endsWith("index.tsx") || f.path.endsWith("index.jsx")) ??
      files[0];
    if (!appFile) return;

    let content = appFile.content;
    if (textContent !== undefined && selected.textContent) {
      content = content.replace(selected.textContent, textContent);
    }
    if (classes !== undefined) {
      const regex = /className="([^"]*)"/g;
      let found = false;
      content = content.replace(regex, (match, existing: string) => {
        if (!found && existing === selected.classList.join(" ")) {
          found = true;
          return `className="${classes}"`;
        }
        return match;
      });
    }
    onFileChange(appFile.path, content);
  }

  function addClass(cls: string) {
    const updated = editClasses.includes(cls)
      ? editClasses.split(" ").filter((c) => c !== cls).join(" ")
      : (editClasses + " " + cls).trim();
    setEditClasses(updated);
    applyFileChange({ classes: updated });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed z-50 bg-popover border border-border rounded-2xl shadow-2xl w-72"
        style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      >
        {/* Selection border */}
        <div
          className="fixed pointer-events-none z-40 border-2 border-blue-500 rounded"
          style={{
            top: selected.rect.top,
            left: selected.rect.left,
            width: selected.rect.width,
            height: selected.rect.height,
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">&lt;{selected.tagName}&gt;</span>
          </div>
          <Button variant="ghost" size="icon" className="w-6 h-6" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["text", "colors", "spacing"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-foreground border-b-2 border-violet-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-3 space-y-3">
          {activeTab === "text" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Content</label>
                <div className="flex gap-1">
                  <Input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && applyFileChange({ textContent: editText })}
                  />
                  <Button size="icon" className="w-8 h-8 shrink-0" onClick={() => applyFileChange({ textContent: editText })}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Size</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_SIZES.map((cls) => (
                    <button key={cls} onClick={() => addClass(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("text-", "")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Weight</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_WEIGHTS.map((cls) => (
                    <button key={cls} onClick={() => addClass(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("font-", "")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Align</label>
                <div className="flex gap-1">
                  {[
                    { cls: "text-left", Icon: AlignLeft },
                    { cls: "text-center", Icon: AlignCenter },
                    { cls: "text-right", Icon: AlignRight },
                  ].map(({ cls, Icon }) => (
                    <button key={cls} onClick={() => addClass(cls)}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "colors" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Text color</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_COLORS.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => addClass(cls)}
                      title={cls}
                      className={`w-6 h-6 rounded border border-border/40 transition-all hover:scale-110 bg-${cls.replace("text-","").replace("bg-","")}`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
