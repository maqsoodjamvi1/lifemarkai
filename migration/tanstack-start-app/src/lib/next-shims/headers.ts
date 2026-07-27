/**
 * next/headers shim — reads/writes the request ALS cookie jar.
 * Root `lib/supabase/server.ts` awaits cookies(); support both sync + Promise.
 */
import { getRequestAls } from "../request-als";

function cookieStore() {
  const als = getRequestAls();
  const jar = als?.cookies ?? new Map<string, string>();
  return {
    get(name: string) {
      const v = jar.get(name);
      return v === undefined ? undefined : { name, value: v };
    },
    getAll() {
      return [...jar.entries()].map(([name, value]) => ({ name, value }));
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      jar.set(name, value);
      als?.pendingSetCookies.push({ name, value, options });
    },
    delete(name: string, options?: Record<string, unknown>) {
      jar.delete(name);
      als?.pendingSetCookies.push({
        name,
        value: "",
        options: { path: "/", ...options, maxAge: 0 },
      });
    },
    has(name: string) {
      return jar.has(name);
    },
  };
}

/**
 * Next 14 sync / Next 15 async — both work when awaited.
 *
 * IMPORTANT: `then` must resolve with the *plain* store (no `then` of its
 * own). Resolving with the thenable itself makes `await cookies()` unwrap
 * recursively — an infinite microtask loop that OOMs the process.
 */
export function cookies(): ReturnType<typeof cookieStore> & PromiseLike<ReturnType<typeof cookieStore>> {
  const store = cookieStore(); // plain object — safe to resolve
  return Object.assign({ ...store }, {
    then(
      onfulfilled?: (v: ReturnType<typeof cookieStore>) => unknown,
      onrejected?: (e: unknown) => unknown,
    ) {
      return Promise.resolve(store).then(onfulfilled, onrejected);
    },
  }) as ReturnType<typeof cookieStore> &
    PromiseLike<ReturnType<typeof cookieStore>>;
}

export function headers(): Headers & PromiseLike<Headers> {
  const als = getRequestAls();
  const h = new Headers(als?.request.headers);
  const plain = new Headers(h); // no `then` — safe to resolve
  return Object.assign(h, {
    then(onfulfilled?: (v: Headers) => unknown, onrejected?: (e: unknown) => unknown) {
      return Promise.resolve(plain).then(onfulfilled, onrejected);
    },
  }) as Headers & PromiseLike<Headers>;
}
