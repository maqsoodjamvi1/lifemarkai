/** Normalize an in-app route for the preview address bar / iframe path. */
export function normalizeSandboxPathname(pathname: string): string {
  const raw = String(pathname || "").trim();
  if (!raw || raw === "/") return "/";
  // Absolute URLs must never become iframe `src` path segments (OAuth redirects,
  // pasted Supabase URLs, etc. would otherwise paint the provider in-frame).
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) {
    try {
      const u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
      const path = `${u.pathname || "/"}${u.search || ""}${u.hash || ""}`;
      return path.startsWith("/") ? path : `/${path}`;
    } catch {
      return "/";
    }
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/** Join a sandbox preview base URL with an in-app route (Lovable URL bar parity). */
export function sandboxUrlWithPath(baseUrl: string, pathname: string): string {
  try {
    const u = new URL(baseUrl);
    const combined = normalizeSandboxPathname(pathname);
    const hashIdx = combined.indexOf("#");
    const withoutHash = hashIdx >= 0 ? combined.slice(0, hashIdx) : combined;
    const hash = hashIdx >= 0 ? combined.slice(hashIdx + 1) : "";
    const qIdx = withoutHash.indexOf("?");
    const pathOnly = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
    const search = qIdx >= 0 ? withoutHash.slice(qIdx + 1) : "";
    u.pathname = pathOnly || "/";
    u.search = search;
    u.hash = hash;
    return u.toString();
  } catch {
    return baseUrl;
  }
}

/** True when `candidate` is still on the same origin as the sandbox tunnel. */
export function isSamePreviewOrigin(sandboxBaseUrl: string, candidateOriginOrHref: string): boolean {
  try {
    const expected = new URL(sandboxBaseUrl).origin;
    const got = new URL(candidateOriginOrHref, sandboxBaseUrl).origin;
    return expected === got;
  } catch {
    return false;
  }
}
