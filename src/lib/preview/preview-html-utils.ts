/**
 * Pure, dependency-free HTML helpers for the preview-serving routes.
 *
 * Split out of serve-preview.ts specifically so these are UNIT-TESTABLE:
 * serve-preview.ts imports `createAdminClient` from ../supabase/server.ts,
 * which reads `import.meta.env.VITE_SUPABASE_URL` at module load time — a
 * Vite-only global that throws immediately under the plain `node --import
 * tsx --test` runner this codebase's tests use, before a single assertion
 * ever runs. Anything imported from serve-preview.ts directly is therefore
 * untestable outside a full Vite process. serve-preview.ts re-exports these
 * for callers that already import them from there.
 */

export function previewHeaders(): Record<string, string> {
  const base: Record<string, string> = { "Cache-Control": "no-store, must-revalidate" };
  const crossOrigin = !!process.env.NEXT_PUBLIC_PREVIEW_ORIGIN;
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (crossOrigin && appOrigin) {
    base["Content-Security-Policy"] = `frame-ancestors 'self' ${appOrigin}`;
  } else {
    base["X-Frame-Options"] = "SAMEORIGIN";
  }
  return base;
}

export function rewriteStaticPaths(html: string, projectId: string): string {
  return html.replace(
    /(src|href)="(?!https?:\/\/|\/\/|#|data:|blob:)([^"]+)"/g,
    (_, attr: string, path: string) => {
      const resolved = path.startsWith("/") ? path : `/${path}`;
      return `${attr}="/preview/${projectId}${resolved}"`;
    }
  );
}

/**
 * Bake a "this is a simplified preview" disclosure directly into the raw
 * HTML response.
 *
 * There is no React/editor chrome on the public preview route to float a
 * dismissable card over the render (unlike the interactive editor's own
 * preview pane, which gets exactly that treatment) — whoever a preview link
 * was shared with only ever sees this raw document, so the disclosure has
 * to live inside it. `position: fixed` + `pointer-events: none` keeps it
 * visible without ever intercepting a click meant for the app underneath,
 * and without reflowing the app's own layout (no reserved space, no body
 * padding change).
 */
export function injectSimplifiedPreviewBanner(html: string): string {
  const banner =
    '<div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
    "background:rgba(20,20,20,0.92);color:#f5f5f5;font:11px/1.4 system-ui,-apple-system," +
    "sans-serif;padding:5px 10px;text-align:center;pointer-events:none\">" +
    "Simplified preview — the live app is temporarily unavailable, so this is an " +
    "approximate render and may not reflect backend or dynamic behavior.</div>";
  return /<body[^>]*>/i.test(html)
    ? html.replace(/<body[^>]*>/i, (tag) => `${tag}${banner}`)
    : banner + html;
}
