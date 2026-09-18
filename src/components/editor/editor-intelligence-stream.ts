/**
 * Incrementally split an SSE response into complete data payloads.
 *
 * Servers normally terminate events with a blank line, but proxies may close a
 * response immediately after the final data line. `flush` makes that last event
 * observable instead of leaving the editor in a permanently-running state.
 */
export function drainSseData(
  buffer: string,
  flush = false,
): { data: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const remainder = flush ? "" : (frames.pop() ?? "");

  const data = frames.flatMap((frame) => {
    const lines = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    return lines.length > 0 ? [lines.join("\n")] : [];
  });

  return { data, remainder };
}

export function safeBrowserStorage(
  operation: (storage: Storage) => void,
): void {
  try {
    operation(window.localStorage);
  } catch {
    // Storage may be blocked by privacy settings or an embedded browser. The
    // active stream remains authoritative, so persistence is best-effort.
  }
}
