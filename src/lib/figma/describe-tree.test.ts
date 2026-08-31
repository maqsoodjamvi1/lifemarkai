import { test } from "node:test";
import assert from "node:assert/strict";
import { colorToHex, firstVisibleFillHex, describeFigmaTree, type FigmaNode } from "./describe-tree";

test("colorToHex converts opaque SOLID fill to a 6-digit hex", () => {
  assert.equal(colorToHex({ r: 1, g: 0, b: 0, a: 1 }), "#ff0000");
  assert.equal(colorToHex({ r: 0, g: 0, b: 0, a: 1 }), "#000000");
  assert.equal(colorToHex({ r: 1, g: 1, b: 1, a: 1 }), "#ffffff");
});

test("colorToHex appends an 8th alpha channel byte when translucent", () => {
  // a = 0.5 -> round(0.5*255) = 128 = 0x80
  assert.equal(colorToHex({ r: 1, g: 1, b: 1, a: 0.5 }), "#ffffff80");
});

test("firstVisibleFillHex picks the first visible SOLID fill and ignores hidden/gradient ones", () => {
  const hex = firstVisibleFillHex([
    { type: "SOLID", visible: false, color: { r: 0, g: 0, b: 0, a: 1 } },
    { type: "GRADIENT_LINEAR" },
    { type: "SOLID", color: { r: 0, g: 0.5, b: 1, a: 1 } },
  ]);
  assert.equal(hex, "#0080ff");
});

test("firstVisibleFillHex returns null when there are no fills or none are visible SOLID", () => {
  assert.equal(firstVisibleFillHex(undefined), null);
  assert.equal(firstVisibleFillHex([{ type: "SOLID", visible: false, color: { r: 0, g: 0, b: 0, a: 1 } }]), null);
});

test("describeFigmaTree includes the actual TEXT node copy verbatim — the headline fix", () => {
  const node: FigmaNode = {
    id: "1:1",
    name: "Headline",
    type: "TEXT",
    characters: "Welcome to Acme Inc.",
  };
  const out = describeFigmaTree(node);
  assert.match(out, /text:"Welcome to Acme Inc\."/);
});

test("describeFigmaTree maps auto-layout to a flex direction with gap and padding", () => {
  const node: FigmaNode = {
    id: "1:2",
    name: "Row",
    type: "FRAME",
    layoutMode: "HORIZONTAL",
    itemSpacing: 12,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 4,
  };
  const out = describeFigmaTree(node);
  assert.match(out, /layout:flex-row/);
  assert.match(out, /gap:12px/);
  assert.match(out, /padding:4\/8\/4\/8px/);
});

test("describeFigmaTree reports fill color, corner radius, and font attributes", () => {
  const node: FigmaNode = {
    id: "1:3",
    name: "Card",
    type: "RECTANGLE",
    fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    cornerRadius: 12,
    style: { fontFamily: "Inter", fontSize: 16, fontWeight: 600, textAlignHorizontal: "CENTER" },
  };
  const out = describeFigmaTree(node);
  assert.match(out, /fill:#000000/);
  assert.match(out, /radius:12px/);
  assert.match(out, /font:Inter 16px 600/);
  assert.match(out, /align:center/);
});

test("describeFigmaTree recurses into children up to depth 4 and truncates beyond it", () => {
  let leaf: FigmaNode = { id: "deep", name: "Deep", type: "TEXT", characters: "bottom" };
  for (let i = 0; i < 6; i++) {
    leaf = { id: `n${i}`, name: `Level${i}`, type: "FRAME", children: [leaf] };
  }
  const out = describeFigmaTree(leaf);
  // The tree is 7 levels deep (0..6); recursion stops once depth reaches 4,
  // so the innermost "bottom" text should NOT appear in the output.
  assert.ok(!out.includes("bottom"));
});
