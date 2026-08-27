/**
 * Anchored edits are only safe if a bad edit CANNOT half-apply. Most of these
 * tests are about refusing, because refusal falls back to the whole-file path
 * and costs nothing but tokens — a silent mis-apply costs a corrupted project.
 *
 *   node --import tsx --test src/lib/ai/edit-blocks.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyEditBlocks, parseEditBlocks } from "./edit-blocks.ts";

const FILE = `import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`;
const files = new Map([["src/Counter.tsx", FILE]]);

const block = (path: string, search: string, replace: string) =>
  `${path}\n<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;

describe("parsing", () => {
  it("extracts a plain block", () => {
    const [b] = parseEditBlocks(block("src/Counter.tsx", "const a = 1;", "const a = 2;"));
    assert.equal(b.path, "src/Counter.tsx");
    assert.equal(b.search, "const a = 1;");
    assert.equal(b.replace, "const a = 2;");
  });

  it("tolerates code fences and prose around blocks", () => {
    const noisy = `Here is the fix:\n\n\`\`\`tsx\n${block("src/Counter.tsx", "a", "b")}\n\`\`\`\nDone.`;
    assert.equal(parseEditBlocks(noisy).length, 1);
  });

  it("returns [] for a response with no blocks — the whole-file signal, not an error", () => {
    assert.deepEqual(parseEditBlocks('{"files":[{"path":"a.tsx","content":"x"}]}'), []);
  });

  it("a malformed block does not swallow its well-formed neighbour", () => {
    const mixed = `${block("src/A.tsx", "x", "y")}\n\ngarbage <<<<<<< SEARCH no end`;
    assert.equal(parseEditBlocks(mixed).length, 1);
  });
});

describe("application — exactly-once or not at all", () => {
  it("applies a unique anchored edit", () => {
    const r = applyEditBlocks(
      [{ path: "src/Counter.tsx", search: "setCount(count + 1)", replace: "setCount((c) => c + 1)" }],
      files,
    );
    assert.equal(r.ok, true);
    assert.match(r.files.get("src/Counter.tsx")!, /setCount\(\(c\) => c \+ 1\)/);
  });

  it("rejects a SEARCH the file does not contain — the model hallucinated", () => {
    const r = applyEditBlocks(
      [{ path: "src/Counter.tsx", search: "const total = 99;", replace: "x" }],
      files,
    );
    assert.equal(r.ok, false);
    assert.match(r.failures[0], /not found/);
  });

  it("rejects an ambiguous SEARCH rather than guessing which occurrence", () => {
    const dup = new Map([["a.ts", "let x = 1;\nlet x = 1;\n"]]);
    const r = applyEditBlocks([{ path: "a.ts", search: "let x = 1;", replace: "let x = 2;" }], dup);
    assert.equal(r.ok, false);
    assert.match(r.failures[0], /2 times/);
  });

  it("rejects an empty SEARCH — never a blind replacement", () => {
    const r = applyEditBlocks([{ path: "src/Counter.tsx", search: "  \n ", replace: "x" }], files);
    assert.equal(r.ok, false);
    assert.match(r.failures[0], /empty SEARCH/);
  });

  it("one failed block rejects the WHOLE batch — no half-applied repairs", () => {
    const r = applyEditBlocks(
      [
        { path: "src/Counter.tsx", search: "useState(0)", replace: "useState(1)" },
        { path: "src/Counter.tsx", search: "not in the file", replace: "x" },
      ],
      files,
    );
    assert.equal(r.ok, false);
    assert.equal(r.files.size, 0, "the good edit must not survive its batch");
  });

  it("tolerates trailing-whitespace drift, which is noise, not signal", () => {
    const crlfish = new Map([["a.ts", "const a = 1;   \nconst b = 2;\n"]]);
    const r = applyEditBlocks([{ path: "a.ts", search: "const a = 1;", replace: "const a = 9;" }], crlfish);
    assert.equal(r.ok, true);
    assert.match(r.files.get("a.ts")!, /const a = 9;/);
  });

  it("composes multiple blocks against the same file in order", () => {
    const r = applyEditBlocks(
      [
        { path: "src/Counter.tsx", search: "useState(0)", replace: "useState(10)" },
        { path: "src/Counter.tsx", search: "{count}</button>", replace: "{count}!</button>" },
      ],
      files,
    );
    assert.equal(r.ok, true);
    const out = r.files.get("src/Counter.tsx")!;
    assert.match(out, /useState\(10\)/);
    assert.match(out, /!<\/button>/);
  });

  it("refuses a path outside the project rather than creating it", () => {
    const r = applyEditBlocks([{ path: "src/New.tsx", search: "a", replace: "b" }], files);
    assert.equal(r.ok, false);
    assert.match(r.failures[0], /not in the project/);
  });
});
