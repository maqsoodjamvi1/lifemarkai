import assert from "node:assert/strict";
import test from "node:test";
import { collectExports, findContractErrors, findMissingExports, findMissingModules } from "./export-contract.ts";

// Regression: `export const A = [], B = [];` only registered `A` — every
// name after the first in a comma-separated declaration list was silently
// dropped. That produced a false positive in findMissingExports for a
// genuinely exported name, which (per this module's own stated design) is
// not cosmetic: it gets handed to the repair/healing pass as an instruction
// to fix a "gap" that doesn't exist — see heal-preview-contract.test.ts for
// what that cascades into.
test("collectExports captures every name in a comma-separated export const list", () => {
  const names = collectExports("export const MOCK_SERVICES = [], MOCK_PARTNERS = [];").names;
  assert.ok(names.has("MOCK_SERVICES"));
  assert.ok(names.has("MOCK_PARTNERS"));
});

test("collectExports handles commas inside a declarator's own initializer", () => {
  const names = collectExports(
    "export const A = 1, B = fn(1, 2), C = [1, 2, 3], D = { x: 1, y: 2 };",
  ).names;
  assert.deepEqual([...names].sort(), ["A", "B", "C", "D"]);
});

test("collectExports handles a multi-line comma-separated declaration", () => {
  const names = collectExports("export const arr = [\n  1,\n  2,\n], next = 9;").names;
  assert.deepEqual([...names].sort(), ["arr", "next"]);
});

test("findMissingExports does not false-positive on a comma-declared export", () => {
  const missing = findMissingExports([
    {
      path: "src/data/mock.ts",
      content: "export const MOCK_SERVICES = [], MOCK_PARTNERS = [];",
    },
    {
      path: "src/components/home/PartnersSection.tsx",
      content: 'import { MOCK_PARTNERS } from "../../data/mock";\nexport function PartnersSection(){ return null; }',
    },
  ]);
  assert.deepEqual(missing, []);
});

test("findMissingExports still reports a genuinely missing export", () => {
  const missing = findMissingExports([
    {
      path: "src/data/mock.ts",
      content: "export const MOCK_SERVICES = [];",
    },
    {
      path: "src/components/home/PartnersSection.tsx",
      content: 'import { MOCK_PARTNERS } from "../../data/mock";\nexport function PartnersSection(){ return null; }',
    },
  ]);
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.name, "MOCK_PARTNERS");
});

// Speed: self-verify.ts's per-repair-round loop calls buildFallbackHtml
// (which internally runs findMissingModules/findMissingExports via
// healPreviewContractGaps) and then findContractErrors (the SAME two
// functions again) on the same unmodified files — a guaranteed 2x scan.
// findMissingModules/findMissingExports are now memoized by content
// signature; this pins that calling them twice with identical input doesn't
// change the result, and that genuinely different input still gets its own
// (different) answer rather than a stale cached one.
test("findMissingModules/findMissingExports memoization returns consistent results across repeated and varied calls", () => {
  const filesA = [
    {
      path: "src/App.tsx",
      content: 'import { Missing } from "./Missing";\nexport default function App(){ return null; }',
    },
  ];
  const first = findMissingModules(filesA);
  const second = findMissingModules(filesA);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);

  const filesB = [
    {
      path: "src/App.tsx",
      content: 'import { OtherMissing } from "./OtherMissing";\nexport default function App(){ return null; }',
    },
  ];
  const third = findMissingModules(filesB);
  assert.equal(third.length, 1);
  assert.notEqual(third[0]?.expected, first[0]?.expected);

  // findContractErrors composes both memoized functions — must still see
  // the change in filesB rather than reusing filesA's cached answer.
  const errorsA = findContractErrors(filesA);
  const errorsB = findContractErrors(filesB);
  assert.notDeepEqual(errorsA, errorsB);
});
