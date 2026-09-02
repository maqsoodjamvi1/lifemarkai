import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findJsxPreviewDefects,
  repairJsxPreviewDefects,
  rewriteJsxHtmlAttributes,
} from "./jsx-gate.ts";

describe("rewriteJsxHtmlAttributes", () => {
  it("renames class, label for, and onclick in JSX tags", () => {
    const src = `export default () => (
  <form onclick={go}>
    <label for="email">Email</label>
    <div class="hero">Hi</div>
  </form>
);`;
    const out = rewriteJsxHtmlAttributes(src);
    assert.match(out.content, /className="hero"/);
    assert.match(out.content, /htmlFor="email"/);
    assert.match(out.content, /onClick=\{go\}/);
    assert.doesNotMatch(out.content, /\sclass=/);
    assert.doesNotMatch(out.content, /\sfor="/);
    assert.doesNotMatch(out.content, /\sonclick=/);
  });

  it("does not rewrite class= inside strings or comments", () => {
    const src = `const html = '<div class="keep"></div>';
// <span class="nope">
export default () => <p className="ok">x</p>;`;
    const out = rewriteJsxHtmlAttributes(src);
    assert.equal(out.count, 0);
    assert.match(out.content, /class="keep"/);
    assert.match(out.content, /class="nope"/);
  });
});

describe("repairJsxPreviewDefects", () => {
  it("adds a key to a .map() JSX element and an index param", () => {
    const files = [
      {
        path: "src/List.tsx",
        content: "export default ({items}) => <ul>{items.map(item => <li>{item}</li>)}</ul>;",
      },
    ];
    assert.ok(findJsxPreviewDefects(files).length > 0);
    const out = repairJsxPreviewDefects(files);
    const src = out.files[0]!.content!;
    assert.match(src, /map\(\(item, i\) =>/);
    assert.match(src, /<li key=\{i\}>/);
    assert.deepEqual(repairJsxPreviewDefects(out.files).changedPaths, []);
  });
});
