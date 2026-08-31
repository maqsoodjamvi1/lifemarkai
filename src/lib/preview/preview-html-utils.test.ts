import assert from "node:assert/strict";
import test from "node:test";
import { injectSimplifiedPreviewBanner, rewriteStaticPaths } from "./preview-html-utils.ts";

// Regression: the public /preview/{id} route used to hard-503 a Vite/Next
// project with no live sandbox tunnel instead of falling back to
// buildFallbackHtml — and that route has no React chrome to float a
// dismissable "simplified preview" card over the render the way the
// interactive editor's own preview pane does, so the disclosure has to be
// baked directly into the HTML response itself.
test("injectSimplifiedPreviewBanner inserts a disclosure right after <body>", () => {
  const html = "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>";
  const out = injectSimplifiedPreviewBanner(html);
  assert.match(out, /<body><div style="position:fixed/);
  assert.match(out, /Simplified preview/);
  // The app's own markup must still be present, unmodified, after the banner.
  assert.match(out, /<div id="root"><\/div>/);
});

test("injectSimplifiedPreviewBanner matches a <body> tag carrying its own attributes", () => {
  const html = '<html><body class="dark" data-theme="x"><p>hi</p></body></html>';
  const out = injectSimplifiedPreviewBanner(html);
  assert.match(out, /<body class="dark" data-theme="x"><div style="position:fixed/);
});

test("injectSimplifiedPreviewBanner prepends the banner when there is no <body> tag at all", () => {
  const html = "<div>fragment, no html/body wrapper</div>";
  const out = injectSimplifiedPreviewBanner(html);
  assert.ok(out.startsWith('<div style="position:fixed'));
  assert.match(out, /fragment, no html\/body wrapper/);
});

test("injectSimplifiedPreviewBanner's banner never intercepts clicks meant for the app", () => {
  const out = injectSimplifiedPreviewBanner("<body></body>");
  assert.match(out, /pointer-events:none/);
});

test("rewriteStaticPaths still resolves relative asset paths under /preview/{id}", () => {
  const html = '<link href="styles.css"><script src="/main.js"></script>';
  const out = rewriteStaticPaths(html, "proj-1");
  assert.match(out, /href="\/preview\/proj-1\/styles\.css"/);
  assert.match(out, /src="\/preview\/proj-1\/main\.js"/);
});
