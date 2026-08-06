import type { Message } from "@/types/database";

/** Group a flat message array into per-turn threads (each user message starts a new thread). */
export function groupIntoThreads(msgs: Message[]): Message[][] {
  const threads: Message[][] = [];
  let current: Message[] = [];
  for (const msg of msgs) {
    if (msg.role === "user" && current.length > 0) {
      threads.push(current);
      current = [msg];
    } else {
      current.push(msg);
    }
  }
  if (current.length > 0) threads.push(current);
  return threads;
}

export function stripInternalChatContext(content: string): string {
  let text = content ?? "";
  text = text
    .replace(/<project_context>[\s\S]*?<\/project_context>\s*/gi, "")
    .replace(/<attached_file\b[^>]*>[\s\S]*?<\/attached_file>\s*/gi, (block) => {
      const path = block.match(/\bpath=["']([^"']+)["']/i)?.[1];
      return path ? `[Attached file: ${path}]\n` : "";
    })
    .replace(/<scraped_page\b[^>]*>[\s\S]*?<\/scraped_page>\s*/gi, (block) => {
      const url = block.match(/\burl=["']([^"']+)["']/i)?.[1];
      return url ? `[Referenced page: ${url}]\n` : "";
    })
    .replace(/\n{2,}--- Referenced files from other projects ---[\s\S]*$/i, "");

  const directiveIdx = text.search(/\n?---\s*\nAutonomous build:/i);
  if (directiveIdx >= 0) text = text.slice(0, directiveIdx);

  return text
    .replace(/^\s*[-=]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tryExtractJsonMessage(content: string): string | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  if (!/^[{\[]/.test(trimmed)) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as { message?: unknown; summary?: unknown; files?: unknown };
      if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
      if (typeof obj.summary === "string" && obj.summary.trim()) return obj.summary.trim();
      if (Array.isArray(obj.files)) {
        return `Updated ${obj.files.length} file${obj.files.length === 1 ? "" : "s"}. Open preview to see the result.`;
      }
    }
    if (Array.isArray(parsed)) return `Updated ${parsed.length} item${parsed.length === 1 ? "" : "s"}.`;
  } catch {
    return null;
  }
  return null;
}

function firstSentences(content: string, maxSentences = 2, maxChars = 260): string {
  const prose = content.split("```")[0].trim();
  const sentences = prose
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, maxSentences)
    .join(" ");
  return (sentences || prose).replace(/[*_`]/g, "").slice(0, maxChars).trim();
}

/** User-facing message body — strips internal context blocks and build JSON payloads. */
/**
 * Takes only the three fields it reads, not a whole Message. Requiring the full
 * row made it unassignable to `printChatConversation`'s `getDisplayContent`,
 * which promises callers a narrower shape — a function demanding MORE than its
 * caller supplies is unsound, and TypeScript was right to say so.
 */
export function getDisplayMessageContent(
  msg: Pick<Message, "role" | "content" | "mode">,
): string {
  const stripped = stripInternalChatContext(msg.content ?? "");
  if (msg.role === "user") return stripped || "Continue";

  const jsonMessage = tryExtractJsonMessage(stripped);
  if (jsonMessage) return jsonMessage;

  if (msg.mode === "build" || msg.mode === "agent" || msg.mode === "patch") {
    return firstSentences(stripped, 2, 260) || "Done. Open preview to see the result.";
  }

  return stripped;
}
