/**
 * Covers buildRepairContext() — the "Relevant files" context builder used by
 * every self-verify repair tier. Before this fix it unconditionally sent
 * bytes 0..6000 of a file's content, so an error reported past roughly line
 * 150 of a larger file was never actually in the prompt: the file was
 * "sent" but the broken line was not, at every tier including escalation.
 * This regression-tests that a deep error is now windowed into view, and
 * that the windowed text stays an exact substring of the real file (the
 * self-verify fix prompt tells the model to copy `search` text "verbatim"
 * from this context, so any injected markup inside the excerpt would
 * corrupt that copy).
 *
 *   node --import tsx --test src/lib/ai/repair-context.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildRepairContext } from "./repair-context.ts";

describe("buildRepairContext — small files (under budget)", () => {
  it("includes the whole file verbatim, with no window annotation", () => {
    const files = [{ path: "src/small.ts", content: "export const x = 1;\n" }];
    const ctx = buildRepairContext(files as never, ["src/small.ts:1 — TS1: irrelevant"]);
    assert.equal(ctx, "=== src/small.ts ===\nexport const x = 1;\n");
  });

  it("includes the whole file verbatim even with zero matching errors", () => {
    const files = [{ path: "src/small.ts", content: "export const x = 1;\n" }];
    const ctx = buildRepairContext(files as never, ["some unrelated runtime message"]);
    assert.equal(ctx, "=== src/small.ts ===\nexport const x = 1;\n");
  });
});

describe("buildRepairContext — large files, no known error line", () => {
  it("falls back to the previous head-anchored slice", () => {
    const bigContent = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`).join("\n") + "\n";
    assert.ok(bigContent.length > 6_000, "fixture must exceed the default budget");
    const files = [{ path: "src/big.ts", content: bigContent }];
    // No error names src/big.ts:N — nothing to window around.
    const ctx = buildRepairContext(files as never, ["src/other.ts:5 — TS1: unrelated"]);
    assert.equal(ctx, `=== src/big.ts ===\n${bigContent.slice(0, 6_000)}`);
  });
});

describe("buildRepairContext — large files, error deep in the file", () => {
  it("windows the excerpt so a deep error line is actually present in the context", () => {
    // 400 short lines, well over the 6,000-char budget if sent in full.
    const lines = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`);
    const content = lines.join("\n") + "\n";
    assert.ok(content.length > 6_000, "fixture must exceed the default budget");

    // The bug: a naive head-slice of the first 6,000 chars stops well short
    // of line 380 — confirm the fixture actually exercises that gap.
    const headSlice = content.slice(0, 6_000);
    assert.ok(!headSlice.includes("line379 = 379"), "fixture assumption: deep line must be outside a plain head slice");

    const files = [{ path: "src/big.ts", content }];
    const ctx = buildRepairContext(files as never, ["src/big.ts:380:3 — TS2304: Cannot find name 'line379'"]);

    assert.ok(ctx.includes("const line379 = 379;"), "windowed excerpt must contain the reported error's own line");
    assert.match(ctx, /=== src\/big\.ts \(showing lines \d+-\d+ of 401, windowed around the reported error\) ===/);
  });

  it("keeps the windowed text an exact substring of the real file (no injected markup)", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`);
    const content = lines.join("\n") + "\n";
    const files = [{ path: "src/big.ts", content }];
    const ctx = buildRepairContext(files as never, ["src/big.ts:380:3 — TS2304: Cannot find name 'line379'"]);

    const body = ctx.slice(ctx.indexOf("===\n", ctx.indexOf(")")) + 4);
    assert.ok(content.includes(body), "the windowed body must be a verbatim substring of the original file");
    assert.doesNotMatch(body, /^\d+: /m, "windowed lines must not carry injected line-number prefixes");
  });

  it("spans from the earliest to the latest reported line when a file has several nearby errors", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`);
    const content = lines.join("\n") + "\n";
    const files = [{ path: "src/big.ts", content }];
    // 40 lines apart — well inside a single window's reach, so both must
    // appear. (Errors far enough apart that their combined span exceeds the
    // char budget are a separate, documented limitation — see the doc
    // comment on buildRepairContext.)
    const ctx = buildRepairContext(files as never, [
      "src/big.ts:340:1 — TS2304: Cannot find name 'line339'",
      "src/big.ts:380:3 — TS2304: Cannot find name 'line379'",
    ]);

    assert.ok(ctx.includes("const line339 = 339;"), "must cover the earliest reported line");
    assert.ok(ctx.includes("const line379 = 379;"), "must cover the latest reported line");
  });

  it("truncates a too-wide combined span from the start, same as the single-error fallback — a documented, bounded limitation", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`);
    const content = lines.join("\n") + "\n";
    const files = [{ path: "src/big.ts", content }];
    // 330 lines apart — the combined span cannot fit in the default budget.
    const ctx = buildRepairContext(files as never, [
      "src/big.ts:50:1 — TS2304: Cannot find name 'line49'",
      "src/big.ts:380:3 — TS2304: Cannot find name 'line379'",
    ]);

    assert.ok(ctx.length <= 6_000 + 200, "must still respect the char budget (plus header overhead)");
    assert.ok(ctx.includes("const line49 = 49;"), "the earlier error, near the start of the span, must survive");
  });

  it("clamps the window to the file's actual bounds near the start and end", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`);
    const content = lines.join("\n") + "\n";
    const files = [{ path: "src/big.ts", content }];
    // Line 2 — window would want to start at line -38, must clamp to 1.
    const ctx = buildRepairContext(files as never, ["src/big.ts:2:1 — TS2304: Cannot find name 'line1'"]);
    assert.match(ctx, /showing lines 1-\d+ of 401/);
    assert.ok(ctx.includes("const line0 = 0;"), "clamped window must still include the file's first line");
  });

  it("respects a custom maxCharsPerFile budget", () => {
    const files = [{ path: "src/small.ts", content: "0123456789".repeat(50) }]; // 500 chars
    const ctx = buildRepairContext(files as never, [], 100);
    assert.equal(ctx, `=== src/small.ts ===\n${"0123456789".repeat(50).slice(0, 100)}`);
  });
});

describe("buildRepairContext — multiple files", () => {
  it("joins each file's block with a blank-line separator, mixing small and windowed files", () => {
    const small = { path: "src/small.ts", content: "export const x = 1;\n" };
    const lines = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`);
    const big = { path: "src/big.ts", content: lines.join("\n") + "\n" };

    const ctx = buildRepairContext([small, big] as never, ["src/big.ts:380:3 — TS2304: Cannot find name 'line379'"]);
    assert.ok(ctx.startsWith("=== src/small.ts ===\nexport const x = 1;\n"), "small file block must come first, verbatim");
    assert.ok(
      ctx.includes("\n\n=== src/big.ts (showing lines"),
      "the two file blocks must be separated by a blank line",
    );
  });
});
