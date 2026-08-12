import assert from "node:assert/strict";
import test from "node:test";
import {
buildPromptFromUrlPayload,
parseBuildWithUrlPayload,
} from "./build-with-url.ts";

// `pages` was added to this payload after the tests below were written, and
// nobody noticed the drift: the import above was missing its .ts extension,
// so node --test could not resolve it and skipped the whole file silently.
test("parseBuildWithUrlPayload accepts a valid handoff", () => {
  assert.deepEqual(
    parseBuildWithUrlPayload(JSON.stringify({ prompt: "Build a shop", images: [], at: 123 })),
    { prompt: "Build a shop", images: [], pages: [], at: 123 },
  );
});

test("parseBuildWithUrlPayload keeps http(s) reference pages and drops the rest", () => {
  const parsed = parseBuildWithUrlPayload(JSON.stringify({
    prompt: "Copy this",
    images: [],
    pages: ["https://example.com/a", "javascript:alert(1)", "/relative", 42],
    at: 1,
  }));
  assert.deepEqual(parsed?.pages, ["https://example.com/a"]);
});

test("parseBuildWithUrlPayload rejects more than ten references in total", () => {
  const six = (p: string) => Array.from({ length: 6 }, (_, i) => `https://example.com/${p}${i}`);
  assert.equal(
    parseBuildWithUrlPayload(JSON.stringify({ prompt: "x", images: six("i"), pages: six("p"), at: 1 })),
    null,
  );
});

test("buildPromptFromUrlPayload lists reference pages", () => {
  assert.equal(
    buildPromptFromUrlPayload({
      prompt: "Match this",
      images: [],
      pages: ["https://example.com/one"],
      at: 1,
    }),
    "Match this\n\nReference pages:\n- https://example.com/one",
  );
});

test("parseBuildWithUrlPayload rejects malformed handoffs", () => {
  assert.equal(parseBuildWithUrlPayload("not json"), null);
  assert.equal(parseBuildWithUrlPayload(JSON.stringify({ prompt: "", images: [], at: 1 })), null);
  assert.equal(parseBuildWithUrlPayload(JSON.stringify({ prompt: "Build", images: "bad", at: 1 })), null);
});

test("buildPromptFromUrlPayload retains image references", () => {
  assert.equal(
    buildPromptFromUrlPayload({
      prompt: "Match this design",
      images: ["https://example.com/one.png", "https://example.com/two.png"],
      at: 1,
    }),
    "Match this design\n\nReference images:\n- https://example.com/one.png\n- https://example.com/two.png",
  );
});
