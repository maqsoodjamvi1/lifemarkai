/**
 * Supabase server client — TanStack Start port of @/lib/supabase/server.
 *
 * Cookies come from TanStack Start request helpers (`getRequest` / `getCookies`
 * / `setCookie`) instead of next/headers.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getRequest, getCookies, setCookie } from "@tanstack/react-start/server";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Cookie-bound client for user-scoped reads/writes (RLS applies). */
export async function createClient() {
  // Ensure we're in a request scope (server fn / loader / API route).
  getRequest();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        const c = getCookies();
        return Object.entries(c).map(([name, value]) => ({ name, value: String(value) }));
      },
      setAll(cookies: Array<{ name: string; value: string; options?: unknown }>) {
        for (const { name, value, options } of cookies) {
          setCookie(name, value, options as Record<string, unknown>);
        }
      },
    },
  });
}

/** Service-role client for admin/webhook paths (bypasses RLS). No cookies. */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createSbClient(URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
