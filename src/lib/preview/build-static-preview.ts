import { injectLifemarkDataSdk } from "./lifemark-data.ts";
import type { ProjectFile } from "../../types/database.ts";

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash + 1);
}

function resolveLocalReference(reference: string, entryPath: string): string | null {
  const value = reference.trim();
  if (!value || value.startsWith("#") || /^(?:[a-z]+:|\/\/)/i.test(value)) return null;
  const clean = value.split(/[?#]/, 1)[0];
  try {
    const decoded = decodeURIComponent(clean);
    return normalizePath(decoded.startsWith("/") ? decoded : `${dirname(entryPath)}${decoded}`);
  } catch {
    return normalizePath(clean.startsWith("/") ? clean : `${dirname(entryPath)}${clean}`);
  }
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? null;
}

const ASSET_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  svg: "image/svg+xml", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  otf: "font/otf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  mp4: "video/mp4", webm: "video/webm",
};

function assetDataUrl(file: Pick<ProjectFile, "path" | "content">): string | null {
  const existing = file.content.trim();
  if (/^data:/i.test(existing)) return existing;
  const extension = file.path.split(".").pop()?.toLowerCase() ?? "";
  const mime = ASSET_MIME[extension];
  if (!mime) return null;
  if (extension === "svg" && /^\s*<svg\b/i.test(file.content)) {
    return `data:${mime};charset=utf-8,${encodeURIComponent(file.content)}`;
  }
  const base64 = existing.replace(/\s/g, "");
  return base64 && /^[a-z0-9+/]+={0,2}$/i.test(base64)
    ? `data:${mime};base64,${base64}`
    : null;
}

function rewriteCssAssets(
  css: string,
  cssPath: string,
  fileByPath: Map<string, Pick<ProjectFile, "path" | "content">>,
): string {
  return css.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (whole, _quote: string, reference: string) => {
    const path = resolveLocalReference(reference, cssPath);
    const file = path ? fileByPath.get(path) : undefined;
    const dataUrl = file ? assetDataUrl(file) : null;
    return dataUrl ? `url(${dataUrl})` : whole;
  });
}

