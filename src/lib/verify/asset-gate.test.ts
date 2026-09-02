import assert from "node:assert/strict";
import test from "node:test";
import { findMissingAssets, repairMissingAssets } from "./asset-gate.ts";

test("findMissingAssets reports a relative image import with no file", () => {
  const files = [
    { path: "src/App.tsx", content: 'import logo from "./logo.png";\nexport default () => <img src={logo} />;' },
  ];
  const missing = findMissingAssets(files);
  assert.equal(missing.length, 1);
  assert.match(missing[0]!.formatted, /missing asset/);
});

test("findMissingAssets ignores http images and existing files", () => {
  const files = [
    { path: "src/App.tsx", content: '<img src="https://cdn.example/a.png" />' },
    { path: "index.html", content: '<img src="/logo.svg" />' },
    { path: "public/logo.svg", content: "<svg></svg>" },
  ];
  assert.deepEqual(findMissingAssets(files), []);
});

test("repairMissingAssets creates an SVG placeholder and rewrites png imports", () => {
  const files = [
    { path: "src/App.tsx", content: 'import logo from "./logo.png";\nexport default () => <img src={logo} />;' },
  ];
  const out = repairMissingAssets(files);
  assert.ok(out.createdPaths.some((path) => path.endsWith(".svg")));
  const app = out.files.find((file) => file.path === "src/App.tsx")!;
  assert.match(app.content!, /\.svg/);
  assert.doesNotMatch(app.content!, /\.png/);
});

test("repairMissingAssets is idempotent", () => {
  const files = [
    { path: "src/Hero.tsx", content: '<img src="./banner.jpg" alt="" />' },
  ];
  const once = repairMissingAssets(files);
  const twice = repairMissingAssets(once.files);
  assert.deepEqual(twice.createdPaths, []);
  assert.deepEqual(twice.changedPaths, []);
});
