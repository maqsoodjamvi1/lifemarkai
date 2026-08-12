const DEFAULT_REDIRECT = "/dashboard";

/**
 * Resolve an auth return destination to a local path. Absolute URLs are only
 * accepted when an explicit origin is supplied and the origins match.
 */
export function resolveSafeRedirect(
  requested: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
  allowedOrigin?: string,
): string {
  if (!requested || /[\u0000-\u001f\u007f\\]/.test(requested)) return fallback;

  try {
    const base = allowedOrigin ?? "https://lifemark.invalid";
    const target = new URL(requested, base);
    const baseUrl = new URL(base);

    // Without a real origin, accept relative application paths only.
    if (!allowedOrigin && !requested.startsWith("/")) return fallback;
    if (!requested.startsWith("/") && target.origin !== baseUrl.origin) return fallback;
    if (target.origin !== baseUrl.origin) return fallback;
    if (!target.pathname.startsWith("/") || requested.startsWith("//")) return fallback;

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export function withAuthRedirect(path: "/login" | "/signup", destination: string): string {
  return `${path}?next=${encodeURIComponent(destination)}`;
}
