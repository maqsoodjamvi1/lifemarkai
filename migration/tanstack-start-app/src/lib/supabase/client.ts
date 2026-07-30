import { createBrowserClient } from "@supabase/ssr";

// serve-tanstack.mjs injects the container's runtime env into every HTML
// response as globalThis.__LM_ENV__. Prefer it over the build-time value:
// the Docker build has shipped with empty build-args before (Jul 27 outage),
// and the injected value is always the deployment's real config.
function runtimeEnv(key: string): string | undefined {
  return (globalThis as { __LM_ENV__?: Record<string, string> }).__LM_ENV__?.[key];
}

// Minimal singleton browser client (TanStack Start / Vite env).
let _client: ReturnType<typeof createBrowserClient> | null = null;
export function createClient() {
  if (_client) return _client;
  _client = createBrowserClient(
    (runtimeEnv("VITE_SUPABASE_URL") ||
      runtimeEnv("NEXT_PUBLIC_SUPABASE_URL") ||
      import.meta.env.VITE_SUPABASE_URL) as string,
    (runtimeEnv("VITE_SUPABASE_ANON_KEY") ||
      runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
      import.meta.env.VITE_SUPABASE_ANON_KEY) as string,
  );
  return _client;
}
