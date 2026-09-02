import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyArbitraryColorToken,
  applyDimensionToken,
  applyFontFamilyToken,
  applySpacingToken,
  applyVisualEdit,
  ensureResizableDisplay,
  normalizeHex,
  resolveDisplayHex,
} from "./apply-visual-edit";
import type { ProjectFile } from "../../types/database.ts";

// ── normalizeHex ─────────────────────────────────────────────────────────

test("normalizeHex adds a leading # when missing", () => {
  assert.equal(normalizeHex("3b82f6"), "#3b82f6");
});

test("normalizeHex is idempotent when a # is already present", () => {
  assert.equal(normalizeHex("#3b82f6"), "#3b82f6");
});

// ── applyArbitraryColorToken ─────────────────────────────────────────────

test("applyArbitraryColorToken adds an arbitrary text-color utility", () => {
  assert.equal(applyArbitraryColorToken("font-bold", "text", "#ff0000"), "font-bold text-[#ff0000]");
});

test("applyArbitraryColorToken strips a named swatch of the same kind before adding the hex", () => {
  const result = applyArbitraryColorToken("text-red-500 font-bold", "text", "#00ff00");
  assert.equal(result, "font-bold text-[#00ff00]");
});

test("applyArbitraryColorToken replaces a prior arbitrary color instead of stacking it", () => {
  const result = applyArbitraryColorToken("text-[#111111]", "text", "#222222");
  assert.equal(result, "text-[#222222]");
});

test("applyArbitraryColorToken does not touch a named color of the other kind", () => {
  const result = applyArbitraryColorToken("bg-red-500", "text", "#00ff00");
  assert.equal(result, "bg-red-500 text-[#00ff00]");
});

test("applyArbitraryColorToken does not touch unrelated text-* utilities like size or alignment", () => {
  const result = applyArbitraryColorToken("text-lg text-center", "text", "#00ff00");
  assert.equal(result, "text-lg text-center text-[#00ff00]");
});

test("applyArbitraryColorToken strips the old color and adds nothing for an invalid hex", () => {
  const result = applyArbitraryColorToken("text-red-500", "text", "not-a-color");
  assert.equal(result, "");
});

test("applyArbitraryColorToken accepts 3-digit hex shorthand", () => {
  assert.equal(applyArbitraryColorToken("", "bg", "f00"), "bg-[#f00]");
});

// ── applyFontFamilyToken ─────────────────────────────────────────────────

test("applyFontFamilyToken adds a known font-family utility", () => {
  assert.equal(applyFontFamilyToken("text-lg", "font-serif"), "text-lg font-serif");
});

test("applyFontFamilyToken replaces a prior font-family utility", () => {
  assert.equal(applyFontFamilyToken("font-sans text-lg", "font-mono"), "text-lg font-mono");
});

test("applyFontFamilyToken leaves font-weight utilities alone", () => {
  assert.equal(applyFontFamilyToken("font-bold font-sans", "font-serif"), "font-bold font-serif");
});

test("applyFontFamilyToken only removes the family for an unrecognized value", () => {
  assert.equal(applyFontFamilyToken("font-sans text-lg", "font-comic-sans"), "text-lg");
});

// ── applyDimensionToken ───────────────────────────────────────────────────

test("applyDimensionToken adds an arbitrary width utility", () => {
  assert.equal(applyDimensionToken("p-4", "w", 240), "p-4 w-[240px]");
});

test("applyDimensionToken replaces a prior arbitrary width instead of stacking it", () => {
  assert.equal(applyDimensionToken("w-[100px]", "w", 150), "w-[150px]");
});

test("applyDimensionToken rounds fractional pixel values", () => {
  assert.equal(applyDimensionToken("", "h", 99.6), "h-[100px]");
});

test("applyDimensionToken clamps to a minimum of 1px", () => {
  assert.equal(applyDimensionToken("", "w", -5), "w-[1px]");
});

test("applyDimensionToken tracks width and height independently", () => {
  const withWidth = applyDimensionToken("", "w", 200);
  const withBoth = applyDimensionToken(withWidth, "h", 80);
  assert.equal(withBoth, "w-[200px] h-[80px]");
});

// ── applySpacingToken (existing helper, previously untested) ─────────────

test("applySpacingToken adds a per-side margin token", () => {
  assert.equal(applySpacingToken("p-2", "m", "t", "4"), "p-2 mt-4");
});

test("applySpacingToken replaces a prior token for the same side", () => {
  assert.equal(applySpacingToken("mt-2 p-2", "m", "t", "8"), "p-2 mt-8");
});

test("applySpacingToken with an empty side sets the all-sides token", () => {
  assert.equal(applySpacingToken("mt-2", "m", "", "4"), "mt-2 m-4");
});

// ── ensureResizableDisplay ────────────────────────────────────────────────

test("ensureResizableDisplay adds inline-block to a bare inline element", () => {
  assert.equal(ensureResizableDisplay("text-sm", "span"), "text-sm inline-block");
});

test("ensureResizableDisplay leaves a block-level tag untouched", () => {
  assert.equal(ensureResizableDisplay("text-sm", "div"), "text-sm");
});

test("ensureResizableDisplay does not double up when a display utility is already set", () => {
  assert.equal(ensureResizableDisplay("flex text-sm", "span"), "flex text-sm");
});

