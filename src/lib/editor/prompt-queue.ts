/**
 * Prompt queue - stack messages while an agent run is in flight (Lovable parity).
 */

export interface QueuedPrompt {
  id: string;
  text: string;
  enqueuedAt: string;
  priority: number;
}

export function createPromptQueue(): QueuedPrompt[] {
  return [];
}

export function enqueuePrompt(
  queue: QueuedPrompt[],
  text: string,
  priority = 0,
): QueuedPrompt[] {
  const item: QueuedPrompt = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    enqueuedAt: new Date().toISOString(),
    priority,
  };
  if (!item.text) return queue;
  return [...queue, item].sort(
    (a, b) => b.priority - a.priority || a.enqueuedAt.localeCompare(b.enqueuedAt),
  );
}

export function dequeuePrompt(queue: QueuedPrompt[]): {
  next: QueuedPrompt | null;
  rest: QueuedPrompt[];
} {
  if (queue.length === 0) return { next: null, rest: [] };
  const [next, ...rest] = queue;
  return { next, rest };
}

export function removePrompt(queue: QueuedPrompt[], id: string): QueuedPrompt[] {
  return queue.filter((q) => q.id !== id);
}

export function reorderPrompt(
  queue: QueuedPrompt[],
  id: string,
  direction: "up" | "down",
): QueuedPrompt[] {
  const i = queue.findIndex((q) => q.id === id);
  if (i < 0) return queue;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= queue.length) return queue;
  const copy = [...queue];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
