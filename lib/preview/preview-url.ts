/**
 * buildPreviewUrl — construct the signed preview URL for a project.
 *
 * Client-safe (no crypto/secrets). The preview HOST is configurable so the
 * built app can be served cross-origin (recommended: isolates the untrusted
 * app from the editor origin) or same-origin as a fallback:
 *
 *   NEXT_PUBLIC_PREVIEW_ORIGIN unset      → same-origin  "/preview/<id>?…"
 *   = "https://preview.lifemarkai.com"    → "https://preview.lifemarkai.com/preview/<id>?…"
 *   = "https://{id}.preview.lifemarkai.com" (contains "{id}") → per-project subdomain
 *
 * Query params mirror the standard signed-preview shape: token + sha.
 */

export interface BuildPreviewUrlOpts {
  projectId: string;
  /** Signed preview token from /api/preview/token (omit for unauthenticated/local). */
  token?: string;
  /** Build/commit hash to render (advisory until snapshot builds exist). */
  sha?: string;
  /** Override the origin (else reads NEXT_PUBLIC_PREVIEW_ORIGIN). */
  origin?: string;
}

export function buildPreviewUrl(opts: BuildPreviewUrlOpts): string {
  const { projectId, token, sha } = opts;
  const configured = opts.origin ?? process.env.NEXT_PUBLIC_PREVIEW_ORIGIN ?? "";

  let base: string;
  if (!configured) {
    base = `/preview/${projectId}`;
  } else if (configured.includes("{id}")) {
    // Per-project subdomain, e.g. https://{id}.preview.lifemarkai.com
    base = `${configured.replace(/\{id\}/g, projectId).replace(/\/$/, "")}/preview/${projectId}`;
  } else {
    base = `${configured.replace(/\/$/, "")}/preview/${projectId}`;
  }

  const qs = new URLSearchParams();
  if (token) qs.set("token", token);
  if (sha) qs.set("sha", sha);
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}