test("ensureResizableDisplay is case-insensitive on the tag name", () => {
  assert.equal(ensureResizableDisplay("", "SPAN"), "inline-block");
});

test("ensureResizableDisplay treats hidden as an existing display utility (no forced inline-block)", () => {
  assert.equal(ensureResizableDisplay("hidden", "a"), "hidden");
});

// ── resolveDisplayHex ─────────────────────────────────────────────────────

test("resolveDisplayHex reads an already-applied arbitrary hex", () => {
  assert.equal(resolveDisplayHex("text-[#3b82f6] font-bold", "text"), "#3b82f6");
});

test("resolveDisplayHex expands a 3-digit arbitrary hex", () => {
  assert.equal(resolveDisplayHex("bg-[#f00]", "bg"), "#ff0000");
});

test("resolveDisplayHex resolves a named swatch to its hex when no arbitrary value is set", () => {
  assert.equal(resolveDisplayHex("text-red-500 font-bold", "text"), "#ef4444");
});

test("resolveDisplayHex prefers the arbitrary hex over a named swatch if both are somehow present", () => {
  assert.equal(resolveDisplayHex("text-red-500 text-[#00ff00]", "text"), "#00ff00");
});

test("resolveDisplayHex returns null for a color with no single-hex equivalent (e.g. bg-transparent)", () => {
  assert.equal(resolveDisplayHex("bg-transparent", "bg"), null);
});

test("resolveDisplayHex returns null when no color utility of that kind is present", () => {
  assert.equal(resolveDisplayHex("font-bold text-lg", "text"), null);
});

test("resolveDisplayHex does not cross kinds — a bg color doesn't answer a text lookup", () => {
  assert.equal(resolveDisplayHex("bg-red-500", "text"), null);
});

function srcFile(path: string, content: string): ProjectFile {
  return {
    id: path,
    project_id: "p",
    path,
    content,
    language: "tsx",
    created_at: "",
    updated_at: "",
  } as ProjectFile;
}

test("applyVisualEdit injects className on a unique text node when classList is empty", () => {
  const files = [srcFile("src/App.tsx", `export default function App() {\n  return <h1>Hello</h1>;\n}`)];
  const result = applyVisualEdit(
    files,
    { tagName: "h1", textContent: "Hello", classList: [] },
    { classes: "text-lg font-bold" },
  );
  assert.ok(result);
  assert.match(result!.content, /<h1 className="text-lg font-bold">Hello<\/h1>/);
});

test("applyVisualEdit still replaces an exact className match first", () => {
  const files = [srcFile("src/App.tsx", `<p className="text-sm">Hi</p>`)];
  const result = applyVisualEdit(
    files,
    { tagName: "p", textContent: "Hi", classList: ["text-sm"] },
    { classes: "text-xl" },
  );
  assert.ok(result);
  assert.equal(result!.content, `<p className="text-xl">Hi</p>`);
});

test("applyVisualEdit rewrites duplicate text next to the selected classes", () => {
  const files = [srcFile(
    "src/App.tsx",
    `<button className="btn-a">Save</button><button className="btn-b">Save</button>`,
  )];
  const result = applyVisualEdit(
    files,
    { tagName: "button", textContent: "Save", classList: ["btn-b"] },
    { text: "Done" },
  );
  assert.ok(result);
  assert.equal(
    result!.content,
    `<button className="btn-a">Save</button><button className="btn-b">Done</button>`,
  );
});

test("applyVisualEdit uses sourceLine when the same label appears twice without unique classes", () => {
  const files = [srcFile(
    "src/App.tsx",
    `<h1>Hello</h1>\n<h1>Hello</h1>\n`,
  )];
  const result = applyVisualEdit(
    files,
    { tagName: "h1", textContent: "Hello", classList: [], sourceFile: "src/App.tsx", sourceLine: 2 },
    { text: "World" },
  );
  assert.ok(result);
  assert.equal(result!.content, `<h1>Hello</h1>\n<h1>World</h1>\n`);
});

test("applyVisualEdit injects className on the duplicate label nearest sourceLine", () => {
  const files = [srcFile(
    "src/App.tsx",
    `<p>Save</p>\n<p>Save</p>\n`,
  )];
  const result = applyVisualEdit(
    files,
    { tagName: "p", textContent: "Save", classList: [], sourceFile: "src/App.tsx", sourceLine: 1 },
    { classes: "font-bold" },
  );
  assert.ok(result);
  assert.equal(result!.content, `<p className="font-bold">Save</p>\n<p>Save</p>\n`);
});

test("applyVisualEdit scopes a sourceFile hint so a twin in another file is left alone", () => {
  const files = [
    srcFile("src/App.tsx", `<h1>Title</h1>`),
    srcFile("src/Other.tsx", `<h1>Title</h1>`),
  ];
  const result = applyVisualEdit(
    files,
    { tagName: "h1", textContent: "Title", classList: [], sourceFile: "src/Other.tsx", sourceLine: 1 },
    { classes: "text-xl" },
  );
  assert.ok(result);
  assert.equal(result!.path, "src/Other.tsx");
  assert.match(result!.content, /className="text-xl"/);
});
