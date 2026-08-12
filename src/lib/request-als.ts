/**
 * Request-scoped context so next/headers cookies() works when existing
 * app/api / lib/ai/http handlers run under TanStack Start (no Next process).
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestAlsContext = {
  request: Request;
  cookies: Map<string, string>;
  pendingSetCookies: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }>;
};

type Als = AsyncLocalStorage<RequestAlsContext>;

/** Literal key — must stay inlined so esbuild lazy-init cannot leave it undefined. */
function getAls(): Als {
  const g = globalThis as typeof globalThis & {
    __lifemark_request_als_store__?: Als;
  };
  if (!g.__lifemark_request_als_store__) {
    g.__lifemark_request_als_store__ = new AsyncLocalStorage<RequestAlsContext>();
  }
  return g.__lifemark_request_als_store__;
}

export function getRequestAls(): RequestAlsContext | undefined {
  return getAls().getStore();
}

function parseCookies(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) map.set(trimmed, "");
    else map.set(trimmed.slice(0, eq), decodeURIComponent(trimmed.slice(eq + 1)));
  }
  return map;
}

export async function runWithRequestContext<T>(
  request: Request,
  fn: () => Promise<T>,
): Promise<{ result: T; pendingSetCookies: RequestAlsContext["pendingSetCookies"] }> {
  const ctx: RequestAlsContext = {
    request,
    cookies: parseCookies(request.headers.get("cookie")),
    pendingSetCookies: [],
  };
  const result = await getAls().run(ctx, fn);
  return { result, pendingSetCookies: ctx.pendingSetCookies };
}

export function formatSetCookie(
  name: string,
  value: string,
  options?: Record<string, unknown>,
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (!options) return parts.join("; ");
  if (options.maxAge != null) parts.push(`Max-Age=${Number(options.maxAge)}`);
  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  } else if (typeof options.expires === "string") {
    parts.push(`Expires=${options.expires}`);
  }
  if (options.path) parts.push(`Path=${String(options.path)}`);
  if (options.domain) parts.push(`Domain=${String(options.domain)}`);
  if (options.secure) parts.push("Secure");
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) {
    const ss = String(options.sameSite);
    parts.push(`SameSite=${ss.charAt(0).toUpperCase()}${ss.slice(1)}`);
  }
  return parts.join("; ");
}

export function applySetCookies(
  response: Response,
  pending: RequestAlsContext["pendingSetCookies"],
): Response {
  if (!pending.length) return response;
  const headers = new Headers(response.headers);
  for (const { name, value, options } of pending) {
    headers.append("set-cookie", formatSetCookie(name, value, options));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
