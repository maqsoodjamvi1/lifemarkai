import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateComponentFromFigmaNode,
  tailwindClassesForNode,
  tailwindClassesForText,
  toPascalCase,
} from "./generate-component";
import type { FigmaNode } from "./describe-tree";

test("toPascalCase converts a Figma layer name into a valid component name", () => {
  assert.equal(toPascalCase("hero section"), "HeroSection");
  assert.equal(toPascalCase("Card / Pricing"), "CardPricing");
  assert.equal(toPascalCase("  cta-button_2  "), "CtaButton2");
  assert.equal(toPascalCase(""), "Frame");
});

test("toPascalCase falls back when the cleaned name doesn't start with a letter", () => {
  // Starts with a digit after cleaning — not a legal JS identifier start.
  assert.match(toPascalCase("404"), /^Frame/);
});

test("tailwindClassesForNode maps auto-layout to real flex classes", () => {
  const node: FigmaNode = {
    id: "1", name: "Row", type: "FRAME",
    layoutMode: "HORIZONTAL", itemSpacing: 12,
    paddingTop: 8, paddingRight: 8, paddingBottom: 8, paddingLeft: 8,
  };
  const classes = tailwindClassesForNode(node);
  assert.ok(classes.includes("flex"));
  assert.ok(classes.includes("flex-row"));
  assert.ok(classes.includes("gap-[12px]"));
  assert.ok(classes.includes("p-[8px]"));
});

test("tailwindClassesForNode uses per-side padding when sides differ", () => {
  const node: FigmaNode = {
    id: "1", name: "Row", type: "FRAME",
    layoutMode: "VERTICAL", paddingTop: 4, paddingRight: 16, paddingBottom: 4, paddingLeft: 16,
  };
  const classes = tailwindClassesForNode(node);
  assert.ok(classes.includes("pt-[4px]"));
  assert.ok(classes.includes("pr-[16px]"));
  assert.ok(classes.includes("pb-[4px]"));
  assert.ok(classes.includes("pl-[16px]"));
  assert.ok(!classes.some((c) => c.startsWith("p-[")));
});

test("tailwindClassesForNode carries the real fill hex, not a placeholder", () => {
  const node: FigmaNode = {
    id: "1", name: "Card", type: "FRAME",
    fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0, a: 1 } }],
    cornerRadius: 12,
  };
  const classes = tailwindClassesForNode(node);
  assert.ok(classes.includes("bg-[#ff0000]"));
  assert.ok(classes.includes("rounded-[12px]"));
});

test("tailwindClassesForText carries real typography and color", () => {
  const node: FigmaNode = {
    id: "1", name: "Heading", type: "TEXT", characters: "Hello",
    style: { fontSize: 32, fontWeight: 700, textAlignHorizontal: "CENTER" },
    fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
  };
  const classes = tailwindClassesForText(node);
  assert.ok(classes.includes("text-[32px]"));
  assert.ok(classes.includes("font-[700]"));
  assert.ok(classes.includes("text-center"));
  assert.ok(classes.includes("text-[#000000]"));
});

test("generateComponentFromFigmaNode renders a TEXT node's real copy verbatim", () => {
  const node: FigmaNode = {
    id: "1", name: "Button", type: "FRAME", layoutMode: "HORIZONTAL",
    children: [{ id: "2", name: "Label", type: "TEXT", characters: "Get started" }],
  };
  const { code, componentName } = generateComponentFromFigmaNode(node);
  assert.equal(componentName, "Button");
  assert.ok(code.includes("Get started"));
  assert.ok(code.includes("export function Button()"));
});

test("generateComponentFromFigmaNode preserves real nesting depth, not a flattened list", () => {
  const node: FigmaNode = {
    id: "1", name: "Page", type: "FRAME", layoutMode: "VERTICAL",
    children: [
      {
        id: "2", name: "Header", type: "FRAME", layoutMode: "HORIZONTAL",
        children: [{ id: "3", name: "Logo", type: "TEXT", characters: "Acme" }],
      },
    ],
  };
  const { code } = generateComponentFromFigmaNode(node);
  // The Header <div> must appear BEFORE the Logo <p>, and the Logo's line
  // must be indented deeper than the Header's — real nesting, not siblings.
  const headerLine = code.split("\n").findIndex((l) => l.includes("flex-row"));
  const logoLine = code.split("\n").findIndex((l) => l.includes("Acme"));
  assert.ok(headerLine !== -1 && logoLine !== -1 && headerLine < logoLine);
  const lines = code.split("\n");
  const headerIndent = lines[headerLine].match(/^\s*/)?.[0].length ?? 0;
  const logoIndent = lines[logoLine].match(/^\s*/)?.[0].length ?? 0;
  assert.ok(logoIndent > headerIndent);
});

test("generateComponentFromFigmaNode escapes characters that would break a template literal", () => {
  const node: FigmaNode = {
    id: "1", name: "Quote", type: "TEXT", characters: "It`s a \\test\\ with ${weird} chars",
  };
  const { code } = generateComponentFromFigmaNode(node);
  // Must not contain an unescaped backtick that would terminate the template literal early.
  assert.ok(!/[^\\]`\)/.test(code) || code.includes("\\`"));
  assert.ok(code.includes("\\`"));
  assert.ok(code.includes("\\${"));
});

test("generateComponentFromFigmaNode renders a leaf shape as an empty styled box, never fabricated content", () => {
  const node: FigmaNode = {
    id: "1", name: "Divider", type: "RECTANGLE",
    fills: [{ type: "SOLID", visible: true, color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }],
  };
  const { code } = generateComponentFromFigmaNode(node);
  assert.ok(code.includes("<div className=\"bg-[#e6e6e6]\" />"));
});

test("generateComponentFromFigmaNode pins width only on the root, not on auto-layout children", () => {
  const node: FigmaNode = {
    id: "1", name: "Page", type: "FRAME", layoutMode: "VERTICAL",
    absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
    children: [
      { id: "2", name: "Child", type: "FRAME", layoutMode: "HORIZONTAL", absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 80 } },
    ],
  };
  const { code } = generateComponentFromFigmaNode(node);
  assert.ok(code.includes("w-[1440px]"));
  assert.ok(!code.includes("w-[400px]"));
});
