import { strict as assert } from "node:assert";
import { test } from "node:test";
import { findSourceRefs, linkifySourceRefs, parseRefHref, refHref } from "./line-refs.ts";

test("linkifies bare refs the model writes naturally", () => {
  assert.equal(
    linkifySourceRefs("see Button.tsx:42 now"),
    "see [Button.tsx:42](#lm-ref/Button.tsx/42) now",
  );
  assert.equal(
    linkifySourceRefs("in src/lib/db.ts:120"),
    "in [src/lib/db.ts:120](#lm-ref/src%2Flib%2Fdb.ts/120)",
  );
  assert.equal(
    linkifySourceRefs("at App.tsx:10-20 there"),
    "at [App.tsx:10-20](#lm-ref/App.tsx/10/20) there",
  );
  // Start-of-string has no preceding character to anchor on.
  assert.match(linkifySourceRefs("Button.tsx:42 is broken"), /^\[Button\.tsx:42\]/);
});

test("keeps the explicit @ form working", () => {
  assert.equal(
    linkifySourceRefs("see @src/App.tsx:7"),
    "see [@src/App.tsx:7](#lm-ref/src%2FApp.tsx/7)",
  );
});

test("does not linkify things that merely look like refs", () => {
  // Every one of these appeared in real assistant output at some point; the
  // bare-ref pattern is only safe because each is excluded.
  for (const s of [
    "open localhost:3000 now",
    "at https://x.com:8080/a.ts:4",
    "meet at 12:30 ok",
    "error report:42 here",
    "file data.xyz:9 here",
  ]) {
    assert.equal(linkifySourceRefs(s), s, `should be untouched: ${s}`);
  }
});

test("never touches code blocks or inline code", () => {
  const fenced = "x\n```\nButton.tsx:42\n```\ny";
  assert.equal(linkifySourceRefs(fenced), fenced);
  const inline = "use `Button.tsx:42` here";
  assert.equal(linkifySourceRefs(inline), inline);
});

test("refHref and parseRefHref round-trip", () => {
  assert.deepEqual(parseRefHref(refHref("Button.tsx", 42)), {
    path: "Button.tsx",
    line: 42,
    endLine: null,
  });
  assert.deepEqual(parseRefHref(refHref("src/lib/db.ts", 120, 140)), {
    path: "src/lib/db.ts",
    line: 120,
    endLine: 140,
  });
  assert.equal(parseRefHref("#not-a-ref"), null);
});

test("end to end: text -> markdown link -> parsed ref", () => {
  const md = linkifySourceRefs("fix src/components/Nav.tsx:88 please");
  const href = /\((#lm-ref[^)]*)\)/.exec(md)?.[1] ?? "";
  assert.deepEqual(parseRefHref(href), {
    path: "src/components/Nav.tsx",
    line: 88,
    endLine: null,
  });
});

test("findSourceRefs reports both syntaxes and skips noise", () => {
  const refs = findSourceRefs("a Button.tsx:42 and @src/x.ts:7-9 and localhost:3000");
  assert.equal(refs.length, 2);
  assert.ok(refs.some((r) => r.path === "Button.tsx" && r.line === 42));
  assert.ok(refs.some((r) => r.path === "src/x.ts" && r.endLine === 9));
});
