/**
 * Pure logic for preview element-comment pins.
 *
 * Shared by preview-panel (which pushes pins into cross-origin engines via
 * postMessage) and PreviewCommentPins (the same-origin srcdoc overlay), and
 * unit-tested without the DOM.
 */

export interface CommentPinSource {
  id: string;
  element_xpath: string | null;
  content?: string | null;
  page_path?: string | null;
}

export interface CommentPin {
  id: string;
  xpath: string;
  label: string;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Truncated human label for a pin — first 80 chars of the comment, or a fallback. */
export function commentPinLabel(content: string | null | undefined, index: number): string {
  return content?.slice(0, 80) || `Comment ${index + 1}`;
}

/** Comments visible on the given preview page ("*" and unset match every page). */
export function filterPinsForPage<T extends CommentPinSource>(
  comments: T[],
  previewPath: string,
): T[] {
  return comments.filter((c) => {
    const page = c.page_path || "/";
    return page === previewPath || page === "*" || !c.page_path;
  });
}

/** Map raw comment rows to the pin shape both preview engines consume. */
export function toCommentPinList(comments: CommentPinSource[]): CommentPin[] {
  return comments.map((c, i) => ({
    id: c.id,
    xpath: c.element_xpath ?? "",
    label: commentPinLabel(c.content, i),
  }));
}

/** XPath expressions from the DB may omit the leading axis. */
export function normalizeXpath(xpath: string): string {
  return xpath.startsWith("//") ? xpath : `//${xpath}`;
}

/**
 * Viewport position for a pin marker: top-right corner of the target element,
 * offset so the 22px badge overlaps the corner.
 */
export function computeMarkerPosition(
  iframeRect: Pick<RectLike, "left" | "top">,
  nodeRect: RectLike,
): { left: number; top: number } {
  return {
    left: iframeRect.left + nodeRect.left + nodeRect.width - 10,
    top: iframeRect.top + nodeRect.top - 10,
  };
}
