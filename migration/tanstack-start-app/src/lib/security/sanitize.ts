
/**
 * HTML/SVG sanitization — the safe boundary for any markup that originates from
 * the AI, a user, or an external API before it reaches `dangerouslySetInnerHTML`.
 *
 * This module is client-only so DOMPurify can use the browser's native DOM.
 * Server-rendered docs build React nodes directly and do not inject HTML. That
 * keeps the server bundle free of a synthetic DOM while preserving a strict
 * sanitizer boundary for generated SVG.
 *
 * Closes the "adopt DOMPurify as a real sanitizer" gap from
 * docs/lovable-vs-lifemarkai-stack.md. Lovable ships DOMPurify (`purify.es`) in
 * its client bundle for exactly this purpose.
 */
import DOMPurify from "dompurify";

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
