import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chunkSourceFile, isIndexablePath } from "./code-chunker.ts";

const SAMPLE = `import { useState } from "react";

const HELPERS = {
  brace: "}",
  tmpl: \`literal with { and } inside\`,
};

export function first() {
  // a comment with a stray {
  return "{ not a real brace }";
}

export function second() {
  const nested = () => {
    return 1;
  };
  return nested();
}

export default function App() {
  const [n] = useState(0);
  return <div>{n}</div>;
}
`;

test("chunks are declaration-aligned and cover the file in order", () => {
  const chunks = chunkSourceFile("src/App.tsx", SAMPLE);
  assert.ok(chunks.length >= 1);
  // coverage: starts at line 1, ends at last line, monotonically increasing
  assert.equal(chunks[0]!.startLine, 1);
  const last = chunks[chunks.length - 1]!;
  assert.equal(last.endLine, SAMPLE.split("\n").length);
  for (let i = 1; i < chunks.length; i++) {
    assert.equal(chunks[i]!.startLine, chunks[i - 1]!.endLine + 1, "no gaps, no overlap");
  }
  // braces inside strings/templates/comments didn't break boundary detection:
  // every chunk that claims a name must actually start with that declaration.
  for (const c of chunks) {
    if (c.name) {
      assert.match(c.text.split("\n")[0]!, new RegExp(`\\b${c.name}\\b`));
    }
  }
});

test("declaration names are captured", () => {
  const names = chunkSourceFile("src/App.tsx", SAMPLE).map((c) => c.name);
  assert.ok(names.includes("App"), `expected App in ${JSON.stringify(names)}`);
});

test("deterministic: same input produces identical chunks", () => {
  const a = chunkSourceFile("src/App.tsx", SAMPLE);
  const b = chunkSourceFile("src/App.tsx", SAMPLE);
  assert.deepEqual(a, b);
});

test("oversized declarations get split, small ones merged", () => {
  const big = "export function huge() {\n" + "  doWork();\n".repeat(400) + "}\n";
  const chunks = chunkSourceFile("src/big.ts", big);
  assert.ok(chunks.length > 1, "400-line function must split");
  for (const c of chunks) {
    assert.ok(c.endLine - c.startLine + 1 <= 150, "no chunk exceeds the cap");
  }
});

test("non-JS text files fall back to fixed windows", () => {
  const css = Array.from({ length: 200 }, (_, i) => `.c${i} { color: red; }`).join("\n");
  const chunks = chunkSourceFile("styles.css", css);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0]!.kind, "window");
});

test("isIndexablePath filters junk", () => {
  assert.equal(isIndexablePath("src/App.tsx"), true);
  assert.equal(isIndexablePath("src/lib/util.ts"), true);
  assert.equal(isIndexablePath("styles/main.css"), true);
  assert.equal(isIndexablePath("node_modules/react/index.js"), false);
  assert.equal(isIndexablePath("package-lock.json"), false);
  assert.equal(isIndexablePath("src/routeTree.gen.ts"), false);
  assert.equal(isIndexablePath("logo.svg"), false);
  assert.equal(isIndexablePath("app.min.js"), false);
});

test("empty and oversized files produce no chunks", () => {
  assert.deepEqual(chunkSourceFile("a.ts", "   \n  "), []);
  assert.deepEqual(chunkSourceFile("a.ts", "x".repeat(300_000)), []);
});
