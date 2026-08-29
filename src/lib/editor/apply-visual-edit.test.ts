import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyArbitraryColorToken,
  applyDimensionToken,
  applyFontFamilyToken,
  applySpacingToken,
  normalizeHex,
} from "./apply-visual-edit";

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
