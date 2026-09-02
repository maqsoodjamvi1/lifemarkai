import test from "node:test";
import assert from "node:assert/strict";
import {
assertNoScriptTerminator,
getPreviewBridgeScripts,
injectVebBridgeIntoHtml,
injectVebBridgeIntoNextLayout,
} from "./veb-bridge.ts";

/**
 * The bug this file exists to prevent, in one sentence: an explanatory comment
 * inside the injected script contained the text `</script>`, an HTML parser
 * ended the script element there, and the rest of the bridge spilled into the
 * page as markup — which Vite handed to PostCSS, producing `Unknown word if`
 * from a CSS parser, about JavaScript, in a comment.
 */

test("the real bridge does not close its own script element", () => {
  // Would throw from inside getPreviewBridgeScripts if it ever regressed.
  const script = getPreviewBridgeScripts();
  assert.ok(script.length > 100);
  assert.equal(/<\s*\/\s*script/i.test(script), false);
});

test("the guard catches a terminator wherever it hides", () => {
  const hidingPlaces = [
    'var x = 1; // see </script> for details',
    'var s = "</script>";',
    "/* the server sends <body>…<script>this</script></body> */",
    "var x = 1; </SCRIPT> var y = 2;",
    "var x = 1; < / script > var y = 2;",
    "var x = 1; </script var y = 2;", // no closing angle — parsers still end it
  ];
  for (const src of hidingPlaces) {
    assert.throws(
      () => assertNoScriptTerminator(src, "test bridge"),
      /would close the <script> element/,
      src,
    );
  }
});

test("the guard's error names the label and shows context", () => {
  try {
    assertNoScriptTerminator("aaaa</script>bbbb", "my bridge");
    assert.fail("should have thrown");
  } catch (err) {
    const msg = (err as Error).message;
    assert.match(msg, /my bridge/);
    assert.match(msg, /aaaa/);
    assert.match(msg, /bbbb/);
  }
});

test("clean scripts pass through untouched", () => {
  const clean = "(function(){ var a = '<div>'; })();";
  assert.equal(assertNoScriptTerminator(clean, "x"), clean);
});

// ── The two injection paths both have to stay well-formed ───────────────────

test("html injection produces exactly one script element", () => {
  const html = "<!doctype html><html><head></head><body><div id=root></div></body></html>";
  const out = injectVebBridgeIntoHtml(html);
  // One opening tag we added, one closing tag we added — no more, no less.
  assert.equal((out.match(/<script>/gi) ?? []).length, 1);
  assert.equal((out.match(/<\/script>/gi) ?? []).length, 1);
  // And the body still closes after it.
  assert.ok(out.indexOf("</script>") < out.indexOf("</body>"));
});

test("html injection is idempotent", () => {
  const html = "<!doctype html><html><body></body></html>";
  const once = injectVebBridgeIntoHtml(html);
  assert.equal(injectVebBridgeIntoHtml(once), once);
});

test("jsx injection escapes the script so JSX cannot be broken by it", () => {
  const src = [
    "export function RootDocument({ children }) {",
    "  return (",
    "    <html>",
    "      <head><HeadContent /></head>",
    "      <body>{children}<Scripts /></body>",
    "    </html>",
    "  );",
    "}",
  ].join("\n");
  const out = injectVebBridgeIntoNextLayout(src);
  assert.match(out, /dangerouslySetInnerHTML/);
  // The payload is JSON-encoded, so a stray `<` in the bridge can never be
  // read as the start of a JSX element.
  assert.ok(out.includes('__html: "'));
  // The document's own closing tags survive, in their original case.
  assert.ok(out.includes("</body>"));
  assert.ok(out.includes("</html>"));
  // Injected before the body closes, not after.
  assert.ok(out.indexOf("dangerouslySetInnerHTML") < out.indexOf("</body>"));
});

test("jsx injection is idempotent", () => {
  const src = "<html><body>{children}</body></html>";
  const once = injectVebBridgeIntoNextLayout(src);
  assert.equal(injectVebBridgeIntoNextLayout(once), once);
});

test("the bridge no longer touches the DOM at parse time", () => {
  const script = getPreviewBridgeScripts();
  // The style must be created inside the deferred helper, never at top level.
  assert.match(script, /function ensureVebStyle\(\)/);
  assert.match(script, /adoptedStyleSheets/);
  // A top-level appendChild into head is what broke SSR hydration. The only
  // remaining occurrence must be inside ensureVebStyle's fallback.
  const beforeHelper = script.slice(0, script.indexOf("function ensureVebStyle"));
  assert.equal(/document\.head\.appendChild/.test(beforeHelper), false);
});

test("html injection does not interpret $' in the bridge as a replace pattern", () => {
  const html = injectVebBridgeIntoHtml("<!doctype html><html><body></body></html>");
  assert.match(html, /__reactFiber\$/);
  const start = html.indexOf("<script>") + "<script>".length;
  const end = html.lastIndexOf("</script>");
  const body = html.slice(start, end);
  assert.equal(body.includes("</html>"), false);
  assert.equal(body.includes("</body>"), false);
  assert.match(body, /hops < 50/);
});

test("html injection rewrites an older bridge in place", () => {
  const stale =
    "<!doctype html><html><body><script>/* lifemark-veb-ready STALE */</script></body></html>";
  const out = injectVebBridgeIntoHtml(stale);
  assert.equal(out.includes("STALE"), false);
  assert.match(out, /__reactFiber\$/);
  assert.equal((out.match(/<script>/gi) ?? []).length, 1);
});
