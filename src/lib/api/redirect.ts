/**
 * Redirect responses that are safe to return from a handler which ALSO sets cookies.
 *
 * DO NOT replace these with `Response.redirect()`. Per the Fetch spec,
 * `Response.redirect()` returns a response whose headers guard is "immutable",
 * so any later write to its headers throws `TypeError: immutable`.
 *
 * That matters because TanStack Start merges request-scoped cookies into the
 * outgoing response in `mergeEventResponseHeaders`
 * (@tanstack/start-server-core/dist/esm/request-response.js):
 *
 *     if (response.ok) return;                    // 2xx short-circuits
 *     const eventSetCookies = getSetCookieValues(event.res.headers);
 *     if (eventSetCookies.length === 0) return;   // no cookies short-circuits
 *     response.headers.delete("set-cookie");      // <-- throws on immutable headers
 *
 * So the crash needs THREE things at once: a non-2xx status, at least one cookie
 * written during the request, and a response built by `Response.redirect()`.
 * An OAuth callback is exactly that combination — `exchangeCodeForSession()`
 * writes the Supabase session cookies and then we redirect — which is why
 * /auth/callback returned `{"status":500,"unhandled":true,"message":"HTTPError"}`
 * while every 200-returning route was fine.
 *
 * A plain `new Response(null, { status, headers })` has a mutable "response"
 * guard, so the framework can append Set-Cookie and the session survives.
 *
 * Note `Response.redirect()` also validates that the URL is absolute; callers
 * here already build absolute URLs via `new URL(to, origin)`, so `toAbsolute()`
 * keeps that guarantee explicit rather than silently emitting a relative Location.
 */

/** Resolve `to` against `base` and fail loudly rather than emit a relative Location. */
function toAbsolute(to: string | URL, base?: string | URL): string {
  if (to instanceof URL) return to.toString();
  return base ? new URL(to, base).toString() : new URL(to).toString();
}

/**
 * 302 Found — the default for OAuth callbacks and auth guards.
 *
 * @param to   absolute URL, or a path when `base` is supplied
 * @param base origin to resolve a relative `to` against (usually `new URL(request.url).origin`)
 */
export function redirectResponse(to: string | URL, base?: string | URL): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: toAbsolute(to, base) },
  });
}

/**
 * Redirect with an explicit status (303 after a POST, 307/308 to preserve method).
 */
export function redirectResponseWithStatus(
  to: string | URL,
  status: 301 | 302 | 303 | 307 | 308,
  base?: string | URL,
): Response {
  return new Response(null, {
    status,
    headers: { Location: toAbsolute(to, base) },
  });
}
