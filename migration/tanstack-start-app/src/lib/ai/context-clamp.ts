/**
 * Hard context guardrail (MuseCode-parity, improvement #7).
 *
 * The smart context-selector stays in charge of WHAT goes into the prompt;
 * this is the dumb outer clamp that guarantees a selector bug can never blow
 * up the request: at most `maxMessages` history turns, each truncated to
 * `maxChars` characters. Applied to conversation history only — never to the
 * system prompt or the current user message.
 */

export interface HistoryMessage {
  role: string;
  content: string;
}

export const HISTORY_MAX_MESSAGES = 8;
export const HISTORY_MAX_CHARS = 4_000;

export function clampHistory<T extends HistoryMessage>(
  history: T[],
  opts: { maxMessages?: number; maxChars?: number } = {},
): T[] {
  const maxMessages = opts.maxMessages ?? HISTORY_MAX_MESSAGES;
  const maxChars = opts.maxChars ?? HISTORY_MAX_CHARS;
  return history.slice(-maxMessages).map((m) => {
    if (typeof m.content !== "string" || m.content.length <= maxChars) return m;
    return { ...m, content: `${m.content.slice(0, maxChars)}\n…[truncated]` };
  });
}
