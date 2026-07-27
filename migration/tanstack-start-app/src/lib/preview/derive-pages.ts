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

export function derivePreviewPages(files: FileLike[]): DerivedPage[] {
  const paths = new Set<string>();

  for (const f of files) {
    const p = f.path.replace(/^\/+/, "");

    // 1. react-router <Route path="…">
    if (/\.(tsx|jsx|ts|js)$/.test(p) && f.content && f.content.includes("<Route")) {
      const re = /<Route[^>]*\bpath=["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content)) !== null) {
        const raw = m[1];
        const route = raw.startsWith("/") ? raw : `/${raw}`;
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
