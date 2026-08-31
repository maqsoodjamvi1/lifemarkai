/**
 * Trigger a browser file download for in-memory content (chat exports,
 * message exports, etc). Previously this exact 6-line dance —
 * `new Blob` → `URL.createObjectURL` → a throwaway `<a download>` →
 * `.click()` → `URL.revokeObjectURL` — was copy-pasted three times across
 * chat-panel.tsx (exportMessage, exportChatAsMarkdown, exportChatAsJson).
 * One helper means one place to fix if download behavior ever needs to
 * change (e.g. Safari's revoke-before-click quirks).
 */
export function downloadBlob(content: BlobPart, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
