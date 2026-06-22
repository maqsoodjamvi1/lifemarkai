import { createBrowserClient } from "@supabase/ssr";
import { processLock } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Singleton Supabase browser client.
 *
 * Why this matters: Supabase JS v2 coordinates auth-token refresh across
 * tabs / instances via the Web Locks API. The lock name is
 * `lock:sb-<project-ref>-auth-token`. When N components each call
 * createClient() they get N independent instances, each with its own
 * auto-refresh timer fighting over the same lock — surfaces as
 * "Lock was released because another request stole it" in the runtime
 * overlay.
 *
 * Caching the instance behind module scope means every consumer in the
 * tab shares one auth-refresh loop, one lock acquisition, and one
 * realtime connection pool. The API surface is unchanged — every
 * existing `const supabase = createClient()` call still works.
 *
 * Notes:
 *   • `globalThis` is used so HMR (which reloads this module) doesn't
 *     create a second client. The previous instance survives module
 *     reload and keeps its auth state.
 *   • SSR safety: createClient() should never be called from a server
 *     component. createBrowserClient() reads document.cookie under the
 *     hood. The factory throws helpfully if window is undefined.
 */

declare global {
   
  var __lifemark_supabase_browser_client: ReturnType<typeof createBrowserClient<Database>> | undefined;
}

export function createClient(): ReturnType<typeof createBrowserClient<Database>> {
  if (typeof window === "undefined") {
    // "use client" components still render once on the server during SSR, and
    // `const supabase = createClient()` at render scope is the standard pattern
    // throughout this codebase — throwing here crashes every such page's SSR
    // pass. createBrowserClient is safe to construct without `window` (cookie
    // access is lazy), so return a throwaway, UNCACHED instance: it has no
    // session and is discarded after the SSR pass; the browser singleton takes
    // over on hydration. Server components / route handlers should still use
    // @/lib/supabase/server for real data access.
    return createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  if (!globalThis.__lifemark_supabase_browser_client) {
    globalThis.__lifemark_supabase_browser_client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          // Use the in-process mutex instead of the Navigator Web Locks API.
          // The default navigatorLock "steals" the lock after a timeout, and
          // with many components calling auth.getUser() concurrently on mount
          // (the editor opens ~a dozen panels) plus the auto-refresh timer,
          // losers surface as runtime overlays: "Lock was released because
          // another request stole it" / "Lock broken by another request with
          // the 'steal' option". processLock serializes auth ops within the
          // tab and never steals. Trade-off: no cross-tab refresh
          // coordination — acceptable, since Supabase tolerates concurrent
          // refreshes within its token-reuse interval.
          lock: processLock,
        },
      },
    );

    // ── Coalesce concurrent auth.getUser() calls ──────────────────────────
    // getUser() performs a NETWORK request while holding the auth lock. The
    // editor mounts ~a dozen panels that each call getUser() (doubled by
    // React StrictMode in dev), so 30–60 calls queue on the lock and the
    // tail waiters exceed the acquire timeout ("Acquiring process lock …
    // timed out"). Dedupe: all concurrent callers share one in-flight
    // request, and the result is cached for a few seconds. The cache is
    // invalidated on any auth state change (sign-in/out, token refresh).
    const client = globalThis.__lifemark_supabase_browser_client!;
    const origGetUser = client.auth.getUser.bind(client.auth);
    type GetUserResult = Awaited<ReturnType<typeof origGetUser>>;
    let inflight: Promise<GetUserResult> | null = null;
    let cached: { res: GetUserResult; at: number } | null = null;
    const CACHE_MS = 5000;

    client.auth.getUser = ((jwt?: string) => {
      if (jwt) return origGetUser(jwt); // explicit-JWT calls bypass the cache
      if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.res);
      if (!inflight) {
        inflight = origGetUser()
          .then((res) => {
            cached = { res, at: Date.now() };
            inflight = null;
            return res;
          })
          .catch((err) => {
            inflight = null;
            throw err;
          });
      }
      return inflight;
    }) as typeof client.auth.getUser;

    // Sync callback only — never run auth methods inside onAuthStateChange.
    client.auth.onAuthStateChange(() => {
      cached = null;
    });
  }
  return globalThis.__lifemark_supabase_browser_client!;
}
