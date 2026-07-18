import type { EditorMode } from "@/components/editor/editor-layout";

/** Pre-send credit estimate label for the composer (Lovable parity). */
export function estimateMessageCredits(
  mode: EditorMode,
  opts?: { inputLength?: number; hasAttachments?: boolean; fileCount?: number },
): string {
  const len = opts?.inputLength ?? 0;
  const files = opts?.fileCount ?? 0;

  if (mode === "chat" || mode === "plan") {
    return len > 800 ? "~1 credit" : "~0.5 credit";
  }
  if (mode === "patch") {
    return "~0.5–1 credit";
  }
  if (mode === "agent") {
    return files > 8 ? "~3–5 credits" : "~2–3 credits";
  }
  // build
  if (opts?.hasAttachments) return "~2–3 credits";
  if (len > 400 || files > 5) return "~2 credits";
  return "~1–2 credits";
}
