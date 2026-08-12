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

test("buildStaticPreview resolves nested, root-relative and cache-busted references", () => {
  const html = buildStaticPreview([
    {
      path: "pages/index.html",
      content: '<link href="../assets/site.css?v=3" rel="stylesheet"><script defer src="/scripts/app.js#boot"></script>',
    },
    { path: "assets/site.css", content: "body { color: navy; }" },
    { path: "scripts/app.js", content: "document.body.dataset.booted = 'yes';" },
  ]);

  assert.match(html, /body \{ color: navy; \}/);
  assert.match(html, /dataset\.booted/);
  assert.doesNotMatch(html, /site\.css\?v=3/);
  assert.doesNotMatch(html, /app\.js#boot/);
});

test("buildStaticPreview keeps remote tags and prevents inline script termination", () => {
  const html = buildStaticPreview([
    { path: "index.html", content: '<script src="app.js"></script><script src="//cdn.example.com/lib.js"></script>' },
    { path: "app.js", content: 'const closingTag = "</script>"; window.value = closingTag;' },
  ]);

  assert.match(html, /\\u003c\\\\\/script>/);
  assert.doesNotMatch(html, /const closingTag = ["']<\/script>/);
  assert.match(html, /\/\/cdn\.example\.com\/lib\.js/);
  assert.equal((html.match(/data-lifemark-file=/g) ?? []).length, 1);
});

test("buildStaticPreview installs the static error bridge before project scripts", () => {
  const html = buildStaticPreview([
    { path: "index.html", content: '<html><head><script src="app.js"></script></head><body></body></html>' },
    { path: "app.js", content: 'throw new Error("broken");' },
  ]);

  const bridgeAt = html.indexOf("data-lifemark-static-bridge");
  const appAt = html.indexOf('data-lifemark-file="app.js"');
  assert.ok(bridgeAt >= 0);
  assert.ok(appAt > bridgeAt);
  assert.match(html, /preview-error-ready/);
  assert.match(html, /unhandledrejection/);
  assert.match(html, /console-error/);
});

test("buildStaticPreview creates a document shell when the entry is an HTML fragment", () => {
  const html = buildStaticPreview([{ path: "index.html", content: "<main>Fragment</main>" }]);

  assert.match(html, /^<!doctype html><html><head>/i);
  assert.match(html, /data-lifemark-static-bridge/);
  assert.match(html, /<body><main>Fragment<\/main><\/body>/);
});

test("buildStaticPreview embeds local HTML and CSS assets as data URLs", () => {
  const html = buildStaticPreview([
    {
      path: "pages/index.html",
      content: '<link rel="stylesheet" href="../styles/site.css"><img src="../assets/logo.svg"><video poster="/assets/poster.png"></video>',
    },
    { path: "styles/site.css", content: 'body { background: url("../assets/poster.png?v=1"); }' },
    { path: "assets/logo.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>' },
    { path: "assets/poster.png", content: "aGVsbG8=" },
  ]);

  assert.match(html, /src="data:image\/svg\+xml;charset=utf-8,/);
  assert.match(html, /poster="data:image\/png;base64,aGVsbG8="/);
  assert.match(html, /url\(data:image\/png;base64,aGVsbG8=\)/);
  assert.doesNotMatch(html, /\.\.\/assets\/logo\.svg/);
  assert.doesNotMatch(html, /poster\.png\?v=1/);
});

test("buildStaticPreview leaves missing and remote asset references unchanged", () => {
  const html = buildStaticPreview([{
    path: "index.html",
    content: '<img src="missing.png"><img src="https://cdn.example.com/photo.png">',
  }]);

  assert.match(html, /src="missing\.png"/);
  assert.match(html, /src="https:\/\/cdn\.example\.com\/photo\.png"/);
});

test("buildStaticPreview renders and navigates multiple static HTML pages", () => {
  const files = [
    { path: "index.html", content: '<a href="pages/about.html">About</a><h1>Home</h1>' },
    { path: "pages/about.html", content: '<a href="../index.html">Home</a><h1>About</h1>' },
  ];
  const home = buildStaticPreview(files);
  const about = buildStaticPreview(files, "/pages/about.html");

  assert.match(home, /data-lifemark-route="\/pages\/about\.html"/);
  assert.match(home, /pathname: "\/"/);
  assert.match(about, /<h1>About<\/h1>/);
  assert.match(about, /data-lifemark-route="\/"/);
  assert.doesNotMatch(about, /<h1>Home<\/h1>/);
});

test("buildStaticPreview embeds srcset, inline style, and icon assets", () => {
  const html = buildStaticPreview([
    {
      path: "index.html",
      content: '<link rel="icon" href="icon.png"><img srcset="small.png 1x, large.png 2x" style="background:url(large.png)">',
    },
    { path: "icon.png", content: "aWNvbg==" },
    { path: "small.png", content: "c21hbGw=" },
    { path: "large.png", content: "bGFyZ2U=" },
  ]);

  assert.match(html, /rel="icon" href="data:image\/png;base64,aWNvbg=="/);
  assert.match(html, /srcset="data:image\/png;base64,c21hbGw= 1x, data:image\/png;base64,bGFyZ2U= 2x"/);
  assert.match(html, /style="background:url\(data:image\/png;base64,bGFyZ2U=\)"/);
});

test("buildStaticPreview runs nested local ES modules through an import map", () => {
  const html = buildStaticPreview([
    { path: "index.html", content: '<script type="module" src="app.js"></script>' },
    { path: "app.js", content: 'import { customers } from "./modules/customers.js"; console.log(customers);' },
    { path: "modules/customers.js", content: 'import { seed } from "../data/seed.js"; export const customers = seed;' },
    { path: "data/seed.js", content: 'export const seed = [{ id: 1, name: "Acme" }];' },
  ]);

  assert.match(html, /data-lifemark-module-registry/);
  assert.match(html, /app:\/modules\/customers\.js/);
  assert.match(html, /app:\/data\/seed\.js/);
  assert.match(html, /import "app:\/app\.js"/);
  assert.doesNotMatch(html, /from \\"\.\.\/data\/seed\.js/);
});
