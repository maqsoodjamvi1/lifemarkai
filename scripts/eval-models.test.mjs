/**
 * Fixture tests for the benchmark's own checkers.
 *
 *   node --test scripts/eval-models.test.mjs
 *
 * A benchmark is only worth its checker. Two real bugs were caught here before
 * any model was judged: (1) the export regex rejected `const X = () => {}` plus
 * a bare `export default X`, failing three models that had produced correct
 * components; (2) missing React JSX lib types surfaced as TS7026 and scored
 * every JSX-emitting model as a strict-type failure. Keep this green.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tsxParseError, strictTypeErrors, extractCode } from "./eval-models.mjs";

test("accepts valid TSX", async () => {
  assert.equal(await tsxParseError(`export function A(){ return <div className="x">hi</div>; }`), null);
});

test("rejects unterminated string", async () => {
  assert.notEqual(await tsxParseError(`export const a = "oops;`), null);
});

test("rejects unbalanced braces", async () => {
  assert.notEqual(await tsxParseError(`export function A(){ return <div>hi</div>;`), null);
});

test("JSX without react types is NOT a strict failure", async () => {
  assert.deepEqual(await strictTypeErrors(`export function A(){ return <div>hi</div>; }`), []);
});

test("catches implicit any under strict", async () => {
  assert.ok((await strictTypeErrors(`export function add(a, b) { return a + b; }`)).length > 0);
});

test("catches a type mismatch", async () => {
  assert.ok((await strictTypeErrors(`export const x: number = "hello";`)).length > 0);
});

test("passes a correct generic", async () => {
  const code = `export function groupBy<T, K extends string>(items: T[], key: (i: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const i of items) { const k = key(i); (out[k] ||= []).push(i); }
  return out;
}`;
  assert.deepEqual(await strictTypeErrors(code), []);
});

test("extractCode pulls the fenced block, not the prose", () => {
  const out = extractCode("Sure! Here you go:\n```tsx\nconst a = 1;\n```\nHope that helps.");
  assert.equal(out.trim(), "const a = 1;");
});

test("extractCode falls back to raw text when unfenced", () => {
  assert.equal(extractCode("const a = 1;").trim(), "const a = 1;");
});
