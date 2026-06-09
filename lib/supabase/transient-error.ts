/** True when a Supabase/network call failed transiently and is worth retrying. */
export function isTransientSupabaseError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  const code = (err as { code?: string })?.code ?? "";
  return (
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("connect timeout") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
