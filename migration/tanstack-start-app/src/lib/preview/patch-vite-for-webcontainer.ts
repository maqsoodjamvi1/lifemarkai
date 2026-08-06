/**
 * Ensure Vite binds on 0.0.0.0 and HMR works through Modal TLS tunnels
 * (Lovable-style cloud preview) as well as WebContainer.
 */
/**
 * THE fix for "the editor goes blank/frozen while a preview boots".
 *
 * Previews are served from `<id>.preview.lifemarkai.com` and the editor from
 * `lifemarkai.com`. Those are different ORIGINS but the same SITE (one
 * registrable domain), and Chrome's process model is site-keyed by default —
 * so the previewed app and the editor share a single renderer process, and
 * therefore a single main thread.
 *
 * Measured live, not guessed: a 1-second `setInterval` running in the EDITOR
 * skipped from 7s straight to 51s while a preview booted in the iframe — a 44
 * second main-thread stall. During that window the editor could not repaint,
 * CDP's Runtime.evaluate timed out reporting "the renderer may be frozen", and
 * the debugging extension disconnected outright. There were ZERO console
 * errors the whole time, which is exactly the signature of this bug: nothing
 * is broken, the thread is simply busy running someone else's app. Heavier
 * generated projects stall longer, which is why only SOME projects looked
 * blank.
 *
 * `Origin-Agent-Cluster: ?1` asks the browser to key this document's agent
 * cluster by ORIGIN instead of site. Chrome implements that by giving the
 * origin its own process, so the previewed app gets its own main thread and
 * can never again stall the editor. Each preview subdomain is already a
 * distinct origin, so each one lands in its own cluster.
 *
 * This is the same isolation Lovable gets structurally by serving previews
 * from an entirely different registrable domain than their editor. The header
 * buys it without moving anyone's DNS.
 *
 * Safe for our bridges: parent<->preview communication is postMessage only
 * (see veb-bridge / preview-error-bridge), which is unaffected. The
 * `contentDocument` reads in the editor are already null cross-origin and are
 * all guarded; they serve the same-origin srcdoc fallback, which this does not
 * touch. Nothing in the codebase uses `document.domain`, the one API that
 * origin-keying actually disables.
 */
const ORIGIN_KEYED_HEADERS = 'headers: { "Origin-Agent-Cluster": "?1" },';

