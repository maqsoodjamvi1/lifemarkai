import assert from "node:assert/strict";
import test from "node:test";
import { filesToFsTree, prepareFilesForWebContainer } from "./webcontainer-engine.ts";

// Regression: WebContainer used to receive files completely raw — none of
// the file-prep pipeline the sandbox provider gets (import repair, toolchain
// pins, vite-config/HTML patches) ever ran for this engine. prepareFilesForWebContainer
// wires the browser-safe subset of that pipeline in.
test("prepareFilesForWebContainer repairs a broken relative import specifier", () => {
  const files = prepareFilesForWebContainer([
    { path: "package.json", content: JSON.stringify({ name: "x", scripts: { dev: "vite" } }) },
    {
      path: "src/components/ui/tooltip.tsx",
      content: 'import { cn } from "../utils.ts";\nexport default function Tooltip(){ return null; }',
    },
    { path: "src/lib/utils.ts", content: "export function cn(){ return \"\"; }" },
  ]);
  const tooltip = files.find((f) => f.path === "src/components/ui/tooltip.tsx");
  assert.ok(tooltip);
  // The broken specifier ("../utils.ts" from src/components/ui/) must be
  // repaired to actually resolve to src/lib/utils.ts.
  assert.doesNotMatch(tooltip!.content ?? "", /from "\.\.\/utils\.ts"/);
});

test("prepareFilesForWebContainer re-adds a dropped typescript devDependency", () => {
  const files = prepareFilesForWebContainer([
    {
      path: "package.json",
      content: JSON.stringify({ name: "x", scripts: { dev: "vite" }, devDependencies: {} }),
    },
    { path: "tsconfig.json", content: "{}" },
    { path: "src/App.tsx", content: "export default function App(){ return null; }" },
  ]);
  const pkg = files.find((f) => f.path === "package.json");
  assert.ok(pkg);
  const parsed = JSON.parse(pkg!.content ?? "{}");
  assert.ok(parsed.devDependencies?.typescript, "typescript must be re-added when missing");
});

test("prepareFilesForWebContainer patches vite.config.ts for WebContainer (host/allowedHosts)", () => {
  const files = prepareFilesForWebContainer([
    { path: "package.json", content: JSON.stringify({ name: "x", scripts: { dev: "vite" } }) },
    {
      path: "vite.config.ts",
      content: 'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });',
    },
  ]);
  const viteConfig = files.find((f) => f.path === "vite.config.ts");
  assert.ok(viteConfig);
  assert.match(viteConfig!.content ?? "", /host:\s*true/);
  assert.match(viteConfig!.content ?? "", /allowedHosts:\s*true/);
});

test("prepareFilesForWebContainer leaves an already-clean project alone", () => {
  const input = [
    { path: "package.json", content: JSON.stringify({ name: "x", devDependencies: { typescript: "^5.5.0" } }) },
    { path: "src/App.tsx", content: 'import React from "react";\nexport default function App(){ return null; }' },
  ];
  const files = prepareFilesForWebContainer(input);
  const app = files.find((f) => f.path === "src/App.tsx");
  assert.equal(app?.content, input[1].content);
});

test("filesToFsTree nests a flat file list by path", () => {
  const tree = filesToFsTree([
    { path: "src/components/Header.tsx", content: "export {}" },
    { path: "package.json", content: "{}" },
  ]);
  assert.ok("package.json" in tree);
  assert.ok("src" in tree);
  const src = tree.src as { directory: Record<string, unknown> };
  assert.ok("components" in src.directory);
});
