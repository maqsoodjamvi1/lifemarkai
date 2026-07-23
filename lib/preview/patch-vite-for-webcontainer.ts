/**
 * Ensure Vite binds on 0.0.0.0 and HMR works through Modal TLS tunnels
 * (Lovable-style cloud preview) as well as WebContainer.
 */
export function patchViteConfigForWebContainer(content: string): string {
  let patched = patchReactPluginBabelConfig(content);
  if (!patched.trim()) return patched;

  const hasHost = /host\s*:\s*(true|['"]0\.0\.0\.0['"])/.test(patched);
  const hasHmr = /\bhmr\s*:\s*\{/.test(patched);
  const hasAllowedHosts = /allowedHosts\s*:/.test(patched);

  const serverBlock = /server\s*:\s*\{/;
  if (serverBlock.test(patched)) {
    const inject = [
      !hasHost ? "host: true," : "",
      !hasAllowedHosts ? "allowedHosts: true," : "",
      // Modal TLS tunnels terminate on 443 — Vite HMR client must use wss.
      !hasHmr ? 'hmr: { protocol: "wss", clientPort: 443 },' : "",
    ]
      .filter(Boolean)
      .map((line) => `\n    ${line}`)
      .join("");
    if (inject) {
      patched = patched.replace(serverBlock, `server: {${inject}`);
    }
    return patched;
  }

  const defineConfig = /defineConfig\s*\(\s*\{/;
  if (defineConfig.test(patched)) {
    return patched.replace(
      defineConfig,
      "defineConfig({\n  server: {\n    host: true,\n    allowedHosts: true,\n    hmr: { protocol: \"wss\", clientPort: 443 },\n  },",
    );
  }

  return `${patched.trim()}\n// Added for cloud/WebContainer preview\nexport const __webcontainerHost = true;\n`;
}

/**
 * Some generated projects run @vitejs/plugin-react against a Babel build where
 * its old TypeScript preset options fail with:
 * ".allowDeclareFields option has been removed". Passing an explicit empty
 * Babel plugin list keeps the React plugin on a clean Babel path.
 */
export function patchReactPluginBabelConfig(content: string): string {
  if (!content.trim()) return content;
  if (!/@vitejs\/plugin-react/.test(content)) return content;
  if (/react\s*\(\s*\{[\s\S]*?\bbabel\s*:/.test(content)) return content;
  if (/react\s*\(\s*\{/.test(content)) {
    return content.replace(
      /react\s*\(\s*\{/g,
      "react({ babel: { plugins: [] },",
    );
  }

  return content.replace(
    /react\s*\(\s*\)/g,
    "react({ babel: { plugins: [] } })",
  );
}

import { injectGuestCommentsIntoHtml } from "./inject-guest-comments";
import { injectVebBridgeIntoHtml, injectVebBridgeIntoNextLayout } from "./veb-bridge";

const NEXT_LAYOUT_RE = /^(src\/)?app\/layout\.(t|j)sx?$/;

export interface WebContainerPatchOpts {
  projectId?: string;
  isPublic?: boolean;
  appOrigin?: string;
}

// Vite entry points, in priority order. The AI frequently emits an index.html
// whose <script src> points at the wrong one (e.g. /src/main.ts when the file is
// src/main.tsx) or uses type="text/javascript" instead of "module" — either of
// which makes real Vite 404 the entry and render a blank page. We repair it
// against the files that actually exist.
const ENTRY_CANDIDATES = [
  "src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js",
  "src/index.tsx", "src/index.jsx",
];

function findEntry(paths: Set<string>): string | null {
  for (const c of ENTRY_CANDIDATES) if (paths.has(c)) return c;
  return null;
}

/**
 * Ensure index.html loads a real, existing module entry. Rewrites a mis-pointed
 * or wrongly-typed entry <script> to `<script type="module" src="/<entry>">`,
 * and injects one if the HTML has no entry script at all.
 */
export function fixHtmlEntry(html: string, entry: string | null): string {
  if (!entry) return html;
  const correct = `<script type="module" src="/${entry}"></script>`;
  const entryScript = /<script\b[^>]*\bsrc=["']\/?src\/(?:main|index)\.[a-z]+["'][^>]*>\s*<\/script>/i;
  if (entryScript.test(html)) {
    const fixed = html.replace(entryScript, correct);
    // Only rewrite if it actually changed something incorrect (avoid churn).
    return fixed;
  }
  // No entry script present — inject before </body> (or append).
  return html.includes("</body>")
    ? html.replace("</body>", `    ${correct}\n  </body>`)
    : `${html}\n${correct}`;
}

export function patchFilesForWebContainer<T extends { path: string; content?: string | null }>(
  files: T[],
  opts?: WebContainerPatchOpts,
): T[] {
  const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/").replace(/^\/+/, "")));
  const entry = findEntry(paths);
  const injectGuest =
    !!opts?.isPublic && !!opts?.projectId;
  return files.map((file) => {
    const path = file.path.replace(/\\/g, "/");
    const norm = path.replace(/^\//, "");
    if (file.content == null) return file;
    if (/vite\.config\.(t|j)sx?$/.test(path)) {
      return { ...file, content: patchViteConfigForWebContainer(file.content) };
    }
    // Visual-edit bridge: injected (dormant) into the app's HTML entry so the
    // parent editor can drive element picking via postMessage (Lovable-style).
    // Also repair a mis-pointed entry <script> so real Vite finds the app.
    if (/^(public\/)?index\.html$/.test(norm)) {
      let html = fixHtmlEntry(file.content, entry);
      html = injectVebBridgeIntoHtml(html);
      if (injectGuest) {
        html = injectGuestCommentsIntoHtml(html, {
          projectId: opts!.projectId!,
          origin: opts?.appOrigin,
        });
      }
      return { ...file, content: html };
    }
    // Next.js App Router: no index.html — inject bridges into root layout.
    if (NEXT_LAYOUT_RE.test(norm)) {
      return { ...file, content: injectVebBridgeIntoNextLayout(file.content) };
    }
    return file;
  });
}
