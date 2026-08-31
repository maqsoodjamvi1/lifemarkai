/**
 * Deterministic Figma node tree -> React/Tailwind JSX generator.
 *
 * Before this, Figma import (src/routes/api/figma.ts, src/lib/figma/
 * describe-tree.ts) only ever produced a TEXT description of the design and
 * handed it to the AI to re-imagine as code — real colors/copy/auto-layout
 * values were in the prompt, but the actual nesting, box structure, and
 * pixel-accurate spacing were whatever the model chose to reconstruct from
 * prose. That's an approximation step, not a translation — the same gap
 * flagged in the Lovable feature-parity audit as "Figma structural codegen":
 * Lovable's import walks the layer tree directly into markup; ours asked a
 * model to redraw it from a written description of the tree.
 *
 * This module walks the same FigmaNode tree describe-tree.ts already parses
 * and emits real JSX + Tailwind classes directly — auto-layout becomes an
 * actual flex container with the actual gap/padding, every fill/stroke
 * becomes an actual arbitrary-value Tailwind class carrying the exact hex,
 * and every TEXT node's `characters` becomes literal JSX text, not a
 * paraphrase. The output is a real starting component, structurally
 * faithful to the design by construction — the AI is then used for what
 * it's actually good at (turning static boxes into working, stateful,
 * interactive React), not for guessing box positions from prose.
 */
import { colorToHex, firstVisibleFillHex, type FigmaNode } from "./describe-tree";

const MAX_DEPTH = 8;
const MAX_CHILDREN = 40;

/** Escapes a string for safe interpolation inside a JSX `{`...`}` template literal. */
function escapeTemplateLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/** Converts a Figma node name into a valid, readable PascalCase component/identifier fragment. */
export function toPascalCase(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  const parts = cleaned.length > 0 ? cleaned.split(" ") : ["Frame"];
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return /^[A-Za-z]/.test(pascal) ? pascal : `Frame${pascal}`;
}

/**
 * Tailwind (mostly arbitrary-value) classes that reproduce this node's own
 * box styling — fill, stroke, corner radius, opacity, and (for an
 * auto-layout frame) the flex direction/gap/padding that IS the layout.
 * Sizing is handled separately by the caller: a fixed w/h only makes sense
 * for nodes that aren't flex children sizing off their own content.
 */
export function tailwindClassesForNode(node: FigmaNode): string[] {
  const classes: string[] = [];

  const fillHex = firstVisibleFillHex(node.fills) ?? (node.backgroundColor ? colorToHex(node.backgroundColor) : null);
  if (fillHex && node.type !== "TEXT") classes.push(`bg-[${fillHex}]`);

  const strokeHex = firstVisibleFillHex(node.strokes);
  if (strokeHex) {
    classes.push(`border-[${strokeHex}]`);
    classes.push(node.strokeWeight && node.strokeWeight !== 1 ? `border-[${node.strokeWeight}px]` : "border");
  }

  if (node.cornerRadius) classes.push(`rounded-[${node.cornerRadius}px]`);
  if (typeof node.opacity === "number" && node.opacity < 1) classes.push(`opacity-[${node.opacity}]`);

  if (node.layoutMode && node.layoutMode !== "NONE") {
    classes.push("flex");
    classes.push(node.layoutMode === "HORIZONTAL" ? "flex-row" : "flex-col");
    if (node.itemSpacing) classes.push(`gap-[${node.itemSpacing}px]`);

    const pt = node.paddingTop ?? 0, pr = node.paddingRight ?? 0, pb = node.paddingBottom ?? 0, pl = node.paddingLeft ?? 0;
    if (pt && pt === pb && pl === pr && pt === pl) {
      classes.push(`p-[${pt}px]`);
    } else {
      if (pt) classes.push(`pt-[${pt}px]`);
      if (pr) classes.push(`pr-[${pr}px]`);
      if (pb) classes.push(`pb-[${pb}px]`);
      if (pl) classes.push(`pl-[${pl}px]`);
    }
  }

  return classes;
}

/** Tailwind classes for a TEXT node's own typography (font, weight, alignment, color). */
export function tailwindClassesForText(node: FigmaNode): string[] {
  const classes: string[] = [];
  const s = node.style;
  if (s?.fontSize) classes.push(`text-[${Math.round(s.fontSize)}px]`);
  if (s?.fontWeight) classes.push(`font-[${s.fontWeight}]`);
  if (s?.textAlignHorizontal) {
    const align = s.textAlignHorizontal.toLowerCase();
    if (align === "left" || align === "center" || align === "right" || align === "justify") classes.push(`text-${align}`);
  }
  const colorHex = firstVisibleFillHex(node.fills);
  if (colorHex) classes.push(`text-[${colorHex}]`);
  return classes;
}

function indentLines(s: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return s.split("\n").map((l) => (l.length > 0 ? pad + l : l)).join("\n");
}

/**
 * Recursively renders one node as JSX. A node with auto-layout sizes its
 * children by flex, so no fixed width/height is emitted for THOSE children —
 * only the outermost node gets an explicit size, matching how the design
 * actually resizes (auto-layout frames grow/shrink with content, not with a
 * pinned pixel box).
 */
function renderNode(node: FigmaNode, depth: number, isRoot: boolean): string {
  if (depth > MAX_DEPTH) return "";

  if (node.type === "TEXT") {
    const classes = tailwindClassesForText(node);
    const classAttr = classes.length > 0 ? ` className="${classes.join(" ")}"` : "";
    const content = node.characters ? `{\`${escapeTemplateLiteral(node.characters)}\`}` : `{/* ${node.name} */}`;
    return `<p${classAttr}>${content}</p>`;
  }

  const classes = tailwindClassesForNode(node);
  if (isRoot && node.absoluteBoundingBox) {
    classes.push(`w-[${Math.round(node.absoluteBoundingBox.width)}px]`);
    // Height is deliberately not pinned even at the root: a generated page
    // needs to grow with real content (and viewport), not clip at the
    // design canvas's fixed export height.
  }
  const classAttr = classes.length > 0 ? ` className="${classes.join(" ")}"` : "";

  const children = (node.children ?? []).slice(0, MAX_CHILDREN);
  if (children.length === 0) {
    // A leaf shape (rectangle, ellipse, vector, or an image fill we can't
    // fetch pixels for from this endpoint) — render as an empty styled box
    // rather than fabricating content that isn't in the design.
    return `<div${classAttr} />`;
  }

  const inner = children
    .map((child) => renderNode(child, depth + 1, false))
    .filter((s) => s.length > 0)
    .map((s) => indentLines(s, 2))
    .join("\n");

  return `<div${classAttr}>\n${inner}\n</div>`;
}

/**
 * Generates a complete, standalone .tsx file for one top-level Figma frame —
 * a real component with real structure, ready to be written straight into
 * the project and then iterated on (functionality, state, data wiring)
 * rather than drawn from scratch.
 */
export function generateComponentFromFigmaNode(node: FigmaNode): { componentName: string; code: string } {
  const componentName = toPascalCase(node.name || "Frame");
  const body = renderNode(node, 0, true);
  const code = `export function ${componentName}() {
  return (
${indentLines(body, 4)}
  );
}
`;
  return { componentName, code };
}
