import assert from "node:assert/strict";
import test from "node:test";
import {
  patchViteConfigForWebContainer,
  ensureAtAlias,
  ensureReactDedupe,
  ensureReactOptimizeDeps,
} from "./patch-vite-for-webcontainer.ts";

// `defineConfig(({ mode }) => ({ ... }))` is an entirely ordinary Vite config
// shape (needed whenever the config reads `mode`/`command`), but every
// injector in this file used to recognize only the direct-object form
// `defineConfig({ ... })`. On the arrow form they all silently no-op'd —
// including the origin-isolation header this file exists to add, which this
// test pins directly.
const ARROW_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
}));
`;

test("patchViteConfigForWebContainer patches the arrow-function defineConfig form", () => {
  const out = patchViteConfigForWebContainer(ARROW_CONFIG);
  assert.match(out, /host:\s*true/);
  assert.match(out, /allowedHosts:\s*true/);
  assert.match(out, /Origin-Agent-Cluster/);
  // The arrow wrapper itself must survive — not be replaced by a hardcoded
  // direct-object form that would drop the `{ mode }` parameter.
  assert.match(out, /defineConfig\s*\(\s*\(\s*\{\s*mode\s*\}\s*\)\s*=>/);
});

test("patchViteConfigForWebContainer still patches the direct-object defineConfig form", () => {
  const direct = `import { defineConfig } from "vite";\nexport default defineConfig({\n  plugins: [],\n});\n`;
  const out = patchViteConfigForWebContainer(direct);
  assert.match(out, /host:\s*true/);
  assert.match(out, /Origin-Agent-Cluster/);
});

test("ensureAtAlias / ensureReactDedupe / ensureReactOptimizeDeps all handle the arrow form", () => {
  const withAlias = ensureAtAlias(ARROW_CONFIG);
  assert.match(withAlias, /alias:\s*\{\s*"@":/);

  const withDedupe = ensureReactDedupe(ARROW_CONFIG);
  assert.match(withDedupe, /dedupe:\s*\[[^\]]*"react"/);

  const withOptimize = ensureReactOptimizeDeps(ARROW_CONFIG);
  assert.match(withOptimize, /optimizeDeps:\s*\{\s*include:\s*\["react",\s*"react-dom"\]/);
});
