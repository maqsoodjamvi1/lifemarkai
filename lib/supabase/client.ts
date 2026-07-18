import { createBrowserClient } from "@supabase/ssr";
import { processLock } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isTransientSupabaseError, sleep } from "@/lib/supabase/transient-error";

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
 */

declare global {
  var __lifemark_supabase_browser_client: ReturnType<typeof createBrowserClient<Database>> | undefined;
  var __lifemark_supabase_browser_client_rev: number | undefined;
  var __lifemark_supabase_auth_noise_guard: boolean | undefined;
  var __lifemark_orig_console_error: typeof console.error | undefined;
}

/** Bump when client construction options change so HMR drops the stale singleton. */
const CLIENT_REV = 3;

function isAuthNetworkNoise(reason: unknown): boolean {
  if (!reason) return false;
  const msg =
    reason instanceof Error
      ? `${reason.name} ${reason.message}`
      : typeof reason === "string"
        ? reason
        : String(reason);
  const name = reason instanceof Error ? reason.name : "";
  // GoTrue auto-refresh throws TypeError: Failed to fetch when Cloudflare/Supabase
  // times out — noisy in Next.js overlay but recoverable on the next tick.
  return (
    /failed to fetch/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /networkerror/i.test(msg) ||
    /timeout/i.test(msg) ||
    /connect timeout/i.test(msg) ||
    /aborted/i.test(msg) ||
    /load failed/i.test(msg) ||
    /network request failed/i.test(msg) ||
    name === "AbortError" ||
    name === "ConnectTimeoutError" ||
    (name === "TypeError" && /fetch|network|load/i.test(msg))
  );
}

/** True when a console.error arg is the transient auth/network TypeError overlay. */
function consoleArgsAreAuthNoise(args: unknown[]): boolean {
  return args.some((arg) => {
    if (isAuthNetworkNoise(arg)) return true;
    if (arg && typeof arg === "object") {
      const o = arg as { message?: unknown; name?: unknown; cause?: unknown };
      if (isAuthNetworkNoise(o)) return true;
      if (o.cause && isAuthNetworkNoise(o.cause)) return true;
      if (typeof o.message === "string" && isAuthNetworkNoise(o.message)) return true;
    }
    return typeof arg === "string" && isAuthNetworkNoise(arg);
  });
}

/**
 * Suppress Next.js "Console TypeError / Failed to fetch" overlay noise from
 * GoTrue auto-refresh and other transient Supabase network flakes.
 * Must run as early as possible in the browser.
 */
export function installAuthNoiseGuard(): void {
  if (typeof window === "undefined" || globalThis.__lifemark_supabase_auth_noise_guard) return;
  globalThis.__lifemark_supabase_auth_noise_guard = true;

  window.addEventListener("unhandledrejection", (event) => {
    if (!isAuthNetworkNoise(event.reason)) return;
    event.preventDefault();
    if (process.env.NODE_ENV === "development") {
      console.warn("[supabase] transient auth network error (ignored)");
    }
  });

  // Next.js overlays Console TypeError from console.error(TypeError), not only
  // unhandledrejection — filter those auth/network flakes too.
  if (!globalThis.__lifemark_orig_console_error) {
    globalThis.__lifemark_orig_console_error = console.error.bind(console);
    let reentering = false;
    console.error = (...args: unknown[]) => {
      if (reentering) return;
      if (consoleArgsAreAuthNoise(args)) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[supabase] transient fetch error (console suppressed)");
        }
        return;
      }
      reentering = true;
      try {
        globalThis.__lifemark_orig_console_error!(...args);
      } finally {
        reentering = false;
      }
    };
  }
}

async function withAuthRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientSupabaseError(err) || attempt >= retries) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

