/**
 * HTML document sanity — repairs a real, observed data-corruption class:
 * partial-build recovery / continuation rounds can APPEND a regenerated
 * document to an existing one, leaving files like index.html containing the
 * full document twice (`…</html><!DOCTYPE html>…`). Browsers silently parse
 * the first copy, so the bug hides until someone opens the Code view — which
 * is exactly where customer trust dies.
 *
 * `dedupeHtmlDocument` keeps the LAST complete document (the newest content)
 * when multiple DOCTYPE declarations are present. Pure + port-testable.
 */

export function dedupeHtmlDocument(content: string): string {
  const needle = /<!DOCTYPE\s+html/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = needle.exec(content)) !== null) starts.push(m.index);
  if (starts.length <= 1) return content;
  // Keep the newest (last) document — continuations regenerate the whole file.
  return content.slice(starts[starts.length - 1]);
}

/** Apply to a generated file when (and only when) it is an HTML document. */
export function sanitizeGeneratedFile(path: string, content: string): string {
  if (!/\.html?$/i.test(path)) return content;
  return dedupeHtmlDocument(content);
}
