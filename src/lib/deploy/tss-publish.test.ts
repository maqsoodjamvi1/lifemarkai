import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ensureTssSpaPublishHook,
  rerootClientBuild,
  TSS_SPA_PUBLISH_OPTIONS,
} from "./tss-publish.ts";

const SCAFFOLD_STYLE = `import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
export default defineConfig({
  plugins: [
    tanstackStart(),
    viteReact(),
  ],
});
`;

test("legacy bare tanstackStart() gains the publish hook", () => {
  const out = ensureTssSpaPublishHook(SCAFFOLD_STYLE);
  assert.match(out, /tanstackStart\(\{ spa: \{ enabled: process\.env\.LM_PUBLISH_SPA === "1"/);
  assert.match(out, /outputPath: "\/index\.html"/);
  // still exactly one call, react plugin untouched
  assert.equal((out.match(/tanstackStart\(/g) ?? []).length, 1);
  assert.match(out, /viteReact\(\)/);
});

test("tanstackStart({ existing }) keeps its options and gains ours first", () => {
  const cfg = `plugins: [tanstackStart({ target: "vercel" })]`;
  const out = ensureTssSpaPublishHook(cfg);
  assert.match(out, /tanstackStart\(\{ spa: .*?, target: "vercel" \}\)/);
});

test("configs that already opt in (or configure spa) are untouched", () => {
  const withHook = SCAFFOLD_STYLE.replace(
    "tanstackStart()",
    `tanstackStart({ ${TSS_SPA_PUBLISH_OPTIONS} })`,
  );
  assert.equal(ensureTssSpaPublishHook(withHook), withHook);

  const userSpa = `plugins: [tanstackStart({ spa: { enabled: true } })]`;
  assert.equal(ensureTssSpaPublishHook(userSpa), userSpa);
});

test("non-TSS configs and unrecognized shapes pass through", () => {
  const classic = `export default defineConfig({ plugins: [react()] });`;
  assert.equal(ensureTssSpaPublishHook(classic), classic);
  const weird = `const opts = {}; tanstackStart(opts);`;
  assert.equal(ensureTssSpaPublishHook(weird), weird);
});

test("reroot: client/ layout becomes the build root, server output dropped", () => {
  const out = rerootClientBuild([
    { path: "client/index.html", content: "<html>" },
    { path: "client/assets/app-abc.js", content: "js" },
    { path: "client/assets/app-abc.css", content: "css" },
    { path: "server/server.js", content: "handler" },
    { path: "nitro.json", content: "{}" },
  ]);
  assert.ok(out);
  const paths = out!.map((f) => f.path).sort();
  assert.deepEqual(paths, ["assets/app-abc.css", "assets/app-abc.js", "index.html"]);
});

test("reroot: no-op when a root index.html already exists or layout unknown", () => {
  assert.equal(rerootClientBuild([{ path: "index.html", content: "x" }]), null);
  assert.equal(rerootClientBuild([{ path: "assets/app.js", content: "x" }]), null);
});

test("reroot: keeps sibling non-server files with their paths", () => {
  const out = rerootClientBuild([
    { path: "client/index.html", content: "<html>" },
    { path: "robots.txt", content: "ok" },
  ]);
  assert.deepEqual(out!.map((f) => f.path).sort(), ["index.html", "robots.txt"]);
});
