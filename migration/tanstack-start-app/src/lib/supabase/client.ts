import { createBrowserClient } from "@supabase/ssr";

// Minimal singleton browser client (TanStack Start / Vite env).
let _client: ReturnType<typeof createBrowserClient> | null = null;
export function createClient() {
  if (_client) return _client;
  _client = createBrowserClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  );
  return _client;
}
