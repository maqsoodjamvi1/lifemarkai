/**
 * Turns a Figma REST API node tree into a structured, plain-text
 * description for an LLM prompt — real fill/stroke colors, real typography,
 * real auto-layout → flex mapping, and (previously never extracted at all)
 * the actual copy on every TEXT node.
 *
 * Extracted out of routes/api/figma.ts so this logic — the part of the
 * Figma-import feature that actually determines fidelity — has direct unit
 * test coverage instead of only being exercised through a full HTTP route.
 */

export interface FigmaColor { r: number; g: number; b: number; a: number }
export interface FigmaPaint { type: string; visible?: boolean; opacity?: number; color?: FigmaColor }
export interface FigmaTextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  textAlignHorizontal?: string;
  lineHeightPx?: number;
  letterSpacing?: number;
}
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  backgroundColor?: FigmaColor;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  opacity?: number;
  /** Auto-layout — the direct Figma-side analog of a CSS flex container. */
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  /** TEXT nodes only — the actual copy on the design. Previously never
   * read, so a generated component reproduced the LAYOUT of a design but
   * never its actual words — every heading and button label had to be
   * invented by the AI instead of taken from the file. */
  characters?: string;
  style?: FigmaTextStyle;
}

/** Figma color channels are 0–1 floats; CSS wants 0–255 hex. */
export function colorToHex(c: FigmaColor): string {
  const ch = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  const hex = `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
  return c.a < 1 ? `${hex}${ch(c.a)}` : hex;
}

export function firstVisibleFillHex(fills?: FigmaPaint[]): string | null {
  const fill = fills?.find((f) => f.visible !== false && f.type === "SOLID" && f.color);
  return fill?.color ? colorToHex(fill.color) : null;
}

/**
 * Renders one node (and its children, depth-limited to 4) as a structured,
 * plain-text description an LLM can act on directly — real colors, real
 * copy, real auto-layout → flex mapping, not just a type/name/size outline.
 */
export function describeFigmaTree(node: FigmaNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  const box = node.absoluteBoundingBox;
  const size = box ? ` (${Math.round(box.width)}×${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)})` : "";

  const attrs: string[] = [];
  const fillHex = firstVisibleFillHex(node.fills) ?? (node.backgroundColor ? colorToHex(node.backgroundColor) : null);
  if (fillHex) attrs.push(`fill:${fillHex}`);
  const strokeHex = firstVisibleFillHex(node.strokes);
  if (strokeHex) attrs.push(`stroke:${strokeHex}${node.strokeWeight ? `/${node.strokeWeight}px` : ""}`);
  if (node.cornerRadius) attrs.push(`radius:${node.cornerRadius}px`);
  if (typeof node.opacity === "number" && node.opacity < 1) attrs.push(`opacity:${node.opacity}`);
  if (node.layoutMode && node.layoutMode !== "NONE") {
    attrs.push(`layout:${node.layoutMode === "HORIZONTAL" ? "flex-row" : "flex-col"}`);
    if (node.itemSpacing) attrs.push(`gap:${node.itemSpacing}px`);
    const pad = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
    if (pad.some((p) => p)) attrs.push(`padding:${pad.map((p) => p ?? 0).join("/")}px`);
  }
  if (node.style) {
    const s = node.style;
    const font = [s.fontFamily, s.fontSize ? `${s.fontSize}px` : null, s.fontWeight ?? null].filter(Boolean).join(" ");
    if (font) attrs.push(`font:${font}`);
    if (s.textAlignHorizontal) attrs.push(`align:${s.textAlignHorizontal.toLowerCase()}`);
  }

  const attrStr = attrs.length > 0 ? ` [${attrs.join(", ")}]` : "";
  const text = node.type === "TEXT" && node.characters ? ` text:"${node.characters.slice(0, 200)}"` : "";
  let out = `${indent}${node.type}: "${node.name}"${size}${attrStr}${text}\n`;
  if (node.children && depth < 4) {
    for (const child of node.children.slice(0, 20)) out += describeFigmaTree(child, depth + 1);
  }
  return out;
}
