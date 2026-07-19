/** Calendar-day helpers for chat jump-to-day / date separators. */

export function lovableChatDayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toDateString();
}

export function formatLovableChatDayLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export interface LovableChatDayJumpItem {
  key: string;
  label: string;
  messageId: string;
  count: number;
}

/** First message id per calendar day (ascending), with per-day counts. */
export function buildLovableChatDayJumps(
  messages: Array<{ id: string; created_at: string }>,
): LovableChatDayJumpItem[] {
  const order: string[] = [];
  const firstId = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const m of messages) {
    const key = lovableChatDayKey(m.created_at);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!firstId.has(key)) {
      firstId.set(key, m.id);
      order.push(key);
    }
  }

  return order.map((key) => {
    const messageId = firstId.get(key)!;
    const sample = messages.find((m) => m.id === messageId);
    return {
      key,
      label: formatLovableChatDayLabel(sample?.created_at),
      messageId,
      count: counts.get(key) ?? 0,
    };
  });
}
