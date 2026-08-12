/**
 * Resolve `<app-slug>.apps.lifemarkai.com` → an app slug.
 *
 * How a request gets here: Traefik matches the wildcard host and applies an
 * `addprefix` middleware of `/preview-by-slug`, so the app receives the ORIGINAL
 * path under that prefix while the browser's address bar keeps the clean host.
 * The slug is therefore in the Host header, not the path — Traefik can rewrite a
 * path but cannot move the host into it.
 *
 * Pure and dependency-free so it can be asserted directly.
 */

/** The wildcard base, e.g. "apps.lifemarkai.com". Must match LIFEMARK_APPS_DOMAIN. */
export function appsDomain(): string {
  return (process.env.LIFEMARK_APPS_DOMAIN ?? "apps.lifemarkai.com")
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
}

/**
 * Extract the app slug from a Host header, or null when the host is not an
 * apps.* host.
 *
 * Returns null (never a guess) for the bare domain, for deeper nesting, and for
 * anything that is not a plausible slug. A wrong answer here serves one user's
 * app on another user's hostname, so every uncertain case fails closed.
 */
export function appSlugFromHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;

  // Strip the port, and any IPv6 brackets, before comparing.
  let host = String(hostHeader).trim().toLowerCase();
  host = host.replace(/^\[(.+)\]$/, "$1");
  const lastColon = host.lastIndexOf(":");
  if (lastColon > -1 && /^\d+$/.test(host.slice(lastColon + 1))) {
    host = host.slice(0, lastColon);
  }
  host = host.replace(/\.+$/, ""); // trailing dot on a fully-qualified name

  const base = appsDomain();
  if (!base || !host.endsWith(`.${base}`)) return null;

  const label = host.slice(0, host.length - base.length - 1);
  if (!label) return null;
  // Exactly one label. "a.b.apps.example.com" is not a valid app host, and
  // treating it as slug "a.b" would let a crafted DNS entry reach an app it
  // should not.
  if (label.includes(".")) return null;
  // Same shape the slug generator produces.
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(label)) return null;

  return label;
}
