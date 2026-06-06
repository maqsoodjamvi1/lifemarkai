// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const PREVIEW_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "Cache-Control": "no-store, must-revalidate",
};

type FileRow = { path: string; content: string | null; language: string | null };

function rewriteStaticPaths(html: string, projectId: string): string {
  return html.replace(
    /(src|href)="(?!https?:\/\/|\/\/|#|data:|blob:)([^"]+)"/g,
    (_, attr: string, path: string) => {
      const resolved = path.startsWith("/") ? path : `/${path}`;
      return `${attr}="/preview/${projectId}${resolved}"`;
    }
  );
}

function generateReactPreview(files: FileRow[], projectName: string): string {
  const cssFiles  = files.filter((f) => f.path.endsWith(".css"));
  const codeFiles = files.filter((f) =>
    f.path.endsWith(".tsx") || f.path.endsWith(".ts") ||
    f.path.endsWith(".jsx") || f.path.endsWith(".js")
  );

  const sorted = [...codeFiles].sort((a, b) => {
    const isApp = (p: string) =>
      p.includes("App.") || p === "src/index.tsx" || p === "src/main.tsx";
    return (isApp(a.path) ? 1 : 0) - (isApp(b.path) ? 1 : 0);
  });

  const mainFile =
    files.find((f) => f.path === "src/App.tsx" || f.path === "App.tsx") ??
    files.find((f) => f.path.endsWith("App.tsx") || f.path.endsWith("App.jsx")) ??
    sorted[sorted.length - 1] ??
    null;

  if (!mainFile) {
    return `<!DOCTYPE html><html><body><div style="padding:2rem;font-family:system-ui;color:#888">No entry file found.</div></body></html>`;
  }

  const inlineCss = cssFiles.map((f) => f.content ?? "").join("\n");

  const shimScript = `<script>
window.__M = {};
window.__Mdefine = function(name, exports) { window.__M[name] = exports; };
window.__Mrequire = function(path) {
  var norm = path.replace(/^\\.\\//,'').replace(/\\.(tsx?|jsx?)$/,'');
  var candidates = [path, norm, 'src/' + norm, norm.replace(/^src\\//,'')];
  for (var i = 0; i < candidates.length; i++) {
    if (window.__M[candidates[i]]) return window.__M[candidates[i]];
  }
  if (path === 'react' || path === 'React') return window.React;
  if (path === 'react-dom' || path === 'react-dom/client') return window.ReactDOM;
  if (path === 'lucide-react') return window.__lucideReact || {};
  if (path === 'framer-motion') return window.__framerMotion || {};
  if (path === 'recharts') return window.__recharts || {};
  if (path === 'react-router-dom' || path === 'react-router') return window.__reactRouterDom || {};
  if (path === '@tanstack/react-query' || path === 'react-query') return window.__reactQuery || {};
  if (path === 'react-hook-form') return window.__reactHookForm || {};
  if (path === '@hookform/resolvers/zod' || path.startsWith('@hookform/')) {
    return { zodResolver: function(s) { return async function(v) { try { s.parse(v); return { values: v, errors: {} }; } catch(e) { return { values: {}, errors: {} }; } }; } };
  }
  if (path === 'zod') return window.__zod ? Object.assign({ z: window.__zod }, window.__zod) : {};
  if (path === 'date-fns' || path.startsWith('date-fns/')) return window.__dateFns || {};
  if (path === 'clsx') return { default: window.__clsx, clsx: window.__clsx };
  if (path === 'tailwind-merge') return { default: window.__twMerge, twMerge: window.__twMerge };
  if (path === 'class-variance-authority') return { cva: window.__cva, cx: window.__clsx };
  if (path === 'sonner') return window.__sonner || {};
  if (path === 'react-hot-toast') return window.__reactHotToast || {};
  if (path.startsWith('@radix-ui/')) return new Proxy({}, { get: function(_,k) { return k === '__esModule' ? true : function(){return null;}; } });
  console.warn('[preview] module not found:', path);
  return {};
};
window.__clsx = function() { return Array.from(arguments).flat(Infinity).filter(function(x) { return !!x && typeof x === 'string'; }).join(' '); };
window.__twMerge = function() { return Array.from(arguments).filter(Boolean).join(' '); };
window.__cva = function(base, config) { return function(opts) { var out = base || ''; if (config && config.variants && opts) { Object.keys(opts).forEach(function(k) { var v = config.variants[k]; if (v && opts[k] != null && v[String(opts[k])]) out += ' ' + v[String(opts[k])]; }); } return out.trim(); }; };
window.__sonner = { toast: Object.assign(function(m){console.log('[toast]',m);}, { success:function(m){console.log('[toast:ok]',m);}, error:function(m){console.log('[toast:err]',m);} }), Toaster: function(){return null;} };
window.__reactHotToast = { default: Object.assign(function(m){console.log('[toast]',m);}, { success:function(m){console.log('[toast:ok]',m);}, error:function(m){console.log('[toast:err]',m);} }), toast: function(m){console.log('[toast]',m);}, Toaster: function(){return null;} };
(function() {
  var _log = console.log, _warn = console.warn, _err = console.error;
  function relay(type, args) {
    var text = Array.from(args).map(function(a) {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); }
    }).join(' ');
    try { window.parent.postMessage({ source: 'lifemark-preview', type: type, text: text }, '*'); } catch(e) {}
  }
  console.log   = function() { _log.apply(console, arguments);  relay('log',   arguments); };
  console.warn  = function() { _warn.apply(console, arguments); relay('warn',  arguments); };
  console.error = function() { _err.apply(console, arguments);  relay('error', arguments); };
  window.addEventListener('error', function(e) {
    relay('error', [(e.message || 'Unknown error') + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : '')]);
  });
  window.addEventListener('unhandledrejection', function(e) {
    relay('error', ['Unhandled rejection: ' + (e.reason?.message || String(e.reason))]);
  });
})();
</script>`;

  function wrapFile(file: FileRow): string {
    let src = file.content ?? "";
    src = src.replace(/import\s+['"][^'"]+\.css['"]\s*;?\n?/g, "");
    src = src.replace(/import\s+type\s+[^\n;]+;?\n?/g, "");
    src = src.replace(/import\s+React\s*,?\s*(?:\{([^}]*)\})?\s*from\s+['"]react['"]\s*;?\n?/g,
      (_, n) => n?.trim() ? `const { ${n.trim()} } = React;\n` : "");
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = React;\n`);
    src = src.replace(/import\s+(\w+)\s+from\s+['"]react-dom(?:\/client)?['"]\s*;?\n?/g,
      (_, n) => `const ${n} = ReactDOM;\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react-dom(?:\/client)?['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = ReactDOM;\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__lucideReact || {};\n`);
    src = src.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]lucide-react['"]\s*;?\n?/g,
      (_, n) => `const ${n} = window.__lucideReact || {};\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]framer-motion['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__framerMotion || {};\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]recharts['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__recharts || {};\n`);
    src = src.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]recharts['"]\s*;?\n?/g,
      (_, n) => `const ${n} = window.__recharts || {};\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react-router(?:-dom)?['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__reactRouterDom || {};\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"](?:@tanstack\/)?react-query['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__reactQuery || {};\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react-hook-form['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__reactHookForm || {};\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]zod['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__zod ? Object.assign({ z: window.__zod }, window.__zod) : {};\n`);
    src = src.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]zod['"]\s*;?\n?/g,
      (_, n) => `const ${n} = window.__zod || {};\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]date-fns(?:\/[^'"]*)?['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__dateFns || {};\n`);
    src = src.replace(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]clsx['"]\s*;?\n?/g,
      (_, named, def) => named ? `const { ${named.trim()} } = { clsx: window.__clsx };\n` : `const ${def} = window.__clsx;\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]tailwind-merge['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = { twMerge: window.__twMerge, merge: window.__twMerge };\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]class-variance-authority['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = { cva: window.__cva, cx: window.__clsx };\n`);
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]sonner['"]\s*;?\n?/g,
      (_, n) => `const { ${n.trim()} } = window.__sonner || {};\n`);
    src = src.replace(/import\s+(?:(\w+)|\{([^}]+)\})\s*,?\s*(?:\{([^}]+)\})?\s*from\s+['"]react-hot-toast['"]\s*;?\n?/g,
      (_, d, n1, n2) => {
        const lines: string[] = [];
        if (d) lines.push(`const ${d} = window.__reactHotToast?.default || function(){};`);
        const n = n1 || n2;
        if (n) lines.push(`const { ${n.trim()} } = window.__reactHotToast || {};`);
        return lines.join("\n") + "\n";
      });
    // Relative imports
    src = src.replace(/import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, d, n, p) => { const v = `__mod_${p.replace(/[^a-zA-Z0-9]/g,"_")}`; return `const ${v}=__Mrequire('${p}');const ${d.trim()}=${v}.default??${v};const{${n.trim()}}=${v};\n`; });
    src = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, n, p) => { const v = `__mod_${p.replace(/[^a-zA-Z0-9]/g,"_")}`; return `const ${v}=__Mrequire('${p}');const{${n.trim()}}=${v};\n`; });
    src = src.replace(/import\s+(\w+)\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\n?/g,
      (_, n, p) => { const v = `__mod_${p.replace(/[^a-zA-Z0-9]/g,"_")}`; return `const ${v}=__Mrequire('${p}');const ${n}=${v}.default??${v};\n`; });
    let defaultExportName: string | null = null;
    src = src.replace(/export\s+default\s+(function|class)\s+(\w+)/g,
      (_, kw, n) => { defaultExportName = n; return `${kw} ${n}`; });
    src = src.replace(/^export\s+default\s+(\w+)\s*;?\s*$/m,
      (_, n) => { defaultExportName = n; return `/* default: ${n} */`; });
    const namedExports: string[] = [];
    src = src.replace(/export\s+(const|let|var|function|class)\s+(\w+)/g,
      (_, kw, n) => { namedExports.push(n); return `${kw} ${n}`; });
    src = src.replace(/export\s+\{([^}]+)\}\s*;?\n?/g, (_, names) => {
      const entries = names.split(",").map((n: string) => n.trim()).filter(Boolean)
        .map((n: string) => { const [o,a] = n.split(/\s+as\s+/).map((s:string)=>s.trim()); return a ? `${a}:${o}` : `${n}:${n}`; }).join(",");
      namedExports.push(`...({${entries}})`);
      return `/* named exports: ${names} */`;
    });
    const shortPath = file.path.replace(/\.(tsx?|jsx?)$/,"");
    if (defaultExportName) {
      src += `\ntry{__Mdefine('${file.path}',{default:${defaultExportName}});__Mdefine('${shortPath}',{default:${defaultExportName}});}catch(e){}\n`;
    }
    if (namedExports.length > 0) {
      const safe = namedExports.filter(n=>!n.startsWith("...")).map(n=>`${n}:typeof ${n}!=='undefined'?${n}:undefined`).join(",");
      if (safe) src += `\ntry{__Mdefine('${file.path}',Object.assign(window.__M['${file.path}']||{},{${safe}}));__Mdefine('${shortPath}',window.__M['${file.path}']);}catch(e){}\n`;
    }
    return `<script type="text/babel" data-presets="react,typescript" data-file="${file.path}">\n${src}\n</script>`;
  }

  const fileScripts = sorted.map(wrapFile).join("\n\n");
  const appPath = mainFile?.path ?? "";
  const entryScript = `<script type="text/babel" data-presets="react,typescript">
(function() {
  var mod = __Mrequire('${appPath}');
  var AppComp = (mod && mod.default) || (typeof App !== 'undefined' ? App : null);
  if (!AppComp) { document.getElementById('root').innerHTML='<div style="padding:2rem;font-family:system-ui;color:#888">No App component found.</div>'; return; }
  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(React.StrictMode,null,React.createElement(AppComp)));
})();
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName || "Preview"}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/lucide-react@latest/dist/umd/lucide-react.js"
    onload="window.__lucideReact=window.LucideReact||window.lucideReact||window.lucide||{};"
    onerror="window.__lucideReact={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/recharts@2/umd/Recharts.js"
    onload="window.__recharts=window.Recharts||{};" onerror="window.__recharts={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-router-dom@6/umd/react-router-dom.development.js"
    onload="window.__reactRouterDom=window.ReactRouterDOM||{};" onerror="window.__reactRouterDom={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/@tanstack/react-query@5/build/umd/index.development.js"
    onload="window.__reactQuery=window.ReactQuery||{};" onerror="window.__reactQuery={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-hook-form@7/dist/index.umd.js"
    onload="window.__reactHookForm=window.ReactHookForm||{};" onerror="window.__reactHookForm={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/zod@3/lib/index.umd.js"
    onload="window.__zod=window.Zod||{};" onerror="window.__zod={};"></script>
  <script src="https://cdn.jsdelivr.net/npm/date-fns@3/cdn.min.js"
    onload="window.__dateFns=window.dateFns||{};" onerror="window.__dateFns={};"></script>
  <style>
    *,*::before,*::after{box-sizing:border-box;}
    body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    ${inlineCss}
  </style>
</head>
<body>
  <div id="root"></div>
  ${shimScript}
  ${fileScripts}
  ${entryScript}
</body>
</html>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createAdminClient();

  const [{ data: project }, { data: files }] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("project_files").select("path, content, language").eq("project_id", projectId),
  ]);

  if (!files || files.length === 0) {
    return new NextResponse(
      `<!DOCTYPE html><html><body><p style="padding:2rem;font-family:system-ui">Project not found or has no files.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const indexHtml = files.find((f) => f.path === "index.html" || f.path === "public/index.html");
  if (indexHtml?.content) {
    const html = rewriteStaticPaths(indexHtml.content, projectId);
    return new NextResponse(html, {
      headers: { ...PREVIEW_HEADERS, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const html = generateReactPreview(files, project?.name ?? "Preview");
  return new NextResponse(html, {
    headers: { ...PREVIEW_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
