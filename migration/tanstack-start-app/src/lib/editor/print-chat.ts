import type { Message } from "@/types/database";

/** Open a print-friendly window for the current chat conversation. */
export function printChatConversation(opts: {
  projectName: string;
  messages: Array<Pick<Message, "role" | "content" | "created_at" | "mode">>;
  getDisplayContent: (msg: Pick<Message, "role" | "content" | "mode">) => string;
}): void {
  if (typeof window === "undefined") return;
  const { projectName, messages, getDisplayContent } = opts;
  if (messages.length === 0) return;

  const rows = messages
    .map((m) => {
      const role = m.role === "user" ? "You" : "LifemarkAI";
      const body = escapeHtml(getDisplayContent(m)).replace(/\n/g, "<br/>");
      const when = m.created_at ? new Date(m.created_at).toLocaleString() : "";
      return `<article class="msg ${m.role}">
        <header><strong>${role}</strong><span>${when}</span></header>
        <div class="body">${body}</div>
      </article>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(projectName)} — Chat</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; max-width: 720px; margin: 32px auto; padding: 0 20px; line-height: 1.5; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
    .msg { border-top: 1px solid #e5e5e5; padding: 14px 0; break-inside: avoid; }
    .msg header { display: flex; justify-content: space-between; font-size: 12px; color: #555; margin-bottom: 6px; }
    .msg.user .body { background: #f4f4f5; border-radius: 10px; padding: 10px 12px; }
    .body { font-size: 13px; white-space: normal; word-break: break-word; }
    @media print { body { margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(projectName)}</h1>
  <div class="meta">${messages.length} messages · printed ${new Date().toLocaleString()}</div>
  ${rows}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=860,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
