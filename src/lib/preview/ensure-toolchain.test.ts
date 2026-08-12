import { test } from "node:test";
import assert from "node:assert/strict";

import { ensureTypecheckToolchain } from "./ensure-toolchain.ts";

type File = { path: string; content?: string | null };

const pkg = (extra: Record<string, unknown> = {}) =>
  JSON.stringify(
    {
      name: "lifemarkai-app",
      version: "0.0.1",
      private: true,
      type: "module",
      scripts: { dev: "vite dev", build: "vite build" },
      dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
      devDependencies: { vite: "^7.0.0", tailwindcss: "^3.4.0" },
      ...extra,
    },
    null,
    2,
  );

function devDepsOf(files: File[]): Record<string, string> {
  const f = files.find((x) => x.path === "package.json");
  return JSON.parse(f!.content as string).devDependencies;
}

test("re-adds the compiler a freehand rewrite dropped", () => {
  // The production shape: tsconfig present, .tsx everywhere, no typescript.
  const files: File[] = [
    { path: "package.json", content: pkg() },
    { path: "tsconfig.json", content: "{}" },
    { path: "src/routes/__root.tsx", content: "export const Route = 1;" },
  ];

  const out = ensureTypecheckToolchain(files);
  const dev = devDepsOf(out);

  assert.ok(dev.typescript, "typescript must be present or tsc cannot run");
  assert.ok(dev["@types/react"], "without react types tsc emits only noise");
  assert.ok(dev["@types/react-dom"]);
  // Untouched entries survive.
  assert.equal(dev.vite, "^7.0.0");
  assert.equal(dev.tailwindcss, "^3.4.0");
});

test("never overwrites a version the project already chose", () => {
  const files: File[] = [
    {
      path: "package.json",
      content: pkg({ devDependencies: { typescript: "^4.9.0" } }),
    },
    { path: "src/App.tsx", content: "" },
  ];

  const dev = devDepsOf(ensureTypecheckToolchain(files));
  assert.equal(dev.typescript, "^4.9.0", "aligning versions is another function's job");
});

test("counts a dependency-section entry as present", () => {
  const files: File[] = [
    {
      path: "package.json",
      content: pkg({ dependencies: { react: "^18.3.1", typescript: "^5.5.0" } }),
    },
    { path: "src/App.tsx", content: "" },
  ];

  const out = ensureTypecheckToolchain(files);
  assert.equal(devDepsOf(out).typescript, undefined, "must not be added twice");
});

test("adds node types only when a TypeScript vite config exists", () => {
  const withConfig = ensureTypecheckToolchain([
    { path: "package.json", content: pkg() },
    { path: "vite.config.ts", content: "" },
    { path: "src/App.tsx", content: "" },
  ]);
  assert.ok(devDepsOf(withConfig)["@types/node"]);

  const withoutConfig = ensureTypecheckToolchain([
    { path: "package.json", content: pkg() },
    { path: "vite.config.js", content: "" },
    { path: "src/App.tsx", content: "" },
  ]);
  assert.equal(devDepsOf(withoutConfig)["@types/node"], undefined);
});

test("leaves a plain JavaScript project alone", () => {
  const files: File[] = [
    { path: "package.json", content: pkg() },
    { path: "src/App.jsx", content: "" },
    { path: "vite.config.js", content: "" },
  ];
  assert.equal(ensureTypecheckToolchain(files), files, "same reference — no rewrite");
});

test("a lone .d.ts does not make a project TypeScript", () => {
  const files: File[] = [
    { path: "package.json", content: pkg() },
    { path: "src/App.jsx", content: "" },
    { path: "src/vite-env.d.ts", content: "" },
  ];
  assert.equal(ensureTypecheckToolchain(files), files);
});

test("is idempotent", () => {
  const files: File[] = [
    { path: "package.json", content: pkg() },
    { path: "src/App.tsx", content: "" },
  ];
  const once = ensureTypecheckToolchain(files);
  const twice = ensureTypecheckToolchain(once);
  assert.equal(twice, once, "second pass must be a no-op");
});

test("declines to touch a malformed package.json", () => {
  const files: File[] = [
    { path: "package.json", content: "{ broken" },
    { path: "src/App.tsx", content: "" },
  ];
  assert.equal(ensureTypecheckToolchain(files), files);
});

test("output stays valid JSON", () => {
  const out = ensureTypecheckToolchain([
    { path: "package.json", content: pkg() },
    { path: "tsconfig.json", content: "{}" },
    { path: "src/App.tsx", content: "" },
  ]);
  const raw = out.find((f) => f.path === "package.json")!.content as string;
  assert.doesNotThrow(() => JSON.parse(raw));
  assert.match(raw, /\n$/, "trailing newline, like the other writers");
});