function rewriteHtmlAssetAttributes(
  html: string,
  entryPath: string,
  fileByPath: Map<string, Pick<ProjectFile, "path" | "content">>,
): string {
  let rewritten = html.replace(/\b(src|poster)\s*=\s*(["'])(.*?)\2/gi, (whole, name: string, quote: string, reference: string) => {
    const path = resolveLocalReference(reference, entryPath);
    const file = path ? fileByPath.get(path) : undefined;
    const dataUrl = file ? assetDataUrl(file) : null;
    return dataUrl ? `${name}=${quote}${dataUrl}${quote}` : whole;
  });
  rewritten = rewritten.replace(/\bstyle\s*=\s*(["'])(.*?)\1/gi, (whole, quote: string, css: string) => {
    const next = rewriteCssAssets(css, entryPath, fileByPath);
    return next === css ? whole : `style=${quote}${next}${quote}`;
  });
  rewritten = rewritten.replace(/\bsrcset\s*=\s*(["'])(.*?)\1/gi, (whole, quote: string, value: string) => {
    let changed = false;
    const next = value.split(",").map((candidate) => {
      const match = candidate.trim().match(/^(\S+)(\s+.+)?$/);
      if (!match) return candidate;
      const path = resolveLocalReference(match[1], entryPath);
      const file = path ? fileByPath.get(path) : undefined;
      const dataUrl = file ? assetDataUrl(file) : null;
      if (!dataUrl) return candidate.trim();
      changed = true;
      return `${dataUrl}${match[2] ?? ""}`;
    }).join(", ");
    return changed ? `srcset=${quote}${next}${quote}` : whole;
  });
  return rewritten;
}

function rewriteLinkAssets(
  html: string,
  entryPath: string,
  fileByPath: Map<string, Pick<ProjectFile, "path" | "content">>,
): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (/\brel\s*=\s*(["'])stylesheet\1/i.test(tag)) return tag;
    const href = attribute(tag, "href");
    if (!href) return tag;
    const path = resolveLocalReference(href, entryPath);
    const file = path ? fileByPath.get(path) : undefined;
    const dataUrl = file ? assetDataUrl(file) : null;
    return dataUrl ? tag.replace(href, dataUrl) : tag;
  });
}

function routeForHtmlPath(path: string): string {
  if (path === "index.html") return "/";
  if (path.endsWith("/index.html")) return `/${path.slice(0, -"index.html".length)}`;
  return `/${path}`;
}

function selectHtmlEntry(
  files: Array<Pick<ProjectFile, "path" | "content">>,
  requestedRoute: string,
): Pick<ProjectFile, "path" | "content"> | undefined {
  const requested = normalizePath(requestedRoute.split(/[?#]/, 1)[0]);
  const candidates = requested
    ? [requested, `${requested}.html`, `${requested}/index.html`]
    : ["index.html"];
  return candidates.map((path) => files.find((file) => file.path === path)).find(Boolean)
    ?? files.find((file) => file.path === "index.html")
    ?? files.find((file) => file.path.endsWith(".html"));
}

function rewriteStaticPageLinks(
  html: string,
  entryPath: string,
  fileByPath: Map<string, Pick<ProjectFile, "path" | "content">>,
): string {
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = attribute(tag, "href");
    const path = href ? resolveLocalReference(href, entryPath) : null;
    if (!href || !path || !fileByPath.has(path) || !path.endsWith(".html")) return tag;
    const route = routeForHtmlPath(path);
    return tag.replace(href, `#${route}`).replace(/>$/, ` data-lifemark-route="${route}">`);
  });
}

function safeInlineScript(content: string): string {
  // HTML parsers terminate script elements before JavaScript parsing. Escaping
  // the slash preserves JavaScript string values while preventing early close.
  return content.replace(/<\/script/gi, "<\\/script");
}

function resolveModuleReference(reference: string, importerPath: string, paths: Set<string>): string | null {
  const resolved = resolveLocalReference(reference, importerPath);
  if (!resolved) return null;
  return [resolved, `${resolved}.js`, `${resolved}.mjs`, `${resolved}/index.js`]
    .find((candidate) => paths.has(candidate)) ?? resolved;
}

function rewriteModuleImports(code: string, importerPath: string, paths: Set<string>): string {
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']+?)\2/g,
    (whole, lead: string, quote: string, reference: string) => {
      const resolved = resolveModuleReference(reference, importerPath, paths);
      return resolved ? `${lead}${quote}app:/${resolved}${quote}` : whole;
    },
  );
}

function moduleRegistryScript(files: Array<Pick<ProjectFile, "path" | "content">>): string {
  const modules = files.filter((file) => /\.(?:m?js)$/i.test(file.path));
  if (!modules.length) return "";
  const paths = new Set(modules.map((file) => file.path));
  const registry = Object.fromEntries(modules.map((file) => [
    file.path,
    rewriteModuleImports(safeInlineScript(file.content), file.path, paths),
  ]));
  const serialized = JSON.stringify(registry).replace(/</g, "\\u003c");
  return `<script data-lifemark-module-registry>(function(){
var source=${serialized};var imports={};
for(var path in source){imports["app:/"+path]=URL.createObjectURL(new Blob([source[path]],{type:"text/javascript"}));}
var map=document.createElement("script");map.type="importmap";map.textContent=JSON.stringify({imports:imports});
document.currentScript.parentNode.insertBefore(map,document.currentScript.nextSibling);
})();</script>`;
}

function injectIntoHead(html: string, content: string): string {
  if (!content) return html;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head?.index !== undefined) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}\n${content}${html.slice(at)}`;
  }
  return `${content}\n${html}`;
}

function staticPreviewBridge(route: string): string {
  return String.raw`<script data-lifemark-static-bridge>
(() => {
  const send = (data) => {
    try { window.parent.postMessage(data, "*"); } catch {}
  };
  const text = (value) => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack || value.message;
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  const report = (message, extra = {}) => send({
    source: "lifemark-preview-errors",
    type: "preview-error",
    kind: "runtime",
    message: text(message) || "Unknown static preview error",
    extra,
    url: location.href,
    timestamp: Date.now(),
  });

  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level]?.bind(console);
    if (!original) continue;
    console[level] = (...args) => {
      original(...args);
      send({
        source: "lifemark-preview",
        type: level === "error" ? "console-error" : level,
        text: args.map(text).join(" "),
      });
    };
  }

  addEventListener("error", (event) => report(event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack,
  }));
  addEventListener("unhandledrejection", (event) => report(event.reason, {
    stack: event.reason?.stack,
  }));
  addEventListener("click", (event) => {
    const link = event.target?.closest?.("a[data-lifemark-route]");
    if (!link) return;
    event.preventDefault();
    send({ type: "lifemark-preview-location", pathname: link.dataset.lifemarkRoute });
  });
  send({ source: "lifemark-preview-errors", type: "preview-error-ready" });
  send({ type: "lifemark-preview-location", pathname: ${JSON.stringify(route)} });
})();
</script>`;
}

function injectStaticBridge(html: string, route: string): string {
  const bridge = staticPreviewBridge(route);
  const head = /<head\b[^>]*>/i.exec(html);
  if (head?.index !== undefined) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}\n${bridge}${html.slice(at)}`;
  }
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  if (htmlTag?.index !== undefined) {
    const at = htmlTag.index + htmlTag[0].length;
    return `${html.slice(0, at)}<head>${bridge}</head>${html.slice(at)}`;
  }
  return `<!doctype html><html><head>${bridge}</head><body>${html}</body></html>`;
}

