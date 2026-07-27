/**
 * Build a short, secret-redacted preview of an in-app AI proxy request
 * for activity logs (Lovable parity). Never stores raw credentials.
 */
import { redactPromptSecrets } from "@/lib/ai/chat-capabilities";

const MAX_CHARS = 600;

function truncate(text: string, max = MAX_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function redact(text: string): string {
  try {
    return redactPromptSecrets(text).redactedText;
  } catch {
    return text;
  }
}

export function buildAiRequestPreview(input: {
  capability: string;
  prompt?: string;
  text?: string;
  input?: string | string[];
  messages?: Array<{ role?: string; content?: string }>;
  systemPrompt?: string;
}): string | null {
  const parts: string[] = [];
  const cap = String(input.capability || "chat");

  if (typeof input.prompt === "string" && input.prompt.trim()) {
    parts.push(`prompt: ${redact(input.prompt)}`);
  }
  if (typeof input.text === "string" && input.text.trim()) {
    parts.push(`text: ${redact(input.text)}`);
  }
  if (typeof input.systemPrompt === "string" && input.systemPrompt.trim()) {
    parts.push(`system: ${redact(input.systemPrompt)}`);
  }
  if (Array.isArray(input.messages) && input.messages.length > 0) {
    const lastUser = [...input.messages]
      .reverse()
      .find((m) => m?.role === "user" && typeof m.content === "string");
    const sample = lastUser?.content
      ?? input.messages.map((m) => `${m.role ?? "?"}: ${m.content ?? ""}`).join(" | ");
    if (sample.trim()) parts.push(`messages(${input.messages.length}): ${redact(sample)}`);
  }
  if (typeof input.input === "string" && input.input.trim()) {
    parts.push(`input: ${redact(input.input)}`);
  } else if (Array.isArray(input.input) && input.input.length > 0) {
    parts.push(`input[${input.input.length}]: ${redact(input.input.slice(0, 3).join(" | "))}`);
  }

  if (parts.length === 0) {
    return cap === "stt" ? "stt: <audio upload>" : null;
  }
  return truncate(`${cap} · ${parts.join(" · ")}`);
}
