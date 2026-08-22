import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { patchViteConfigForWebContainer } from "./patch-vite-for-webcontainer.ts";
import { ensureViteTunnelHmr } from "./patch-sandbox-preview-files.ts";
import { sandboxUsesTlsHmr, stripForcedTlsHmr } from "./sandbox-tls-hmr.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const SCAFFOLD = `import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: true,
    hmr: { protocol: "wss", clientPort: 443 },
  },
});`;

describe("sandbox TLS HMR", () => {
  it("treats a preview domain or https scheme as TLS", () => {
    withEnv({ SANDBOX_PREVIEW_DOMAIN: "preview.example.com", SANDBOX_PUBLIC_SCHEME: "http" }, () => {
      assert.equal(sandboxUsesTlsHmr(), true);
    });
    withEnv({ SANDBOX_PREVIEW_DOMAIN: "", SANDBOX_PUBLIC_SCHEME: "https" }, () => {
      assert.equal(sandboxUsesTlsHmr(), true);
    });
    withEnv({ SANDBOX_PREVIEW_DOMAIN: "", SANDBOX_PUBLIC_SCHEME: "http" }, () => {
      assert.equal(sandboxUsesTlsHmr(), false);
    });
  });

  it("strips wss/443 for local HTTP and leaves TLS configs alone", () => {
    withEnv({ SANDBOX_PREVIEW_DOMAIN: "", SANDBOX_PUBLIC_SCHEME: "http" }, () => {
      const out = stripForcedTlsHmr(SCAFFOLD);
      assert.doesNotMatch(out, /protocol:\s*["']wss["']/);
      assert.doesNotMatch(out, /clientPort:\s*443/);
    });
    withEnv({ SANDBOX_PREVIEW_DOMAIN: "preview.lifemarkai.com", SANDBOX_PUBLIC_SCHEME: "https" }, () => {
      assert.equal(stripForcedTlsHmr(SCAFFOLD), SCAFFOLD);
    });
  });

  it("ensureViteTunnelHmr rewrites a model-written wss block on local HTTP", () => {
    withEnv({ SANDBOX_PREVIEW_DOMAIN: "", SANDBOX_PUBLIC_SCHEME: "http" }, () => {
      const [file] = ensureViteTunnelHmr([{ path: "vite.config.ts", content: SCAFFOLD }]);
      assert.doesNotMatch(file.content ?? "", /protocol:\s*["']wss["']/);
      assert.doesNotMatch(file.content ?? "", /clientPort:\s*443/);
      assert.match(file.content ?? "", /allowedHosts:\s*true/);
    });
  });

  it("patchViteConfigForWebContainer does not re-inject wss on local HTTP", () => {
    withEnv({ SANDBOX_PREVIEW_DOMAIN: "", SANDBOX_PUBLIC_SCHEME: "http" }, () => {
      const out = patchViteConfigForWebContainer(
        `import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });`,
      );
      assert.doesNotMatch(out, /protocol:\s*["']wss["']/);
      assert.match(out, /host:\s*true/);
      assert.match(out, /allowedHosts:\s*true/);
    });
  });

  it("patchViteConfigForWebContainer still injects wss for TLS tunnels", () => {
    withEnv({ SANDBOX_PREVIEW_DOMAIN: "preview.lifemarkai.com", SANDBOX_PUBLIC_SCHEME: "https" }, () => {
      const out = patchViteConfigForWebContainer(
        `import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });`,
      );
      assert.match(out, /protocol:\s*"wss"/);
      assert.match(out, /clientPort:\s*443/);
    });
  });
});
