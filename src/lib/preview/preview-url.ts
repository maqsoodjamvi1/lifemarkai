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
 * Query params mirror the standard signed-preview shape: token + sha + load_id.
 */

export interface BuildPreviewUrlOpts {
  projectId: string;
  /** Signed preview token from /api/preview/token (omit for unauthenticated/local). */
  token?: string;
  /** Build/commit hash to render (advisory until snapshot builds exist). */
  sha?: string;
  /** Override the origin (else reads NEXT_PUBLIC_PREVIEW_ORIGIN). */
  origin?: string;
  /**
   * Per-load correlation id (parity with Lovable's `__lovable_load_id`). Lets
   * preview logs/telemetry tie a specific iframe load back to an editor session.
   * Advisory only — the serve route ignores it.
   */
  loadId?: string;
}

export function buildPreviewUrl(opts: BuildPreviewUrlOpts): string {
  const { projectId, token, sha, loadId } = opts;
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
  if (loadId) qs.set("load_id", loadId);
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Append a `load_id` to an already-built preview URL (e.g. one returned by the
 * mint route) without clobbering existing params. Idempotent — if a load_id is
 * already present it's left as-is.
 */
export function withLoadId(url: string, loadId: string | undefined): string {
  if (!url || !loadId) return url;
  if (/[?&]load_id=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "load_id=" + encodeURIComponent(loadId);
}

/** Generate a per-load correlation id (browser-safe, falls back if crypto is absent). */
export function newLoadId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `ld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export interface PreviewBarLabelOpts {
  projectId?: string;
  previewPath: string;
  deployedUrl?: string | null;
  sandboxUrl?: string | null;
}

/**
 * Lovable-parity address bar label — shows stable host when configured,
 * otherwise the in-app route (fallback iframe) or sandbox host.
 */
export function getPreviewBarLabel(opts: PreviewBarLabelOpts): string {
  const path = opts.previewPath.startsWith("/") ? opts.previewPath : `/${opts.previewPath}`;
  if (opts.deployedUrl) {
    try {
      const u = new URL(opts.deployedUrl);
      return u.host + (path !== "/" ? path : "");
    } catch {
      return opts.deployedUrl.replace(/^https?:\/\//, "");
    }
  }
  if (opts.sandboxUrl) {
    try {
      const u = new URL(opts.sandboxUrl);
      return u.host + (path !== "/" ? path : "");
    } catch {
      return opts.sandboxUrl;
    }
  }
  const configured = process.env.NEXT_PUBLIC_PREVIEW_ORIGIN ?? "";
  if (opts.projectId && configured.includes("{id}")) {
    const host = configured
      .replace(/^https?:\/\//, "")
      .replace(/\{id\}/g, opts.projectId.slice(0, 12))
      .replace(/\/$/, "");
    return host + path;
  }
  if (opts.projectId && configured) {
    const host = configured.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `${host}/preview/${opts.projectId.slice(0, 8)}${path === "/" ? "" : path}`;
  }
  return path;
}
