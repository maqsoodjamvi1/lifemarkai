/**
 * HTML/SVG sanitization — the safe boundary for any markup that originates from
 * the AI, a user, or an external API before it reaches `dangerouslySetInnerHTML`.
 *
 * Uses isomorphic-dompurify so the SAME code path works in Server Components /
 * route handlers (jsdom-backed) and in the browser (native window). DOMPurify
 * always strips `<script>` and `on*` event-handler attributes; the profiles
 * below additionally scope which element/attribute vocabulary survives.
 *
 * Closes the "adopt DOMPurify as a real sanitizer" gap from
 * docs/lovable-vs-lifemarkai-stack.md. Lovable ships DOMPurify (`purify.es`) in
 * its client bundle for exactly this purpose.
 */
import DOMPurify from "isomorphic-dompurify";

/** Sanitize a fragment of HTML (keeps common formatting, drops scripts/handlers). */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}

/**
 * Sanitize rendered SVG (e.g. a Mermaid diagram) without breaking it.
 *
 * Enables the HTML profile alongside SVG so Mermaid's `foreignObject` HTML
 * labels survive, while `<script>`/`on*`/`javascript:` vectors are still
 * removed. Safe to feed straight into `dangerouslySetInnerHTML`.
 */
export function sanitizeSvg(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ["foreignObject"],
  });
}
