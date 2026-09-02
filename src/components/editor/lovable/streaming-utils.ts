/** Model thinking blocks stripped from visible stream prose. */
export function extractStreamingReasoning(content: string): string | null {
  if (typeof content !== "string" || !content) return null;
  const patterns = [
    /<thinking>([\s\S]*?)<\/thinking>/i,
    /([\s\S]*?)<\/think>/i,
    /<!--\s*reasoning\s*-->([\s\S]*?)<!--\s*\/reasoning\s*-->/i,
  ];
  for (const re of patterns) {
    const m = content.match(re);
    const body = m?.[1]?.trim();
    if (body && body.length >= 4) return body.slice(0, 4000);
  }
  return null;
}

/** Prose intro shown above Working/Edited cards during build streams. */
export function extractStreamingProse(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (/^\s*[\[{]/.test(trimmed) && /"path"\s*:/.test(trimmed)) return null;
  const beforeFence = trimmed.split(/```/)[0].trim();
  if (beforeFence.length < 8) return null;
  return beforeFence.slice(0, 800);
}