/**
 * Reports an entry `<script src>` that resolves to a real project file but
 * needs a bundler (TypeScript/JSX) as a "bundler" preview error, using the
 * same postMessage contract as PREVIEW_ERROR_BRIDGE_SCRIPT (see
 * preview-error-bridge.ts) so the existing self-heal / "Preview paused" UI
 * picks it up.
 *
 * Without this, the unrewritten tag keeps its original root-relative src
 * (e.g. "/src/main.tsx"). The browser then fetches that path against the
 * PARENT document's origin, not the project's files, which 404s/CORS-fails
 * silently and leaves the preview permanently blank with no visible error
 * (see #9). This can happen when a project is pinned to the static runtime
 * (persisted `runtime: "static"`, which intentionally wins over file-based
 * re-detection -- see resolveProjectRuntime) but a later edit adds a
 * framework entry point the static, dependency-free renderer can't execute.
 */
function unsupportedEntryScriptBridge(paths: string[]): string {
  const message = `Failed to compile: entry script${paths.length > 1 ? "s" : ""} ${paths.join(", ")} ${
    paths.length > 1 ? "are" : "is"
  } TypeScript/JSX and need a bundler, but this project is currently on the static (no-build) preview engine.`;
  return `<script data-lifemark-unsupported-entry>(function(){
try {
  window.parent.postMessage({
    source: "lifemark-preview-errors",
    type: "preview-error",
    kind: "bundler",
    message: ${JSON.stringify(message)},
    extra: { paths: ${JSON.stringify(paths)} },
    url: location.href,
    timestamp: Date.now()
  }, "*");
} catch (e) {}
})();</script>`;
}

/** Compose a dependency-free static project into one srcdoc document. */
export function buildStaticPreview(
  files: Pick<ProjectFile, "path" | "content">[],
  requestedRoute = "/",
): string {
  const normalized = files.map((file) => ({
    ...file,
    path: normalizePath(file.path),
  }));
  const entry = selectHtmlEntry(normalized, requestedRoute);
  if (!entry) {
    return "<!doctype html><html><body style=\"font-family:system-ui;padding:2rem\">No index.html yet.</body></html>";
  }

  const fileByPath = new Map(normalized.map((file) => [file.path, file]));
  let html = entry.content.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attribute(tag, "href");
    if (!href) return tag;
    const path = resolveLocalReference(href, entry.path);
    const file = path ? fileByPath.get(path) : undefined;
    if (!file || !file.path.toLowerCase().endsWith(".css")) return tag;
    return `<style data-lifemark-file="${file.path}">\n${rewriteCssAssets(file.content, file.path, fileByPath)}\n</style>`;
  });

  // Local script references that need a bundler (TypeScript/JSX) can't be
  // rewritten into a runnable blob import like plain .js/.mjs can -- see
  // unsupportedEntryScriptBridge for what happens if left as-is.
  const unsupportedEntryScripts: string[] = [];
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*(["']).*?\1[^>]*>\s*<\/script>/gis, (tag) => {
    const src = attribute(tag, "src");
    if (!src) return tag;
    const path = resolveLocalReference(src, entry.path);
    const file = path ? fileByPath.get(path) : undefined;
    if (!file) return tag;
    if (/\.(?:m?js)$/i.test(file.path)) {
      return `<script type="module" data-lifemark-file="${file.path}">import "app:/${file.path}";</script>`;
    }
    if (/\.(?:tsx?|jsx)$/i.test(file.path)) {
      unsupportedEntryScripts.push(file.path);
      return `<!-- lifemark: ${file.path} needs a bundler; static preview engine can't execute it -->`;
    }
    return tag;
  });
  html = rewriteHtmlAssetAttributes(html, entry.path, fileByPath);
  html = rewriteLinkAssets(html, entry.path, fileByPath);
  html = rewriteStaticPageLinks(html, entry.path, fileByPath);
  html = injectIntoHead(html, moduleRegistryScript(normalized));
  if (unsupportedEntryScripts.length > 0) {
    html = injectIntoHead(html, unsupportedEntryScriptBridge(unsupportedEntryScripts));
  }
  // LifemarkData SDK — localStorage mode in the editor preview; published
  // deploys inject the hosted-endpoint variant in build-deploy-files. Runs
  // AFTER the bridge so fragment entries are already wrapped in a full
  // document and the SDK always lands in <head>.
  return injectLifemarkDataSdk(injectStaticBridge(html, routeForHtmlPath(entry.path)));
}
