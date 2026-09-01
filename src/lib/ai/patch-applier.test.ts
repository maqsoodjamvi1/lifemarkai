/**
 * Covers the find-and-replace path in applyPatches — previously untested,
 * which is how the $&/$`/$'/$$ literal-replacement bug (fixed alongside
 * this test) went unnoticed: String.prototype.replace(string, string)
 * treats those sequences as substitution patterns, not literal text.
 *
 *   node --import tsx --test src/lib/ai/patch-applier.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyPatches } from "./patch-applier.ts";

describe("applyPatches — find-and-replace", () => {
  it("applies a unique find/replace", () => {
    const [r] = applyPatches(
      [{ path: "a.ts", find: "const a = 1;", replace: "const a = 2;" }],
      [{ path: "a.ts", content: "const a = 1;\n" }],
    );
    assert.equal(r.applied, true);
    assert.match(r.content, /const a = 2;/);
  });

  it("creates a new file via full replacement when find is omitted", () => {
    const [r] = applyPatches([{ path: "new.ts", replace: "export const x = 1;\n" }], []);
    assert.equal(r.applied, true);
    assert.equal(r.content, "export const x = 1;\n");
  });

  it("appends when find is an empty string", () => {
    const [r] = applyPatches(
      [{ path: "a.ts", find: "", replace: "export const b = 2;" }],
      [{ path: "a.ts", content: "export const a = 1;" }],
    );
    assert.equal(r.applied, true);
    assert.match(r.content, /a = 1;\nexport const b = 2;/);
  });

  it("rejects an ambiguous find rather than guessing which occurrence", () => {
    const [r] = applyPatches(
      [{ path: "a.ts", find: "let x = 1;", replace: "let x = 2;" }],
      [{ path: "a.ts", content: "let x = 1;\nlet x = 1;\n" }],
    );
    assert.equal(r.applied, false);
    assert.match(r.error!, /appears more than once/);
  });

  it("reports a miss rather than guessing on a not-found find", () => {
    const [r] = applyPatches(
      [{ path: "a.ts", find: "not in the file", replace: "x" }],
      [{ path: "a.ts", content: "const a = 1;\n" }],
    );
    assert.equal(r.applied, false);
    assert.match(r.error!, /not found/);
  });

  it("applies a replacement containing $&/$`/$'/$$ literally, not as a substitution pattern", () => {
    const [r] = applyPatches(
      [
        {
          path: "fmt.ts",
          find: "return v;",
          replace: 'return v.replace(/(\\d)(?=(\\d{3})+(?!\\d))/g, "$&,");',
        },
      ],
      [{ path: "fmt.ts", content: "function fmt(v) {\n  return v;\n}\n" }],
    );
    assert.equal(r.applied, true);
    assert.match(r.content, /"\$&,"\);/, "the literal $&, must survive untouched");
    assert.doesNotMatch(
      r.content,
      /return v;\s*\n\s*return v;/,
      "the find block must not be spliced back in via $&",
    );
  });

  it("later patches to the same path see earlier results", () => {
    const results = applyPatches(
      [
        { path: "a.ts", find: "const a = 1;", replace: "const a = 2;" },
        { path: "a.ts", find: "const a = 2;", replace: "const a = 3;" },
      ],
      [{ path: "a.ts", content: "const a = 1;\n" }],
    );
    assert.equal(results[1].applied, true);
    assert.match(results[1].content, /const a = 3;/);
  });
});
