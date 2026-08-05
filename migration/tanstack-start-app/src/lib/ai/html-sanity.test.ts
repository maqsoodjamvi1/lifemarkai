import test from "node:test";
import assert from "node:assert/strict";
import { dedupeHtmlDocument, sanitizeGeneratedFile } from "./html-sanity.ts";

const DOC_A = `<!DOCTYPE html>
<html>
  <head><title>First</title></head>
  <body><h1>First</h1></body>
</html>`;

const DOC_B = `<!DOCTYPE html>
<html>
  <head><title>Second</title></head>
  <body><h1>Second</h1></body>
</html>`;

test("keeps a single document untouched", () => {
  assert.equal(dedupeHtmlDocument(DOC_A), DOC_A);
});

test("keeps the newest document when two are concatenated", () => {
  const out = dedupeHtmlDocument(`${DOC_A}${DOC_B}`);
  assert.equal(out, DOC_B);
  assert.ok(!out.includes("First"));
});

test("tolerates whitespace and a comment between the two documents", () => {
  const out = dedupeHtmlDocument(`${DOC_A}\n\n<!-- regenerated -->\n${DOC_B}`);
  assert.equal(out, DOC_B);
});

test("keeps the LAST of three concatenated documents", () => {
  const DOC_C = DOC_B.replace(/Second/g, "Third");
  const out = dedupeHtmlDocument([DOC_A, DOC_B, DOC_C].join("\n"));
  assert.equal(out, DOC_C);
});

// ── The regression this rewrite exists for ───────────────────────────────────
// Each of these is ONE legitimate document that happens to carry markup as
// data. The old "more than one DOCTYPE => keep everything after the last one"
// rule truncated all of them, destroying the user's real page.

test("does not truncate a page whose iframe carries a srcdoc document", () => {
  const page = `<!DOCTYPE html>
<html>
  <body>
    <iframe srcdoc="<!DOCTYPE html><html><body>preview</body></html>"></iframe>
    <footer>real content that must survive</footer>
  </body>
</html>`;
  assert.equal(dedupeHtmlDocument(page), page);
});

test("does not truncate a page with a <template> holding a full document", () => {
  const page = `<!DOCTYPE html>
<html>
  <body>
    <template id="shell"><!DOCTYPE html><html><body>x</body></html></template>
    <main>real content</main>
  </body>
</html>`;
  assert.equal(dedupeHtmlDocument(page), page);
});

test("does not truncate a page with a boilerplate string in a script", () => {
  const page = `<!DOCTYPE html>
<html>
  <body>
    <script>
      const shell = \`<!DOCTYPE html><html><body></body></html>\`;
    </script>
    <div>real content</div>
  </body>
</html>`;
  assert.equal(dedupeHtmlDocument(page), page);
});

test("an embedded doc followed by a REAL concatenation still splits correctly", () => {
  const withTemplate = `<!DOCTYPE html>
<html>
  <body><template><!DOCTYPE html><html><body>t</body></html></template></body>
</html>`;
  const out = dedupeHtmlDocument(`${withTemplate}${DOC_B}`);
  assert.equal(out, DOC_B);
});

test("a stray DOCTYPE with no closing </html> before it is left alone", () => {
  // Truncated/streaming output — splitting here would throw away the only
  // content present.
  const partial = `<!DOCTYPE html>
<html><body>
  <pre><!DOCTYPE html></pre>
  <p>still writing`;
  assert.equal(dedupeHtmlDocument(partial), partial);
});

test("sanitizeGeneratedFile only touches html files", () => {
  const doubled = `${DOC_A}${DOC_B}`;
  assert.equal(sanitizeGeneratedFile("index.html", doubled), DOC_B);
  assert.equal(sanitizeGeneratedFile("page.htm", doubled), DOC_B);
  assert.equal(sanitizeGeneratedFile("README.md", doubled), doubled);
  assert.equal(sanitizeGeneratedFile("src/App.tsx", doubled), doubled);
});

test("empty and doctype-free content pass through", () => {
  assert.equal(dedupeHtmlDocument(""), "");
  assert.equal(dedupeHtmlDocument("<div>fragment</div>"), "<div>fragment</div>");
});
