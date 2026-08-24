import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  applyExcerptRevision,
  diffStats,
  diffWords,
  findExcerptInSource,
  normalizeSelection,
  tokenizeWords,
} from "./plan-diff.ts";

test("tokenizer reconstructs its input exactly", () => {
  for (const s of ["Use Redis for caching.", "a\nb\n\nc", "  lead and trail  ", "one", ""]) {
    assert.equal(tokenizeWords(s).join(""), s);
  }
});

test("diff segments reconstruct both sides", () => {
  const pairs: Array<[string, string]> = [
    ["The API uses REST endpoints for all data", "The API uses GraphQL for all data"],
    ["- Step one\n- Step two", "- Step one\n- Step two updated\n- Step three"],
    ["auth via JWT", "auth via sessions stored in Postgres"],
    ["a", "b"],
    ["multi\nline\ntext", "multi\nline\nchanged text"],
  ];
  for (const [before, after] of pairs) {
    const segs = diffWords(before, after);
    assert.equal(segs.filter((s) => s.op !== "insert").map((s) => s.text).join(""), before);
    assert.equal(segs.filter((s) => s.op !== "delete").map((s) => s.text).join(""), after);
  }
});

test("appending does not re-report the last word as changed", () => {
  // Regression: tokenizing words WITH their trailing whitespace made the final
  // "b" become "b ", so "a b" -> "a b c" showed b deleted and re-inserted.
  const segs = diffWords("a b", "a b c").map((s) => `${s.op}:${s.text.trim()}`);
  assert.deepEqual(segs, ["equal:a b", "insert:c"]);
});

test("a word swap is a clean delete + insert", () => {
  const segs = diffWords("Use Redis for caching", "Use Postgres for caching");
  assert.deepEqual(segs.map((s) => s.op), ["equal", "delete", "insert", "equal"]);
  assert.equal(segs[1].text.trim(), "Redis");
  assert.equal(segs[2].text.trim(), "Postgres");
});

test("identical and empty inputs behave", () => {
  assert.deepEqual(diffWords("same", "same"), [{ op: "equal", text: "same" }]);
  assert.deepEqual(diffWords("", ""), []);
  assert.deepEqual(diffWords("", "hi").map((s) => s.op), ["insert"]);
  assert.deepEqual(diffWords("hi", "").map((s) => s.op), ["delete"]);
});

test("diffStats counts words per op", () => {
  assert.deepEqual(diffStats(diffWords("a b c", "a x c")), {
    added: 1,
    removed: 1,
    unchanged: 2,
  });
});

test("applyExcerptRevision splices, or refuses when absent", () => {
  assert.equal(
    applyExcerptRevision("Step 1. Use Redis. Step 2.", "Use Redis.", "Use Postgres."),
    "Step 1. Use Postgres. Step 2.",
  );
  // Absent excerpt must be null, never a fuzzy splice at the wrong position.
  assert.equal(applyExcerptRevision("abc", "zzz", "x"), null);
});

test("selection maps back to verbatim source across wrapped lines", () => {
  assert.equal(normalizeSelection("  Use   Redis\n for caching  "), "Use Redis for caching");
  assert.equal(
    findExcerptInSource("- Use Redis\n  for caching here", "Use Redis for caching"),
    "Use Redis\n  for caching",
  );
  assert.equal(findExcerptInSource("nothing here", "Use Redis"), null);
  // Regex metacharacters in the selection must not blow up the fallback scan.
  assert.equal(
    findExcerptInSource("cost is $5 (approx) today", "cost is $5 (approx)"),
    "cost is $5 (approx)",
  );
});

test("round trip: locate excerpt, revise it, splice back", () => {
  const src = "## Plan\n- Use Redis\n  for caching\n- Ship it";
  const excerpt = findExcerptInSource(src, "Use Redis for caching");
  assert.ok(excerpt);
  assert.equal(
    applyExcerptRevision(src, excerpt, "Use Postgres for caching"),
    "## Plan\n- Use Postgres for caching\n- Ship it",
  );
});
