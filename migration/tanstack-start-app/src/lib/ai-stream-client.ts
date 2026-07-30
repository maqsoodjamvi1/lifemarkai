/**
 * Client helper for AI SSE — always hits same-origin `/api/ai/*`.
 * Start proxies these to Next (explicit routes + catch-all) so the host
 * never bundles generated-app code; streams stay HTTP (not createServerFn).
 */
export async function streamAiChat(
  body: unknown,
  init?: { signal?: AbortSignal },
): Promise<Response> {
  return fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
}

export async function streamAiAgent(
  body: unknown,
  init?: { signal?: AbortSignal },
): Promise<Response> {
  return fetch("/api/ai/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
}
