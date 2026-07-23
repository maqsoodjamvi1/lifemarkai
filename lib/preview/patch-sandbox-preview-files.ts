import {
  patchFilesForWebContainer,
  type WebContainerPatchOpts,
} from "./patch-vite-for-webcontainer";

/**
 * Synthesize missing Vite entry files. Incremental builds return only CHANGED
 * files, so a project scaffolded without index.html / src/main.tsx can gain a
 * full src/App.tsx yet never boot (observed: 4-file scaffold — package.json,
 * README, App.tsx, index.css — sandbox died with no runnable entry). Adding
 * the standard entries here makes every App-bearing project bootable without
 * touching what the AI generated.
 */
function ensureViteEntryFiles<T extends { path: string; content?: string | null }>(
  files: T[],
): T[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");
  const paths = new Set(files.map((f) => norm(f.path)));

  const appPath = [...paths].find((p) => /^src\/App\.(tsx|jsx)$/i.test(p));
  const isNext = [...paths].some(
    (p) => /^app\/.*(page|layout)\.(tsx|jsx)$/.test(p) || /^next\.config\./.test(p),
  );
  const isVue = [...paths].some((p) => /\.vue$/.test(p));
  if (!appPath || isNext || isVue) return files;

  const hasHtml = [...paths].some((p) => /^(public\/)?index\.html$/.test(p));
  const existingMain = [...paths].find((p) =>
    /^src\/(main|index)\.(tsx|jsx|ts|js)$/.test(p),
  );
  const hasViteConfigEarly = [...paths].some((p) => /^vite\.config\.(t|j)sx?$/.test(p));

  if (hasHtml && existingMain && hasViteConfigEarly) return files;

  const isTs = appPath.toLowerCase().endsWith(".tsx");
  const mainPath = existingMain ?? (isTs ? "src/main.tsx" : "src/main.jsx");
  const extras: Array<{ path: string; content: string }> = [];

  if (!existingMain) {
    const hasCss = paths.has("src/index.css");
    extras.push({
      path: mainPath,
      content:
        `import React from "react";\n` +
        `import ReactDOM from "react-dom/client";\n` +
        `import App from "./App";\n` +
        (hasCss ? `import "./index.css";\n` : "") +
        `\n` +
        `ReactDOM.createRoot(document.getElementById("root")${isTs ? "!" : ""}).render(\n` +
        `  <React.StrictMode>\n` +
        `    <App />\n` +
        `  </React.StrictMode>,\n` +
        `);\n`,
    });
  }

  // Without a vite.config, Vite 5 blocks tunnel hostnames (allowedHosts).
  const hasViteConfig = [...paths].some((p) => /^vite\.config\.(t|j)sx?$/.test(p));
  if (!hasViteConfig) {
    extras.push({
      path: "vite.config.ts",
      content:
        `import { defineConfig } from "vite";\n\n` +
        `export default defineConfig({\n` +
        `  server: { host: true, allowedHosts: true },\n` +
        `  preview: { host: true, allowedHosts: true },\n` +
        `});\n`,
    });
  }

  if (!hasHtml) {
    extras.push({
      path: "index.html",
      content:
        `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n` +
        `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n` +
        `    <title>App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n` +
        `    <script type="module" src="/${mainPath}"></script>\n  </body>\n</html>\n`,
    });
  }

  // package.json repair: a scaffold without a dev script or the vite dep can
  // never `npm run dev` (observed: scripts entirely absent). Merge in the
  // minimum needed to boot without touching anything else.
  const patched = files.map((f) => {
    if (norm(f.path) !== "package.json" || f.content == null) return f;
    try {
      const pkg = JSON.parse(f.content) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      let changed = false;
      if (!pkg.scripts?.dev) {
        pkg.scripts = { ...(pkg.scripts ?? {}), dev: "vite" };
        changed = true;
      }
      const hasVite = !!(pkg.dependencies?.vite || pkg.devDependencies?.vite);
      if (!hasVite) {
        pkg.devDependencies = {
          ...(pkg.devDependencies ?? {}),
          vite: "^5.4.0",
          "@vitejs/plugin-react": "^4.3.0",
        };
        changed = true;
      }
      return changed ? { ...f, content: JSON.stringify(pkg, null, 2) } : f;
    } catch {
      return f; // malformed package.json — leave to the error surface
    }
  });

  return [...patched, ...(extras as unknown as T[])];
}

/** Vite host + VEB bridge + optional guest comments for cloud sandbox previews. */
export function patchSandboxPreviewFiles<T extends { path: string; content?: string | null }>(
  files: T[],
  opts?: WebContainerPatchOpts,
): T[] {
  return patchFilesForWebContainer(ensureViteEntryFiles(files), opts);
}