export function createClient(): ReturnType<typeof createBrowserClient<Database>> {
  if (typeof window === "undefined") {
    // "use client" components still render once on the server during SSR.
    // Return a throwaway, UNCACHED instance for SSR; the browser singleton
    // takes over on hydration.
    return createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }

  installAuthNoiseGuard();

  if (
    !globalThis.__lifemark_supabase_browser_client ||
    globalThis.__lifemark_supabase_browser_client_rev !== CLIENT_REV
  ) {
    // Use the native fetch — a custom AbortController timeout wrapper was
    // re-throwing TypeError: Failed to fetch with a stack pointing at our
    // client.ts and flooding the Next.js overlay on flaky Supabase/CF links.
    globalThis.__lifemark_supabase_browser_client_rev = CLIENT_REV;
    globalThis.__lifemark_supabase_browser_client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          lock: processLock,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      },
    );

    // ── Coalesce concurrent auth.getUser() calls ──────────────────────────
    const client = globalThis.__lifemark_supabase_browser_client!;
    const origGetUser = client.auth.getUser.bind(client.auth);
    const origGetSession = client.auth.getSession.bind(client.auth);
    const origRefreshSession = client.auth.refreshSession.bind(client.auth);
    type GetUserResult = Awaited<ReturnType<typeof origGetUser>>;
    type GetSessionResult = Awaited<ReturnType<typeof origGetSession>>;
    type RefreshResult = Awaited<ReturnType<typeof origRefreshSession>>;

    let inflightUser: Promise<GetUserResult> | null = null;
    let cachedUser: { res: GetUserResult; at: number } | null = null;
    let cachedSession: { res: GetSessionResult; at: number } | null = null;
    const CACHE_MS = 5000;

    client.auth.getUser = ((jwt?: string) => {
      if (jwt) return origGetUser(jwt);
      if (cachedUser && Date.now() - cachedUser.at < CACHE_MS) {
        return Promise.resolve(cachedUser.res);
      }
      if (!inflightUser) {
        inflightUser = withAuthRetry(() => origGetUser())
          .then((res) => {
            cachedUser = { res, at: Date.now() };
            inflightUser = null;
            return res;
          })
          .catch((err) => {
            inflightUser = null;
            // Soft-fail transient network errors so the Next overlay stays quiet.
            if (isAuthNetworkNoise(err)) {
              return {
                data: { user: cachedUser?.res.data.user ?? null },
                error: null,
              } as GetUserResult;
            }
            throw err;
          });
      }
      return inflightUser;
    }) as typeof client.auth.getUser;

    client.auth.getSession = (async () => {
      try {
        const res = await withAuthRetry(() => origGetSession());
        cachedSession = { res, at: Date.now() };
        return res;
      } catch (err) {
        if (isAuthNetworkNoise(err)) {
          if (cachedSession && Date.now() - cachedSession.at < 60_000) {
            return cachedSession.res;
          }
          return { data: { session: null }, error: null } as GetSessionResult;
        }
        throw err;
      }
    }) as typeof client.auth.getSession;

    client.auth.refreshSession = (async (currentSession?) => {
      try {
        const res = await withAuthRetry(() => origRefreshSession(currentSession));
        if (res.data.session) {
          cachedSession = {
            res: { data: { session: res.data.session }, error: null } as GetSessionResult,
            at: Date.now(),
          };
        }
        return res;
      } catch (err) {
        if (isAuthNetworkNoise(err)) {
          // Keep existing session if refresh fails transiently — don't sign the user out.
          try {
            const current = cachedSession?.res ?? (await origGetSession());
            return {
              data: {
                session: current.data.session,
                user: current.data.session?.user ?? null,
              },
              error: null,
            } as RefreshResult;
          } catch {
            return {
              data: { session: null, user: null },
              error: null,
            } as RefreshResult;
          }
        }
        throw err;
      }
    }) as typeof client.auth.refreshSession;

    // Sync callback only — never run auth methods inside onAuthStateChange.
    client.auth.onAuthStateChange(() => {
      cachedUser = null;
    });
  }
  return globalThis.__lifemark_supabase_browser_client!;
}
