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
 * Raw-text-ish elements whose contents we refuse to look inside.
 *
 * `<template>` is not raw text per the HTML parsing spec, but for this
 * function it may as well be: a template holding a boilerplate document is a
 * normal thing for a page to contain, and its DOCTYPE must never be read as
 * evidence of duplication.
 */
const OPAQUE_ELEMENTS = ["script", "style", "template", "textarea", "pre", "xmp"];

/**
 * Offsets of `<!DOCTYPE html` occurrences that sit at DOCUMENT level — not
 * inside a tag, not inside an attribute value, not inside an opaque element.
 *
 * This distinction is the whole point. A raw `<!DOCTYPE html` appears
 * legitimately inside a single document whenever the page carries markup as
 * data:
 *
 *     <iframe srcdoc="<!DOCTYPE html><html>…"></iframe>
 *     <template id="page"><!DOCTYPE html>…</template>
 *     <script>const shell = `<!DOCTYPE html><html>…`;</script>
 *
 * Every one of those is an ordinary page — a preview widget, an email-template
 * builder, a docs page showing boilerplate. Treating them as duplication
 * truncates the file to whatever followed the embedded copy and destroys the
 * user's actual document, and afterwards nothing about the file looks
 * corrupted, so there is nothing for anyone to report.
 *
 * A DOCTYPE that survives this scan is one no browser would treat as content:
 * it is sitting in the document flow, which only happens when two documents
 * were concatenated.
 */
function documentLevelDoctypes(content: string): number[] {
  const hits: number[] = [];
  let i = 0;
  const lower = content.toLowerCase();

  while (i < content.length) {
    const ch = content[i];
    if (ch !== "<") {
      i++;
      continue;
    }

    // Comment — skip wholesale. `<!-- <!DOCTYPE html> -->` is not a document.
    if (lower.startsWith("<!--", i)) {
      const end = lower.indexOf("-->", i + 4);
      i = end === -1 ? content.length : end + 3;
      continue;
    }

    if (lower.startsWith("<!doctype html", i)) {
      hits.push(i);
      i += "<!doctype html".length;
      continue;
    }

    // An opaque element: jump past its closing tag without looking inside.
    const opaque = OPAQUE_ELEMENTS.find(
      (tag) =>
        lower.startsWith(`<${tag}`, i) &&
        // `<pre>` and `<pre class=…>` yes; `<premium-thing>` no.
        /[\s/>]/.test(content[i + tag.length + 1] ?? ">"),
    );
    if (opaque) {
      const close = lower.indexOf(`</${opaque}`, i);
      i = close === -1 ? content.length : close + opaque.length + 2;
      continue;
    }

    // Any other tag: skip to its end, respecting quoted attribute values so a
    // `srcdoc="<!DOCTYPE html>…"` is never seen.
    let j = i + 1;
    let quote: string | null = null;
    while (j < content.length) {
      const c = content[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
      j++;
    }
    i = j + 1;
  }

  return hits;
}

/**
 * Where does a SECOND document actually begin?
 *
 * Both observed corruption shapes have to be caught, and they do not look
 * alike:
 *
 *   • the first document is COMPLETE — `…</html><!DOCTYPE html>…` — which is
 *     what a plain regeneration produces;
 *   • the first document is TRUNCATED — the model hit its output ceiling
 *     mid-sentence and the continuation round restarted from the top, so
 *     there is no `</html>` before the second DOCTYPE at all. This is the more
 *     common one, because being cut off is precisely why a continuation was
 *     requested.
 *
 * An earlier version of this required a closing `</html>` and so missed the
 * second shape entirely — the exact case the module was written for.
 *
 * Both are covered by a different question: is the DOCTYPE at document level?
 * (See `documentLevelDoctypes`.) A second document-level DOCTYPE cannot occur
 * in a single well-formed page. The one extra condition is that what follows
 * actually is a document — otherwise a stray DOCTYPE in a still-streaming file
 * would make us throw away the only content present.
 */
function secondDocumentStart(content: string): number {
  const hits = documentLevelDoctypes(content);
  if (hits.length <= 1) return -1;
  // Walk backwards: keep the LAST candidate that is followed by a closed
  // document, so a build that appended twice collapses to the newest copy.
  for (let k = hits.length - 1; k >= 1; k--) {
    const start = hits[k]!;
    if (/<\/html\s*>/i.test(content.slice(start))) return start;
  }
  return -1;
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
