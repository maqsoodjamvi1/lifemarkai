/** Format unresolved guest comments for an AI fix prompt. */
export function formatGuestCommentsForAi(
  rows: Array<{
    content: string;
    guest_name?: string | null;
    page_path?: string | null;
    element_preview?: string | null;
    element_tag?: string | null;
  }>,
): string {
  const lines = rows.map((c, i) => {
    const who = c.guest_name?.trim() || "Guest";
    const where = c.page_path ? ` on ${c.page_path}` : "";
    const el = c.element_preview || c.element_tag ? ` (${c.element_preview ?? c.element_tag})` : "";
    return `${i + 1}. **${who}**${where}${el}: ${c.content.trim()}`;
  });
  return [
    "Review and address these guest preview comments. Fix the underlying UI/UX issues without breaking unrelated features.",
    "",
    ...lines,
    "",
    "After fixing, summarize what changed.",
  ].join("\n");
}
