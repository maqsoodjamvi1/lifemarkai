/**
 * Derive the app's navigable pages from its source files — powers the
 * Lovable-style "current page, switch pages" dropdown in the preview URL bar.
 *
 * Sources (merged + deduped):
 *  1. `<Route path="/x" …>` declarations anywhere in src/ (react-router)
 *  2. src/pages/<Name>.tsx convention (Index → "/", About → "/about")
 *  3. Next-style app router: src/app/<seg>/page.tsx or app/<seg>/page.tsx
 *
 * Dynamic segments (`:id`, `[slug]`, `*`) are skipped — they aren't directly
 * navigable without a param.
 */

export interface DerivedPage {
  label: string;
  path: string;
}

interface FileLike {
  path: string;
  content?: string | null;
}

function labelFor(path: string): string {
  if (path === "/") return "Homepage";
  const seg = path.replace(/^\//, "").split("/").filter(Boolean).pop() ?? "";
  const words = seg.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : path;
}

function isDynamic(path: string): boolean {
  return /[:*[\]]/.test(path);
}

/**
 * Resolve every `<Route path="…">` in a file to an ABSOLUTE path, honoring
 * React Router v6 nesting. Previously every match was resolved independently
 * by just prepending "/" when missing — correct for a top-level route, but
 * wrong for a nested child route, whose relative path is relative to its
 * PARENT's path, not root:
 *
 *   <Route path="/dashboard" element={<Layout />}>
 *     <Route path="settings" element={<Settings />} />   // → /dashboard/settings
 *   </Route>
 *
 * The old code turned `path="settings"` into `/settings` — a page the
 * dropdown offered that doesn't exist at that URL in the actual app (nested
 * routes are idiomatic react-router-dom, not an edge case). This walks the
 * JSX tag stream tracking open `<Route>`/`</Route>` pairs so a child's
 * relative path resolves against its actual parent.
 */
function resolveRouteEntries(content: string): string[] {
  const results: string[] = [];
  const stack: string[] = ["/"];
  let i = 0;

  while (i < content.length) {
    const openIdx = content.indexOf("<Route", i);
    const closeIdx = content.indexOf("</Route>", i);
    if (openIdx === -1 && closeIdx === -1) break;

    if (closeIdx !== -1 && (openIdx === -1 || closeIdx < openIdx)) {
      if (stack.length > 1) stack.pop();
      i = closeIdx + "</Route>".length;
      continue;
    }

    // Not actually "<Route" as a tag name (e.g. "<RouteGuard") — skip past
    // just the literal text and keep scanning.
    const afterName = content[openIdx + 6];
    if (afterName !== undefined && !/[\s/>]/.test(afterName)) {
      i = openIdx + 6;
      continue;
    }

    // Find this tag's closing ">", tracking `{}`/quote nesting so a JSX
    // expression attribute containing its own tags (`element={<Layout />}`)
    // doesn't get mistaken for the end of the <Route> tag itself — a plain
    // `[^>]*` scan stops at the FIRST ">", which lands inside that nested
    // element and silently corrupts every subsequent match in the file.
    let j = openIdx + 6;
    let braceDepth = 0;
    let quote: string | null = null;
    let tagEnd = -1;
    for (; j < content.length; j++) {
      const ch = content[j];
      if (quote) {
        if (ch === "\\") { j++; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "{") { braceDepth++; continue; }
      if (ch === "}") { braceDepth--; continue; }
      if (braceDepth > 0) continue;
      if (ch === ">") { tagEnd = j; break; }
    }
    if (tagEnd === -1) break; // malformed/truncated — stop rather than misparse

    let k = tagEnd - 1;
    while (k > openIdx && /\s/.test(content[k])) k--;
    const selfClosing = content[k] === "/";

    const tagText = content.slice(openIdx, tagEnd + 1);
    const pathMatch = /\bpath=["']([^"']+)["']/.exec(tagText);
    const parent = stack[stack.length - 1];
    let resolved = parent;
    if (pathMatch) {
      const raw = pathMatch[1];
      resolved = raw.startsWith("/") ? raw : `${parent === "/" ? "" : parent}/${raw}`;
      results.push(resolved);
    }
    // A layout route (no `path`) still nests its children under its own
    // parent unchanged; a route WITH a path nests children under it.
    if (!selfClosing) stack.push(resolved);

    i = tagEnd + 1;
  }

  return results;
}

export function derivePreviewPages(files: FileLike[]): DerivedPage[] {
  const paths = new Set<string>();

  for (const f of files) {
    const p = f.path.replace(/^\/+/, "");

    // 1. react-router <Route path="…"> (nesting-aware — see resolveRouteEntries)
    if (/\.(tsx|jsx|ts|js)$/.test(p) && f.content && f.content.includes("<Route")) {
      for (const route of resolveRouteEntries(f.content)) {
        if (!isDynamic(route)) paths.add(route === "" ? "/" : route);
      }
    }

    // 2. src/pages convention
    const pageMatch = p.match(/^src\/pages\/([A-Za-z0-9_-]+)\.(tsx|jsx)$/);
    if (pageMatch) {
      const name = pageMatch[1];
      if (/^(index|home|homepage)$/i.test(name)) paths.add("/");
      else if (!/^notfound$|^404$/i.test(name)) {
        paths.add(
          "/" +
            name
              .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
              .toLowerCase(),
        );
      }
    }

    // 3. app-router page.tsx
    const appMatch = p.match(/^(?:src\/)?app\/(.*)page\.(tsx|jsx)$/);
    if (appMatch) {
      const seg = appMatch[1].replace(/\/$/, "");
      const route = "/" + seg.split("/").filter((s) => s && !s.startsWith("(")).join("/");
      if (!isDynamic(route)) paths.add(route === "" ? "/" : route);
    }
  }

  const list = Array.from(paths);
  list.sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
  return list.map((path) => ({ path, label: labelFor(path) }));
}
