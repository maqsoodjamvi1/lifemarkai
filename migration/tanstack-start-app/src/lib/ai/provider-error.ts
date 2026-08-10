/**
 * Friendly AI-provider error messages (MuseCode-parity, improvement #6).
 *
 * Maps raw provider failures to one sentence the user can act on, instead of
 * surfacing `AI provider error 402: {...}` blobs. Used by generateAI so every
 * AI route inherits the mapping.
 */

export function statusOfProviderError(err: unknown): number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const e = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const value = e.status ?? e.statusCode ?? e.response?.status;
  return typeof value === "number" ? value : undefined;
}

export function describeProviderError(err: unknown): string {
  const status = statusOfProviderError(err);
  const raw = err instanceof Error ? err.message : String(err);

  if (status === 401 || /invalid[_ ]api[_ ]key|unauthorized/i.test(raw)) {
    return "The AI provider rejected the API key (401). Check the key in your environment settings.";
  }
  if (status === 402 || /insufficient credits|insufficient_quota/i.test(raw)) {
    return "AI credits exhausted (402) — add credits to your provider account to continue.";
  }
  if (status === 429 || /rate limit/i.test(raw)) {
    return "The AI provider rate limit was hit (429) — wait a moment and try again.";
  }
  if (status === 503 || status === 502 || /overloaded/i.test(raw)) {
    return "The AI provider is temporarily overloaded — try again shortly.";
  }
  return raw.slice(0, 400);
}

/**
 * Wrap a provider error with the friendly message while preserving the
 * original as `cause` (so logs keep the full detail).
 */
export function toFriendlyProviderError(err: unknown): Error {
  const friendly = describeProviderError(err);
  const raw = err instanceof Error ? err.message : String(err);
  if (friendly === raw.slice(0, 400)) return err instanceof Error ? err : new Error(raw);
  const wrapped = new Error(friendly, { cause: err });
  const status = statusOfProviderError(err);
  if (status !== undefined) (wrapped as Error & { status?: number }).status = status;
  return wrapped;
}
