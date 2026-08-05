/**
 * HTML document sanity — repairs a real, observed data-corruption class:
 * partial-build recovery / continuation rounds can APPEND a regenerated
 * document to an existing one, leaving files like index.html containing the
 * full document twice (`…</html><!DOCTYPE html>…`). Browsers silently parse
 * the first copy, so the bug hides until someone opens the Code view — which
 * is exactly where customer trust dies.
 *
 * `dedupeHtmlDocument` keeps the LAST complete document (the newest content)
 * when a file is genuinely two documents glued together. Pure + port-testable.
 */

/**
 * Where does a SECOND document actually begin?
 *
 * The naive rule — "more than one `<!DOCTYPE html` means duplication, keep
 * everything from the last one" — deletes real work. A raw `<!DOCTYPE html`
 * appears legitimately inside a single document whenever the page carries
 * markup as data:
 *
 *     <iframe srcdoc="<!DOCTYPE html><html>…"></iframe>
 *     <template id="page"><!DOCTYPE html>…</template>
 *     <script>const shell = `<!DOCTYPE html><html>…`;</script>
 *
 * Every one of those is a normal page — a preview widget, an email-template
 * builder, a docs page showing a boilerplate. Under the old rule the file was
 * silently truncated to whatever followed the embedded copy, destroying the
 * user's actual document. That is a worse failure than the one being repaired,
 * because nothing about it looks like corruption afterwards.
 *
 * The observed corruption has a signature the embedded cases do not: the
 * previous document is CLOSED first. Concatenation always produces
 * `</html>` (optionally followed by whitespace or a trailing comment) and then
 * a new DOCTYPE. An embedded template is never preceded by the end of the
 * enclosing document — by definition it is still inside it.
 *
 * So: split only at a DOCTYPE whose preceding text ends with `</html>`.
 */
function secondDocumentStart(content: string): number {
  const doctype = /<!DOCTYPE\s+html/gi;
  let m: RegExpExecArray | null;
  let lastSplit = -1;
  while ((m = doctype.exec(content)) !== null) {
    if (m.index === 0) continue; // the document's own opening
    const before = content.slice(0, m.index);
    // Tolerate whitespace and trailing comments between the two documents —
    // a continuation round sometimes emits "</html>\n<!-- rebuilt -->\n".
    if (/<\/html\s*>\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(before)) {
      lastSplit = m.index;
    }
  }
  return lastSplit;
}

export function dedupeHtmlDocument(content: string): string {
  const start = secondDocumentStart(content);
  if (start < 0) return content;
  // Keep the newest (last) document — continuations regenerate the whole file.
  return content.slice(start);
}

/** Apply to a generated file when (and only when) it is an HTML document. */
export function sanitizeGeneratedFile(path: string, content: string): string {
  if (!/\.html?$/i.test(path)) return content;
  return dedupeHtmlDocument(content);
}
