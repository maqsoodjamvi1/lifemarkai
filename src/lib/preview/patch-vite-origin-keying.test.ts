import { describe,it } from "node:test";
import assert from "node:assert/strict";

import { patchViteConfigForWebContainer } from "./patch-vite-for-webcontainer.ts";
import { patchSandboxPreviewFiles } from "./patch-sandbox-preview-files.ts";

/**
 * Previews are same-SITE with the editor (`x.preview.lifemarkai.com` vs
 * `lifemarkai.com`), so without an explicit opt-out Chrome runs both in one
 * renderer process and a booting preview stalls the editor's main thread —
 * measured at 44 seconds on a real project. `Origin-Agent-Cluster: ?1` is what
 * buys the preview its own process.
 *
 * These tests pin the header onto every config shape the generator emits,
 * because a shape that silently misses it is a project that silently freezes.
 */

const HEADER = /"Origin-Agent-Cluster":\s*"\?1"/;

function countHeader(src: string): number {
  return (src.match(/Origin-Agent-Cluster/gi) || []).length;
}

describe("patchViteConfigForWebContainer — preview process isolation", () => {
  it("adds the header when the config has no server block", () => {
    const out = patchViteConfigForWebContainer(
      `import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });`,
    );
    assert.match(out, HEADER);
  });

  it("adds the header to an existing server block", () => {
    const out = patchViteConfigForWebContainer(
      `import { defineConfig } from "vite";\n` +
        `export default defineConfig({\n  server: {\n    port: 5173,\n  },\n});`,
    );
    assert.match(out, HEADER);
    // The app's own setting must survive.
    assert.match(out, /port:\s*5173/);
  });

  it("extends an existing headers block instead of skipping it", () => {
    // The bug this guards: an app that sets one header of its own would
    // otherwise opt itself out of process isolation entirely.
    const out = patchViteConfigForWebContainer(
      `import { defineConfig } from "vite";\n` +
        `export default defineConfig({\n` +
        `  server: {\n    headers: { "X-Frame-Options": "ALLOWALL" },\n  },\n});`,
    );
    assert.match(out, HEADER);
    assert.match(out, /"X-Frame-Options":\s*"ALLOWALL"/);
  });

  it("does not duplicate a header the app already set", () => {
    const out = patchViteConfigForWebContainer(
      `import { defineConfig } from "vite";\n` +
        `export default defineConfig({\n` +
        `  server: {\n    headers: { "Origin-Agent-Cluster": "?1" },\n  },\n});`,
    );
    assert.equal(countHeader(out), 1);
  });

  it("is idempotent — patching twice adds it once", () => {
    const once = patchViteConfigForWebContainer(
      `import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });`,
    );
    const twice = patchViteConfigForWebContainer(once);
    assert.equal(countHeader(twice), 1);
  });

  it("leaves the existing host/allowedHosts patches intact", () => {
    const out = patchViteConfigForWebContainer(
      `import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });`,
    );
    assert.match(out, /host:\s*true/);
    assert.match(out, /allowedHosts:\s*true/);
  });

  it("does not invent a config out of an empty file", () => {
    assert.equal(patchViteConfigForWebContainer("   "), "   ");
    assert.equal(countHeader(patchViteConfigForWebContainer("   ")), 0);
  });
});

/**
 * The unit tests above prove the patcher works. These prove it is actually
 * REACHED, which is the part that decides whether a real project stops
 * freezing. `patchSandboxPreviewFiles` is the one funnel every project passes
 * through on every sandbox boot, and it runs `ensureViteTunnelHmr` FIRST — a
 * separate patcher that also rewrites `server: { … }`. If the two ever stop
 * composing, the header silently disappears and nothing else notices.
 */
describe("patchSandboxPreviewFiles — the header survives the real pipeline", () => {
  const run = (content: string) =>
    patchSandboxPreviewFiles([{ path: "vite.config.ts", content }]).find(
      (f) => f.path === "vite.config.ts",
    )?.content ?? "";

  it("adds it to a bare generated config", () => {
    const out = run(`import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });`);
    assert.match(out, HEADER);
    assert.equal(countHeader(out), 1);
  });

  it("adds it to a hand-written config that already sets host/hmr/allowedHosts", () => {
    // This shape makes ensureViteTunnelHmr bail early (`needed.length === 0`),
    // so it is the case where only the later patcher can add the header.
    const out = run(
      `import { defineConfig } from "vite";\n` +
        `export default defineConfig({\n` +
        `  server: { host: true, allowedHosts: true, hmr: { clientPort: 443 } },\n});`,
    );
    assert.match(out, HEADER);
    assert.equal(countHeader(out), 1);
  });

  it("adds it to a config using the function form of defineConfig", () => {
    const out = run(
      `import { defineConfig } from "vite";\n` +
        `export default defineConfig(({ mode }) => ({ plugins: [], base: "/" }));`,
    );
    assert.match(out, HEADER);
  });
});
