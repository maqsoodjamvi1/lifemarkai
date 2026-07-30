/**
 * Map runtime editor modes onto values the `messages.mode` CHECK accepts.
 *
 * DB constraint (001_initial_schema): CHECK (mode IN ('chat','agent','plan','build'))
 * Runtime also uses "patch" for surgical edits. Inserting "patch" fails silently
 * (Supabase returns error, callers ignored it) — chat history never persisted.
 */
import { parseAIResponse } from "@/lib/ai/code-parser";

export type RuntimeEditorMode = "chat" | "agent" | "plan" | "build" | "patch" | string;

export type PersistedMessageMode = "chat" | "agent" | "plan" | "build";

export function toPersistedMessageMode(mode: RuntimeEditorMode | null | undefined): PersistedMessageMode {
  if (mode === "agent" || mode === "plan" || mode === "build" || mode === "chat") return mode;
  // patch (and any future edit mode) stores as build — same UX bucket in history
  if (mode === "patch") return "build";
  return "chat";
}

/** Never return empty — messages.content is NOT NULL. */
export function sanitizeMessageContent(role: string, content: unknown): string {
  const text = typeof content === "string" ? content.trim() : "";
  if (text) return text;
  return role === "user" ? "(empty message)" : "Changes applied.";
}

/** Short, display-friendly assistant body for DB persistence. */
export function buildPersistedAssistantContent(opts: {
  mode: RuntimeEditorMode;
  fullContent: string;
  changedPaths?: string[];
}): string {
  const paths = (opts.changedPaths ?? []).filter(Boolean);
  if (opts.mode === "patch" && paths.length > 0) {
    return `Updated ${paths.join(", ")}. Preview refreshed.`;
  }
  if (opts.mode === "build" || opts.mode === "patch") {
    const msg = parseAIResponse(opts.fullContent ?? "").message?.trim() ?? "";
    if (msg && msg !== "Changes applied." && !msg.startsWith("{")) return msg;
    if (paths.length > 0) {
      return `Updated ${paths.join(", ")}. Preview refreshed.`;
    }
    return msg || "Changes applied.";
  }
  return sanitizeMessageContent("assistant", opts.fullContent);
}
