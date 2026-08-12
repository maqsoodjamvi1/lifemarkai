import { describe,it } from "node:test";
import assert from "node:assert/strict";

import { filesToPrune } from "./prune-files.ts";

/**
 * This is the only part of the warm-container path that deletes, so it gets
 * tested directly. A mistake here does not make a preview slow — it removes
 * files from someone's project.
 */
describe("filesToPrune", () => {
  it("removes a file the project no longer has", () => {
    assert.deepEqual(
      filesToPrune(["src/App.tsx", "src/pages/Old.tsx"], ["src/App.tsx"]),
      ["src/pages/Old.tsx"],
    );
  });

  it("handles a rename as delete-plus-add", () => {
    assert.deepEqual(
      filesToPrune(["src/Old.tsx"], ["src/New.tsx"]),
      ["src/Old.tsx"],
    );
  });

  it("removes nothing when the project is unchanged", () => {
    const files = ["package.json", "src/App.tsx", "index.html"];
    assert.deepEqual(filesToPrune(files, files), []);
  });

  it("treats separators and leading slashes as the same path", () => {
    assert.deepEqual(filesToPrune(["src\\App.tsx"], ["src/App.tsx"]), []);
    assert.deepEqual(filesToPrune(["/src/App.tsx"], ["src/App.tsx"]), []);
  });

  // The container is untrusted and its manifest is a file inside it, so the
  // manifest is treated as hostile input even though we wrote it.
  it("refuses to escape the project directory", () => {
    assert.deepEqual(
      filesToPrune(
        ["../../etc/passwd", "/etc/passwd", "src/../../secrets.env", "ok/gone.ts"],
        [],
      ),
      ["ok/gone.ts"],
    );
  });

  it("never touches node_modules or the manifest itself", () => {
    assert.deepEqual(
      filesToPrune(
        ["node_modules/react/index.js", ".lm-sync-manifest.json", "src/gone.ts"],
        [],
      ),
      ["src/gone.ts"],
    );
  });

  it("prunes nothing from an empty manifest", () => {
    assert.deepEqual(filesToPrune([], ["src/App.tsx"]), []);
  });

  // The guard that matters most: given a partial file set this would read every
  // unsent file as deleted. Callers must pass the complete set — this test
  // documents what the function does when they do, so the contract is explicit.
  it("would delete everything absent from `current` — hence complete-set-only", () => {
    assert.deepEqual(filesToPrune(["a.ts", "b.ts"], []), ["a.ts", "b.ts"]);
  });
});
