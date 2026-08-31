import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseSqlBackup } from "./parse-sql-backup.ts";

function base64Dump(files: Array<{ path: string; language: string; content: string }>): string {
  return [
    `-- LifemarkAI Database Backup`,
    `-- Project: test`,
    ``,
    ...files.map((f) =>
      [
        `-- FILE: ${f.path}`,
        `-- LANGUAGE: ${f.language}`,
        `-- ENCODING: base64`,
        `/*`,
        Buffer.from(f.content, "utf8").toString("base64"),
        `*/`,
        ``,
      ].join("\n"),
    ),
  ].join("\n");
}

test("round-trips ordinary file content through the base64 format", () => {
  const dump = base64Dump([{ path: "src/App.tsx", language: "typescriptreact", content: "export default function App() {}\n" }]);
  const files = parseSqlBackup(dump);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "src/App.tsx");
  assert.equal(files[0].language, "typescriptreact");
  assert.equal(files[0].content, "export default function App() {}\n");
});

test("regression: a file containing a block comment ('*/') no longer gets truncated", () => {
  // This was the actual bug in the old raw-embed format: the non-greedy
  // /\*([\s\S]*?)\*\// match stopped at the FIRST "*/" it found, which is
  // exactly what a JS/TS/CSS block comment or JSDoc header contains.
  const content = [
    "/**",
    " * A perfectly normal JSDoc header.",
    " */",
    "export function greet(name: string) {",
    "  return `hello ${name}`;",
    "}",
    "",
  ].join("\n");
  const dump = base64Dump([{ path: "src/greet.ts", language: "typescript", content }]);
  const files = parseSqlBackup(dump);
  assert.equal(files.length, 1);
  assert.equal(files[0].content, content, "content after the first */ must survive intact");
});

test("round-trips multiple files, each independently, in order", () => {
  const dump = base64Dump([
    { path: "a.css", language: "css", content: "/* header comment */\nbody { color: red; }\n" },
    { path: "b.json", language: "json", content: '{"key": "value"}\n' },
  ]);
  const files = parseSqlBackup(dump);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, "a.css");
  assert.equal(files[0].content, "/* header comment */\nbody { color: red; }\n");
  assert.equal(files[1].path, "b.json");
  assert.equal(files[1].content, '{"key": "value"}\n');
});

test("still parses a legacy (pre-base64) raw-embedded dump for backward compatibility", () => {
  const legacyDump = [
    `-- LifemarkAI Database Backup`,
    ``,
    `-- FILE: plain.txt`,
    `-- LANGUAGE: plaintext`,
    `/*`,
    `just plain text, no block comments inside`,
    `*/`,
    ``,
  ].join("\n");
  const files = parseSqlBackup(legacyDump);
  assert.equal(files.length, 1);
  assert.equal(files[0].content, "just plain text, no block comments inside");
});

test("returns an empty array for empty or whitespace-only input", () => {
  assert.deepEqual(parseSqlBackup(""), []);
  assert.deepEqual(parseSqlBackup("   \n  "), []);
});

test("skips a block with malformed base64 rather than restoring garbage", () => {
  const dump = [
    `-- FILE: broken.txt`,
    `-- LANGUAGE: plaintext`,
    `-- ENCODING: base64`,
    `/*`,
    `not valid base64!!! ***`,
    `*/`,
    ``,
  ].join("\n");
  assert.deepEqual(parseSqlBackup(dump), []);
});
