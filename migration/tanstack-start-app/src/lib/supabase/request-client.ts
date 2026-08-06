/**
 * Framework-agnostic Supabase server client from a Fetch Request's Cookie header.
 * Used by lib/ai/http/* under TanStack Start / AI worker (no next/headers).
 */
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../../types/database.ts";

export type PendingSetCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

const PENDING = Symbol.for("lifemark.pendingSetCookies");

function parseCookieHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) map.set(trimmed, "");
    else {
      map.set(trimmed.slice(0, eq), decodeURIComponent(trimmed.slice(eq + 1)));
    }
  }
  return map;
}

/** Pending Set-Cookie ops recorded during the request (session refresh, etc.). */
export function getPendingSetCookies(req: Request): PendingSetCookie[] {
  const bag = (req as unknown as Record<symbol, PendingSetCookie[]>)[PENDING];
  return bag ?? [];
}

function formatSetCookie(
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

export function applyPendingSetCookies(req: Request, response: Response): Response {
  const pending = getPendingSetCookies(req);
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

export function createClientFromRequest(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const jar = parseCookieHeader(req.headers.get("cookie"));
  const pending: PendingSetCookie[] = [];
  (req as unknown as Record<symbol, PendingSetCookie[]>)[PENDING] = pending;

  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          jar.set(name, value);
          pending.push({ name, value, options });
        }
      },
    },
  });
}
