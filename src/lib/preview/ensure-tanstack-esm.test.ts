import assert from "node:assert/strict";
import test from "node:test";
import { ensureTanStackEsm } from "./ensure-tanstack-esm.ts";

test("restores ESM for TanStack manifests with missing or CommonJS type", () => {
  for (const section of ["dependencies", "devDependencies"]) {
    for (const type of [undefined, "commonjs"]) {
      const pkg = { name: "test", type, scripts: { dev: "vite" }, [section]: { "@tanstack/react-start": "^1.168.0" } };
      const files = [{ path: "package.json", content: JSON.stringify(pkg) }];
      const repaired = ensureTanStackEsm(files);
      assert.deepEqual(JSON.parse(repaired[0].content), { ...JSON.parse(files[0].content), type: "module" });
      assert.deepEqual(ensureTanStackEsm(repaired), repaired);
    }
  }
});

test("leaves other frameworks and malformed manifests unchanged", () => {
  for (const content of ['{"type":"commonjs","dependencies":{"react":"19"}}', "{broken", "null", "[]"]) {
    const files = [{ path: "package.json", content }];
    assert.deepEqual(ensureTanStackEsm(files), files);
  }
});
