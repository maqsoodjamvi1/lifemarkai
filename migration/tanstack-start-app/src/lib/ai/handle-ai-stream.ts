/**
 * Native fetch() + ReadableStreamDefaultReader streaming consumer.
 * No Vercel AI SDK — works with SSE (`data: …`) or raw text streams.
 */

import { XmlStreamParser, type ParsedFileUpdate } from "./xml-stream-parser";

export type StreamFormat = "auto" | "sse" | "text";

export interface AIStreamHandlers {
  /** Raw model text after SSE unwrap (if applicable) */
  onTextChunk?: (text: string) => void;
  /** Parsed XML file updates */
  onFileUpdate?: (update: ParsedFileUpdate) => void | Promise<void>;
  onParseError?: (message: string, context: string) => void;
  /** SSE JSON events (non-chunk), e.g. { status, done, error } */
  onEvent?: (event: Record<string, unknown>) => void;
  onDone?: (summary: AIStreamDoneSummary) => void;
  onError?: (error: Error) => void;
}

export interface AIStreamDoneSummary {
  fullText: string;
  updateCount: number;
  aborted: boolean;
}

export interface HandleAIStreamOptions {
  signal?: AbortSignal;
  format?: StreamFormat;
  handlers: AIStreamHandlers;
  /** Idle timeout — abort if no bytes for this long (default 120s) */
  idleTimeoutMs?: number;
}

export interface HandleAIStreamResult {
  fullText: string;
  updateCount: number;
  aborted: boolean;
}

/**
 * Consume a streaming Response body from fetch().
 *
 * @example
 * const res = await fetch("/api/ai/chat", { method: "POST", body, signal });
 * await handleAIStream(res, {
 *   signal,
 *   handlers: {
 *     onFileUpdate: (u) => fileSync.apply(u),
 *     onEvent: (e) => { if (e.done) … },
 *   },
 * });
 */
export async function handleAIStream(
  response: Response,
  options: HandleAIStreamOptions,
): Promise<HandleAIStreamResult> {
  const { handlers, signal, format = "auto", idleTimeoutMs = 120_000 } = options;

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json() as { error?: string };
      if (errBody.error) detail = errBody.error;
    } catch {
      try {
        detail = await response.text();
      } catch { /* ignore */ }
    }
    const err = new Error(detail);
    handlers.onError?.(err);
    throw err;
  }

  if (!response.body) {
    const err = new Error("Response has no body stream");
    handlers.onError?.(err);
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let updateCount = 0;
  let sseBuffer = "";
  let aborted = false;

  const xmlParser = new XmlStreamParser({
    onUpdate: (update) => {
      updateCount++;
      return handlers.onFileUpdate?.(update);
    },
    onParseError: (msg, ctx) => handlers.onParseError?.(msg, ctx),
  });

  const abortOnSignal = () => {
    aborted = true;
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abortOnSignal, { once: true });

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const bumpIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      aborted = true;
      void reader.cancel().catch(() => {});
      handlers.onError?.(new Error(`Stream idle timeout (${idleTimeoutMs}ms)`));
    }, idleTimeoutMs);
  };

  bumpIdle();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bumpIdle();

      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;

      const textPieces = unwrapStreamChunk(chunk, format, sseBuffer, (evt, newBuf) => {
        sseBuffer = newBuf;
        if (evt) dispatchSseEvent(evt, handlers);
      });

      for (const piece of textPieces) {
        fullText += piece;
        handlers.onTextChunk?.(piece);
        xmlParser.feed(piece);
      }
    }

    xmlParser.flush();

    const summary: AIStreamDoneSummary = { fullText, updateCount, aborted };
    handlers.onDone?.(summary);
    return { fullText, updateCount, aborted };
  } catch (e) {
    if (aborted && signal?.aborted) {
      const summary: AIStreamDoneSummary = { fullText, updateCount, aborted: true };
      handlers.onDone?.(summary);
      return { fullText, updateCount, aborted: true };
    }
    const err = e instanceof Error ? e : new Error(String(e));
    handlers.onError?.(err);
    throw err;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", abortOnSignal);
  }
}

function detectFormat(chunk: string, declared: StreamFormat): "sse" | "text" {
  if (declared === "sse" || declared === "text") return declared;
  return chunk.includes("data:") ? "sse" : "text";
}

function unwrapStreamChunk(
  chunk: string,
  format: StreamFormat,
  sseBuffer: string,
  onSseLine: (event: Record<string, unknown> | null, newBuffer: string) => void,
): string[] {
  const mode = detectFormat(chunk, format);
  if (mode === "text") {
    return [chunk];
  }

  const combined = sseBuffer + chunk;
  const lines = combined.split("\n");
  const incomplete = lines.pop() ?? "";
  const textPieces: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[DONE]") continue;
    if (!trimmed.startsWith("data:")) continue;

    const payload = trimmed.slice(5).trim();
    if (!payload) continue;

    try {
      const evt = JSON.parse(payload) as Record<string, unknown>;
      onSseLine(evt, incomplete);

      if (typeof evt.chunk === "string") {
        textPieces.push(evt.chunk);
      } else if (typeof evt.text === "string") {
        textPieces.push(evt.text);
      } else if (typeof evt.delta === "string") {
        textPieces.push(evt.delta);
      }
    } catch {
      // Non-JSON SSE line — treat as raw text
      textPieces.push(payload);
      onSseLine(null, incomplete);
    }
  }

  onSseLine(null, incomplete);
  return textPieces;
}

function dispatchSseEvent(
  evt: Record<string, unknown>,
  handlers: AIStreamHandlers,
): void {
  if (evt.error) {
    handlers.onError?.(new Error(String(evt.error)));
    return;
  }
  handlers.onEvent?.(evt);
}
