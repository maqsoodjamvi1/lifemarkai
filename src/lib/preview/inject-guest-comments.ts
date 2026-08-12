export interface GuestCommentsInjectOpts {
  projectId: string;
  /** Platform origin for the embed script (e.g. https://lifemarkai.com). */
  origin?: string;
}

const MARKER = "data-lifemark-guest-comments";

/** Inject the guest preview comments widget into an HTML entry file. */
export function injectGuestCommentsIntoHtml(
  html: string,
  opts: GuestCommentsInjectOpts,
): string {
  if (!opts.projectId || html.includes(MARKER)) return html;

  const origin =
    opts.origin?.replace(/\/$/, "") ||
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") : "") ||
    "";

  const src = origin ? `${origin}/embed/comments.js` : "/embed/comments.js";
  const script = `<!-- LifemarkAI Guest Comments -->
<script
  src="${src}"
  data-project="${opts.projectId}"
  data-position="bottom-right"
  data-theme="dark"
  defer
  ${MARKER}
></script>`;

  return html.includes("</body>")
    ? html.replace("</body>", `  ${script}\n</body>`)
    : `${html}\n${script}`;
}
