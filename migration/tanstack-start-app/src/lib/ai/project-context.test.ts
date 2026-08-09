import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectContext } from "./system-prompts.ts";

test("buildProjectContext includes every complete file when the project fits", () => {
  const firstTail = "FIRST_FILE_TAIL_MUST_SURVIVE";
  const secondTail = "SECOND_FILE_TAIL_MUST_SURVIVE";
  const files = [
    { path: "src/App.tsx", content: `export default function App() {}\n${"a".repeat(9_000)}\n${firstTail}` },
    { path: "src/styles.css", content: `body {}\n${"b".repeat(4_000)}\n${secondTail}` },
  ];

  const context = buildProjectContext(files, 20_000, "change the footer");

  assert.match(context, /File Contents \(complete project\)/);
  assert.ok(context.includes(firstTail));
  assert.ok(context.includes(secondTail));
  assert.doesNotMatch(context, /truncated/);
});

test("buildProjectContext keeps budgeted selection for oversized projects", () => {
  const files = Array.from({ length: 10 }, (_, index) => ({
    path: `src/components/Component${index}.tsx`,
    content: `export const Component${index} = () => <div>checkout panel ${"x".repeat(4_000)}</div>`,
  }));

  const context = buildProjectContext(files, 8_000, "fix the checkout panel");

  assert.match(context, /BM25-ranked by query relevance/);
  assert.match(context, /omitted from content view due to token budget/);
});
