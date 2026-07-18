/**
 * Unit tests for lib/editor/parse-line-refs.ts
 * Run: npx tsx --test lib/editor/parse-line-refs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseLineRefs,
  removeLineRefFromInput,
  formatLineRefLabel,
} from "./parse-line-refs.ts";

describe("parseLineRefs", () => {
  it("parses single line ref", () => {
    const refs = parseLineRefs("Fix @src/App.tsx:42 please");
    assert.equal(refs.length, 1);
    assert.equal(refs[0].path, "src/App.tsx");
    assert.equal(refs[0].startLine, 42);
    assert.equal(refs[0].endLine, 42);
  });

  it("parses line range", () => {
    const refs = parseLineRefs("@lib/utils.ts:10-25");
    assert.equal(refs[0].startLine, 10);
    assert.equal(refs[0].endLine, 25);
  });

  it("removes ref from input", () => {
    const next = removeLineRefFromInput("hello @src/a.ts:1 world", "@src/a.ts:1");
    assert.equal(next, "hello world");
  });

  it("formats label", () => {
    assert.equal(
      formatLineRefLabel({ raw: "@x", path: "src/foo.tsx", startLine: 3, endLine: 3 }),
      "foo.tsx:3",
    );
  });
});
