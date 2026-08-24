/**
 * These tests run the REAL wasm runtime + grammars from node_modules —
 * the same binaries copied into public/ts-wasm/ — so a green run here is
 * the proof that the web-tree-sitter runtime and the grammar ABI versions
 * are compatible before anything ships to a browser.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  configureEngine,
  engineAvailable,
  extractOutline,
  langForPath,
  syntaxExpandRange,
  syntaxShrinkRange,
} from "./tree-sitter-engine.ts";

// npm test runs from the repo root; web-tree-sitter's exports map hides
// package.json from require.resolve, so resolve node_modules directly.
function wasmBytes(spec: string, file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), "node_modules", spec, file)));
}

configureEngine({
  runtimeWasm: wasmBytes("web-tree-sitter", "web-tree-sitter.wasm"),
  grammars: {
    tsx: wasmBytes("@vscode/tree-sitter-wasm", "wasm/tree-sitter-tsx.wasm"),
    typescript: wasmBytes("@vscode/tree-sitter-wasm", "wasm/tree-sitter-typescript.wasm"),
  },
});

const SAMPLE = `import { useState } from "react";

export const API_URL = "https://example.com";

interface CartItem { id: string; qty: number }

type Money = { cents: number };

function formatMoney(m: Money): string {
  return (m.cents / 100).toFixed(2);
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  return { items, setItems };
}

export class CartStore {
  items: CartItem[] = [];
  add(item: CartItem) { this.items.push(item); }
  clear() { this.items = []; }
}

export default function App() {
  const { items } = useCart();
  return <div className="app">{items.length}</div>;
}
`;

test("runtime + tsx grammar load (ABI compatibility gate)", async () => {
  assert.equal(await engineAvailable(), true);
});

test("langForPath maps extensions", () => {
  assert.equal(langForPath("src/App.tsx"), "tsx");
  assert.equal(langForPath("src/lib/util.ts"), "typescript");
  assert.equal(langForPath("legacy.jsx"), "tsx");
  assert.equal(langForPath("styles.css"), "css");
  assert.equal(langForPath("README.md"), null);
});

test("outline: components, hooks, classes with methods, types", async () => {
  const outline = await extractOutline("src/App.tsx", SAMPLE);
  assert.ok(outline, "outline should parse");
  const byName = new Map(outline!.map((e) => [`${e.name}#${e.depth}`, e]));

  assert.equal(byName.get("API_URL#0")?.kind, "const");
  assert.equal(byName.get("API_URL#0")?.exported, true);
  assert.equal(byName.get("CartItem#0")?.kind, "interface");
  assert.equal(byName.get("Money#0")?.kind, "type");
  assert.equal(byName.get("formatMoney#0")?.kind, "function");
  assert.equal(byName.get("formatMoney#0")?.exported, false);
  assert.equal(byName.get("useCart#0")?.kind, "hook");
  assert.equal(byName.get("CartStore#0")?.kind, "class");
  assert.equal(byName.get("add#1")?.kind, "method");
  assert.equal(byName.get("clear#1")?.kind, "method");
  assert.equal(byName.get("App#0")?.kind, "component");

  const app = byName.get("App#0")!;
  assert.ok(app.endLine > app.line, "component spans multiple lines");
});

test("outline: memo/forwardRef-wrapped arrow components", async () => {
  const src = `import { memo, forwardRef } from "react";
export const Card = memo(() => <div />);
export const Input = forwardRef((props, ref) => <input ref={ref} />);
const helper = (x) => x * 2;
`;
  const outline = await extractOutline("src/Card.tsx", src);
  const kinds = new Map(outline!.map((e) => [e.name, e.kind]));
  assert.equal(kinds.get("Card"), "component");
  assert.equal(kinds.get("Input"), "component");
  assert.equal(kinds.get("helper"), "function");
});

test("expand grows selection through syntax levels; shrink inverts", async () => {
  const src = SAMPLE;
  const inner = src.indexOf("items.length");
  // caret-sized selection inside the JSX expression
  const step1 = await syntaxExpandRange("src/App.tsx", src, {
    start: inner,
    end: inner + "items".length,
  });
  assert.ok(step1, "expand should return a range");
  assert.ok(step1!.start <= inner && step1!.end >= inner + "items.length".length,
    "expanded range covers the member expression");

  const step2 = await syntaxExpandRange("src/App.tsx", src, step1!);
  assert.ok(step2, "second expand");
  assert.ok(step2!.end - step2!.start > step1!.end - step1!.start, "monotonically grows");

  const shrunk = await syntaxShrinkRange("src/App.tsx", src, step2!);
  assert.ok(shrunk, "shrink should return a range");
  assert.ok(
    shrunk!.start >= step2!.start && shrunk!.end <= step2!.end &&
    shrunk!.end - shrunk!.start < step2!.end - step2!.start,
    "shrink returns strict sub-range",
  );
});

test("whole-file expand terminates with null at the top", async () => {
  const all = { start: 0, end: SAMPLE.length };
  const r = await syntaxExpandRange("src/App.tsx", SAMPLE, all);
  // program node == whole file (possibly minus trailing newline) → null or full range
  if (r) assert.ok(r.end - r.start >= SAMPLE.length - 1);
});

test("unparseable path and non-code files return null", async () => {
  assert.equal(await extractOutline("notes.md", "# hi"), null);
  assert.equal(await syntaxExpandRange("notes.md", "# hi", { start: 0, end: 2 }), null);
});
