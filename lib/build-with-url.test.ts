import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPromptFromUrlPayload,
  parseBuildWithUrlPayload,
} from "./build-with-url";

test("parseBuildWithUrlPayload accepts a valid handoff", () => {
  assert.deepEqual(
    parseBuildWithUrlPayload(JSON.stringify({ prompt: "Build a shop", images: [], at: 123 })),
    { prompt: "Build a shop", images: [], at: 123 },
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
