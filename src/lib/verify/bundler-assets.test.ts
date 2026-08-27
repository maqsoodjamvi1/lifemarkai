/**
 * One asset list, used by both resolution checks.
 *
 * Two checks answer "does this import resolve to a project file?" —
 * findUnresolvedLocalImports and findMissingModules — and each carried its own
 * copy of the assets-are-exempt list. The copies drifted, so a generated app
 * that imported a font failed one check, a favicon failed the other, and a
 * video or audio clip failed both, each time reported as "no such file exists
 * in the project" about a file the bundler serves happily.
 *
 *   node --import tsx --test src/lib/verify/bundler-assets.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isBundlerAsset } from "./bundler-assets.ts";
import { findUnresolvedLocalImports } from "./typecheck-gate.ts";
import { findMissingModules } from "../preview/export-contract.ts";
import { repairImportsInFile } from "../preview/normalize-imports.ts";

/** Every extension measured as false-failing on one or both checks. */
const REGRESSIONS = [
  "ico", "txt", "md",        // were reported by typecheck-gate only
  "woff", "woff2", "ttf",    // were reported by export-contract only
  "otf", "eot", "mp4", "webm", "mp3", "wav", // were reported by BOTH
];
const ALREADY_FINE = ["css", "svg", "png", "json", "avif"];

const importing = (spec: string) => [
  { path: "src/routes/__root.tsx", content: `import a from "${spec}";\nexport const x = a;\n` },
];

describe("both checks exempt the same assets", () => {
  for (const ext of [...REGRESSIONS, ...ALREADY_FINE]) {
    it(`.${ext} is not a missing module on either check`, () => {
      const files = importing(`../asset.${ext}`);
      assert.deepEqual(
        findUnresolvedLocalImports(files as never).map((u) => u.formatted),
        [],
        `typecheck-gate reported .${ext}`,
      );
      assert.deepEqual(
        findMissingModules(files as never).map((m) => m.message),
        [],
        `export-contract reported .${ext}`,
      );
    });
  }

  it("exempts them through a Vite resource query too", () => {
    for (const spec of ["../f.woff2?url", "../a.css?inline", "../v.mp4?url"]) {
      assert.deepEqual(findUnresolvedLocalImports(importing(spec) as never), []);
      assert.deepEqual(findMissingModules(importing(spec) as never), []);
    }
  });
});

describe("the exemption is not a silencer", () => {
  // The whole value of these checks is catching a component that was imported
  // but never generated. If widening the asset list ever costs that, the list
  // has gone too far.
  it("still reports a missing CODE module", () => {
    const files = importing("../components/Card");
    assert.ok(
      findMissingModules(files as never).length > 0,
      "a missing component must still be reported",
    );
    assert.ok(
      findUnresolvedLocalImports(files as never).length > 0,
      "a missing component must still be reported",
    );
  });

  it("does not exempt a code file whose name merely contains an asset word", () => {
    // "./icons" and "./markdown" end in no asset extension; a substring match
    // rather than an end-anchored one would swallow both.
    for (const spec of ["../icons", "../markdown", "../css-utils"]) {
      assert.equal(isBundlerAsset(spec), false, `${spec} should not be treated as an asset`);
    }
  });

  it("anchors at the extension, not anywhere in the path", () => {
    assert.equal(isBundlerAsset("../styles.css/index"), false);
    assert.equal(isBundlerAsset("../a.png.ts"), false);
    assert.equal(isBundlerAsset("../a.png"), true);
  });
});

describe("the third copy is consolidated without losing coverage", () => {
  // normalize-imports.ts held its own copy, which export-contract's comment
  // referenced by name with nothing enforcing it. It was the MOST complete of
  // the three and uniquely carried .glsl, so merging naively would have created
  // a new false positive on shader imports rather than removing one.
  it("still exempts .glsl, which only the third copy had", () => {
    assert.equal(isBundlerAsset("../shaders/wave.glsl"), true);
  });

  it("all three checks now agree on every extension", () => {
    const every = [...REGRESSIONS, ...ALREADY_FINE, "glsl", "wasm", "bmp", "styl"];
    for (const ext of every) {
      const spec = `../asset.${ext}`;
      assert.equal(isBundlerAsset(spec), true, `shared list rejects .${ext}`);
      assert.deepEqual(findUnresolvedLocalImports(importing(spec) as never), [], `typecheck-gate reports .${ext}`);
      assert.deepEqual(findMissingModules(importing(spec) as never), [], `export-contract reports .${ext}`);
      // normalize-imports is exercised through its public API: an asset import
      // must be left EXACTLY as written, never "repaired" toward a code file.
      const src = `import a from "${spec}";\n`;
      assert.equal(
        repairImportsInFile("src/routes/__root.tsx", src, ["src/routes/__root.tsx"]),
        src,
        `normalize-imports rewrote .${ext}`,
      );
    }
  });

  it("normalize-imports still repairs a genuinely misplaced code import", () => {
    // The counterpart: widening the asset list must not stop real repairs.
    // Misplaced, not merely missing: written as a sibling, actually one folder
    // over. That is the case this module exists to repair.
    const src = `import { Card } from "./Card";\n`;
    const out = repairImportsInFile("src/routes/__root.tsx", src, [
      "src/routes/__root.tsx",
      "src/components/Card.tsx",
    ]);
    assert.notEqual(out, src, "a misplaced code import should have been repointed");
    assert.match(out, /components\/Card/);
  });
});
