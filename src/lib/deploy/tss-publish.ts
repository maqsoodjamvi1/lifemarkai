/**
 * TanStack Start publish support — closes the "TSS apps can't publish" hole.
 *
 * The static publish pipeline (publish-build.ts → build-store → served by
 * preview-by-slug) needs a root index.html. A TSS SSR build emits
 * dist/client/ + dist/server/ with NO index.html anywhere, so TSS projects —
 * the exact projects routed to TSS because they asked for auth/payments/db —
 * published as a degraded bundled shell.
 *
 * Fix: build TSS projects for publish in TanStack Start's SPA mode
 * (spa.enabled), with the prerendered shell written to /index.html
 * (spa.prerender.outputPath). Dev and preview keep full SSR — the switch is
 * the LM_PUBLISH_SPA=1 env var, which only the publish build sets.
 *
 * Two pieces, both pure so they're testable without a filesystem:
 *
 *  - ensureTssSpaPublishHook(): guarantees a project's vite.config honors
 *    LM_PUBLISH_SPA. New scaffolds ship with the hook; projects generated
 *    before it get the same options injected into their tanstackStart(...)
 *    call at publish time (temp-dir copy only — the user's source is never
 *    touched).
 *
 *  - rerootClientBuild(): SPA-mode output still lands under dist/client/.
 *    Hoisting only index.html to the root (the old behavior) breaks every
 *    relative asset reference; this re-roots the WHOLE client dir and drops
 *    server-only output instead.
 */

export interface PublishFile {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
}

/**
 * The exact options the scaffold ships. Injected verbatim into legacy
 * configs so old and new projects publish identically.
 */
export const TSS_SPA_PUBLISH_OPTIONS =
  'spa: { enabled: process.env.LM_PUBLISH_SPA === "1", prerender: { outputPath: "/index.html" } }';

/**
 * Ensure a vite config's tanstackStart() call honors LM_PUBLISH_SPA.
 * Returns the (possibly rewritten) config. Unchanged when:
 *  - the file has no tanstackStart() call (not a TSS project), or
 *  - it already references LM_PUBLISH_SPA (new scaffold), or
 *  - it already configures `spa` itself (user's explicit choice wins).
 */
export function ensureTssSpaPublishHook(viteConfig: string): string {
  if (!/tanstackStart\s*\(/.test(viteConfig)) return viteConfig;
  if (viteConfig.includes("LM_PUBLISH_SPA")) return viteConfig;
  if (/tanstackStart\s*\(\s*\{[^)]*\bspa\s*:/s.test(viteConfig)) return viteConfig;

  // tanstackStart() → tanstackStart({ <options> })
  const bare = /tanstackStart\s*\(\s*\)/;
  if (bare.test(viteConfig)) {
    return viteConfig.replace(bare, `tanstackStart({ ${TSS_SPA_PUBLISH_OPTIONS} })`);
  }

  // tanstackStart({ …existing options ) → prepend ours into the object.
  const withOptions = /tanstackStart\s*\(\s*\{/;
  if (withOptions.test(viteConfig)) {
    return viteConfig.replace(withOptions, (m) => `${m} ${TSS_SPA_PUBLISH_OPTIONS},`);
  }

  // tanstackStart(someVariable) or another shape we don't understand —
  // leave it alone rather than corrupt it; the build will fall back and the
  // log will say why.
  return viteConfig;
}

const SERVER_ONLY_PREFIXES = ["server/", ".output/", "nitro/", ".nitro/"];
const SERVER_ONLY_FILES = new Set(["nitro.json"]);

/**
 * If the build has no root index.html but a client/index.html (TSS SPA-mode
 * layout — also seen as public/index.html from some presets), re-root the
 * whole client directory and drop server-only output.
 *
 * Returns the re-rooted list, or null when the layout doesn't apply (caller
 * keeps its existing behavior).
 */
export function rerootClientBuild(output: PublishFile[]): PublishFile[] | null {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (output.some((f) => norm(f.path) === "index.html")) return null;

  const prefix = ["client/", "public/"].find((pre) =>
    output.some((f) => norm(f.path) === `${pre}index.html`),
  );
  if (!prefix) return null;

  const rerooted: PublishFile[] = [];
  for (const f of output) {
    const p = norm(f.path);
    if (SERVER_ONLY_PREFIXES.some((pre) => p.startsWith(pre))) continue;
    if (SERVER_ONLY_FILES.has(p)) continue;
    rerooted.push(p.startsWith(prefix) ? { ...f, path: p.slice(prefix.length) } : { ...f, path: p });
  }
  return rerooted;
}
