function collectErrorText(err: unknown, depth = 0): string {
  if (!err || depth > 4) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const code = (err as { code?: string }).code ?? "";
    const cause = collectErrorText((err as { cause?: unknown }).cause, depth + 1);
    return [err.name, err.message, code, cause].filter(Boolean).join(" ");
  }
  const e = err as { code?: string; message?: string; details?: string; hint?: string; cause?: unknown };
  const nested = collectErrorText(e.cause, depth + 1);
  return [e.message, e.details, e.hint, e.code, nested].filter(Boolean).join(" ");
}

/** True when a Supabase/network call failed transiently and is worth retrying. */
export function isTransientSupabaseError(err: unknown): boolean {
  const { message, code } = describeSupabaseError(err);
  const msg = `${message} ${collectErrorText(err)}`.toLowerCase();
  const name = err instanceof Error ? err.name : "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("connect timeout") ||
    msg.includes("connecttimeouterror") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("socket") ||
    msg.includes("aborted") ||
    msg.includes("und_err_connect_timeout") ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    name === "AbortError" ||
    name === "ConnectTimeoutError" ||
    (name === "TypeError" && /fetch/i.test(msg))
  );
}

/** Normalize PostgrestError / AuthError for logs and UI (avoids console showing `{}`). */
export function describeSupabaseError(err: unknown): {
  code?: string;
  message: string;
  details?: string;
} {
  if (!err) return { message: "unknown error" };
  if (err instanceof Error) {
    const code =
      (err as { code?: string }).code ||
      ((err as { cause?: { code?: string } }).cause?.code);
    const causeMsg =
      err.cause instanceof Error
        ? err.cause.message
        : typeof (err as { cause?: unknown }).cause === "string"
          ? String((err as { cause?: unknown }).cause)
          : "";
    const message = [err.message, causeMsg].filter(Boolean).join(": ") || "unknown error";
    return { code, message };
  }
  const e = err as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  const message =
    e.message?.trim() ||
    e.details?.trim() ||
    e.hint?.trim() ||
    (typeof err === "string" ? err : "");
  if (message) {
    return { code: e.code, message, details: e.details };
  }
  try {
    const json = JSON.stringify(err);
    if (json && json !== "{}") return { code: e.code, message: json };
  } catch {
    /* ignore */
  }
  return { code: e.code, message: "database request failed" };
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry a Supabase query when the network path flakes (Cloudflare connect timeouts).
 * Retries only when `error` is transient or the call throws a transient TypeError.
 */
export async function withSupabaseRetry<T>(
  fn: () => PromiseLike<{ data: T; error: unknown | null }> | Promise<{ data: T; error: unknown | null }>,
  opts?: { attempts?: number; baseDelayMs?: number },
): Promise<{ data: T; error: unknown | null }> {
  const attempts = opts?.attempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 800;
  let last: { data: T; error: unknown | null } = { data: null as T, error: null };

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      last = await fn();
      if (!last.error) return last;
      if (!isTransientSupabaseError(last.error) || attempt >= attempts - 1) return last;
    } catch (err) {
      last = { data: null as T, error: err };
      if (!isTransientSupabaseError(err) || attempt >= attempts - 1) return last;
    }
    await sleep(baseDelayMs * (attempt + 1));
  }
  return last;
}
