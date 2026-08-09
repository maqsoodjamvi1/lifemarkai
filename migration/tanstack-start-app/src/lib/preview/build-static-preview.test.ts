import test from "node:test";
import assert from "node:assert/strict";
import { buildStaticPreview } from "./build-static-preview.ts";

test("buildStaticPreview inlines local CSS and JavaScript", () => {
  const html = buildStaticPreview([
    { path: "index.html", content: '<link rel="stylesheet" href="styles.css"><main>Hello</main><script src="app.js"></script>' },
    { path: "styles.css", content: "main { color: rebeccapurple; }" },
    { path: "app.js", content: "document.body.dataset.ready = 'yes';" },
  ]);

  assert.ok(html.includes("main { color: rebeccapurple; }"));
  assert.ok(html.includes("document.body.dataset.ready = 'yes';"));
  assert.doesNotMatch(html, /href=["']styles\.css/);
  assert.doesNotMatch(html, /src=["']app\.js/);
});

test("buildStaticPreview leaves remote assets untouched", () => {
  const html = buildStaticPreview([
    { path: "index.html", content: '<script src="https://cdn.example.com/library.js"></script>' },
  ]);
  assert.match(html, /https:\/\/cdn\.example\.com\/library\.js/);
});