export function patchViteConfigForWebContainer(content: string): string {
  let patched = patchReactPluginBabelConfig(content);
  if (!patched.trim()) return patched;

  patched = ensureAtAlias(patched);
  patched = ensureReactDedupe(patched);
  patched = ensureReactOptimizeDeps(patched);

  const hasHost = /host\s*:\s*(true|['"]0\.0\.0\.0['"])/.test(patched);
  const hasHmr = /\bhmr\s*:\s*\{/.test(patched);
  const hasAllowedHosts = /allowedHosts\s*:/.test(patched);
  // Only skip if the app already sets the header itself — a `headers` block
  // that does something else still needs origin keying added to it.
  const hasOriginKeying = /Origin-Agent-Cluster/i.test(patched);
  const hasHeaders = /\bheaders\s*:\s*\{/.test(patched);

  const serverBlock = /server\s*:\s*\{/;
  if (serverBlock.test(patched)) {
    const inject = [
      !hasHost ? "host: true," : "",
      !hasAllowedHosts ? "allowedHosts: true," : "",
      // Modal TLS tunnels terminate on 443 — Vite HMR client must use wss.
      !hasHmr ? 'hmr: { protocol: "wss", clientPort: 443 },' : "",
      // Own process for the preview — see ORIGIN_KEYED_HEADERS above.
      !hasOriginKeying && !hasHeaders ? ORIGIN_KEYED_HEADERS : "",
    ]
      .filter(Boolean)
      .map((line) => `\n    ${line}`)
      .join("");
    if (inject) {
      patched = patched.replace(serverBlock, `server: {${inject}`);
    }
    // An existing `headers: {` block gets the entry added rather than skipped,
    // otherwise any app that sets a single header of its own would silently opt
    // out of process isolation.
    if (!hasOriginKeying && hasHeaders) {
      patched = patched.replace(
        /\bheaders\s*:\s*\{/,
        'headers: {\n      "Origin-Agent-Cluster": "?1",',
      );
    }
    return patched;
  }

  const defineConfig = /defineConfig\s*\(\s*\{/;
  if (defineConfig.test(patched)) {
    return patched.replace(
      defineConfig,
      "defineConfig({\n  server: {\n    host: true,\n    allowedHosts: true,\n    hmr: { protocol: \"wss\", clientPort: 443 },\n    " +
        ORIGIN_KEYED_HEADERS +
        "\n  },",
    );
  }

  return `${patched.trim()}\n// Added for cloud/WebContainer preview\nexport const __webcontainerHost = true;\n`;
}

/**
 * shadcn/ui convention: components import from "@/lib/utils", "@/components/…".
 * That "@" is a Vite path alias for /src that the AI frequently forgets to
 * configure. Without it Vite throws "Failed to resolve import @/lib/utils" and
 * the app crashes on mount ("Preview root is empty"). Inject a resolve.alias
 * mapping "@" → the project's src dir so these imports always resolve.
 *
 * Uses import.meta.dirname (Node 20.11+ / Vite 5, present in the sandbox) so we
 * don't need to add a `path`/`url` import to an arbitrary config shape.
 */
export function ensureAtAlias(content: string): string {
  if (!content.trim()) return content;
  // Already has an "@" alias — leave it alone.
  if (/alias\s*:\s*\{[^}]*['"]@['"]\s*:/.test(content)) return content;

  const aliasValue = 'new URL("./src", import.meta.url).pathname';

  // Case 1: a resolve: { ... } block exists — add/extend its alias.
  const resolveBlock = /resolve\s*:\s*\{/;
  if (resolveBlock.test(content)) {
    if (/resolve\s*:\s*\{[\s\S]*?alias\s*:\s*\{/.test(content)) {
      // resolve.alias exists but has no "@" — add it as the first entry.
      return content.replace(
        /(resolve\s*:\s*\{[\s\S]*?alias\s*:\s*\{)/,
        `$1\n      "@": ${aliasValue},`,
      );
    }
    return content.replace(
      resolveBlock,
      `resolve: {\n    alias: { "@": ${aliasValue} },`,
    );
  }

  // Case 2: no resolve block — insert one right after defineConfig({.
  const defineConfig = /defineConfig\s*\(\s*\{/;
  if (defineConfig.test(content)) {
    return content.replace(
      defineConfig,
      `defineConfig({\n  resolve: { alias: { "@": ${aliasValue} } },`,
    );
  }

  return content;
}

/**
 * THE fix for blank previews caused by "Invalid hook call … more than one copy
 * of React" → `Cannot read properties of null (reading 'useRef')` inside
 * react-router-dom's <BrowserRouter>. Generated apps never write a dedupe, so
 * Vite's dep-optimizer can pre-bundle react-router-dom against a SECOND physical
 * copy of React — two Reacts in the module graph, hooks throw null, #root stays
 * empty. `resolve.dedupe` forces every bare `react`/`react-dom` import to the one
 * copy at the project root. Applied to EVERY app config in the pipeline so no
 * generated project can hit the dual-React crash again.
 */
export function ensureReactDedupe(content: string): string {
  if (!content.trim()) return content;
  // Already dedupes react — leave alone.
  if (/dedupe\s*:\s*\[[^\]]*['"]react['"]/.test(content)) return content;

  const dedupeEntry = 'dedupe: ["react", "react-dom", "react-router-dom"],';

  // Case 1: a resolve: { ... } block exists (ensureAtAlias guarantees one for
  // any defineConfig shape) — add dedupe as the first entry.
  const resolveBlock = /resolve\s*:\s*\{/;
  if (resolveBlock.test(content)) {
    return content.replace(resolveBlock, `resolve: {\n    ${dedupeEntry}`);
  }

  // Case 2: no resolve block — insert one right after defineConfig({.
  const defineConfig = /defineConfig\s*\(\s*\{/;
  if (defineConfig.test(content)) {
    return content.replace(
      defineConfig,
      `defineConfig({\n  resolve: { ${dedupeEntry} },`,
    );
  }

  return content;
}

/**
 * Pair with {@link ensureReactDedupe}: force React, ReactDOM and react-router-dom
 * to be pre-bundled together in a SINGLE optimize pass. Without this, Vite can
 * discover react-router-dom late and optimize it separately against its own
 * React copy (the "multiple react-dom optimize hashes" symptom), reintroducing
 * the dual-React crash even when dedupe is set. Only injected when the config has
 * no optimizeDeps of its own, so we never fight an author's explicit setup.
 *
 * Only react + react-dom are force-included — they exist in every React app.
 * react-router-dom is intentionally left out of `include` (listing an
 * uninstalled dep in optimizeDeps.include makes Vite throw "could not be
 * resolved"); dedupe already pins its React to the single root copy.
 */
export function ensureReactOptimizeDeps(content: string): string {
  if (!content.trim()) return content;
  if (/optimizeDeps\s*:/.test(content)) return content;

  const includeBlock = 'optimizeDeps: { include: ["react", "react-dom"] },';
  const defineConfig = /defineConfig\s*\(\s*\{/;
  if (defineConfig.test(content)) {
    return content.replace(defineConfig, `defineConfig({\n  ${includeBlock}`);
  }
  return content;
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

import { injectGuestCommentsIntoHtml } from "./inject-guest-comments.ts";
import {
  injectVebBridgeIntoHtml,
  injectVebBridgeIntoJsxDocument,
} from "./veb-bridge.ts";

const NEXT_LAYOUT_RE = /^(src\/)?app\/layout\.(t|j)sx?$/;
// TanStack Start renders the document from src/routes/__root.tsx — there is no
// index.html and no app/layout.tsx, so before this existed the visual-edit
// bridge was never injected into a TanStack Start app at all. Since
// tanstack-start is the DEFAULT framework, click-to-edit was silently dead for
// every new project.
const TSS_ROOT_RE = /^src\/routes\/__root\.(t|j)sx?$/;

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
    // Frameworks whose document root is a JSX module rather than an index.html:
    // Next.js App Router (app/layout.tsx) and TanStack Start (__root.tsx).
    if (NEXT_LAYOUT_RE.test(norm) || TSS_ROOT_RE.test(norm)) {
      return { ...file, content: injectVebBridgeIntoJsxDocument(file.content) };
    }
    return file;
  });
}
