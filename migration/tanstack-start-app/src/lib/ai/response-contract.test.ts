import test from "node:test";
import assert from "node:assert/strict";
import {
AGENT_SYSTEM_PROMPT,
APP_GENERATION_SYSTEM_PROMPT,
CHAT_SYSTEM_PROMPT,
NEXT_APP_GENERATION_SYSTEM_PROMPT,
RESPONSE_CONTRACT,
} from "./system-prompts.ts";

/**
 * The response contract is the shape of what the user reads. It is easy to
 * drop by accident — a prompt gets refactored, a block gets reordered, and the
 * only symptom is that replies quietly go back to sounding generic, which no
 * build or typecheck can catch.
 *
 * So: assert it is present, and assert the specific rules that came from
 * observed behaviour are still in it.
 */

test("the response contract reaches every mode that talks to the user", () => {
  for (const [name, prompt] of [
    ["chat", CHAT_SYSTEM_PROMPT],
    ["agent", AGENT_SYSTEM_PROMPT],
  ] as const) {
    assert.ok(prompt.includes(RESPONSE_CONTRACT), `${name} lost the response contract`);
  }
});

test("patch mode is deliberately excluded", async () => {
  // Patch returns a bare JSON object; prose rules there would invite the model
  // to emit commentary outside the object and break the parser. If someone adds
  // it, this test should make them think about that first.
  const { PATCH_SYSTEM_PROMPT } = await import("./system-prompts.ts");
  assert.equal(PATCH_SYSTEM_PROMPT.includes(RESPONSE_CONTRACT), false);
});

test("the two-heading fix shape survives", () => {
  assert.match(RESPONSE_CONTRACT, /\*\*What caused it:\*\*/);
  assert.match(RESPONSE_CONTRACT, /\*\*Fix:\*\*/);
  // Quoting the user's own words back is the part that reads as comprehension.
  assert.match(RESPONSE_CONTRACT, /Quote the user's own words/i);
});

test("check-before-you-build survives", () => {
  assert.match(RESPONSE_CONTRACT, /already exists, say where it is/i);
});

test("the contract still permits long answers", () => {
  // An earlier chat rule capped replies at "2-5 concise sentences", which would
  // have truncated exactly the checklist-and-spec answers worth giving.
  assert.match(RESPONSE_CONTRACT, /Match length to the question/i);
  assert.match(RESPONSE_CONTRACT, /never truncate a real one/i);
  assert.equal(/2-5 concise sentences/.test(CHAT_SYSTEM_PROMPT), false);
});

test("disagreement is licensed, and grounded in the user's own project", () => {
  assert.match(RESPONSE_CONTRACT, /Disagree when you have grounds/i);
  assert.match(RESPONSE_CONTRACT, /argue from facts in THEIR project/i);
});

test("every reply ends with one actionable question", () => {
  assert.match(RESPONSE_CONTRACT, /End with one specific next step/i);
  assert.match(RESPONSE_CONTRACT, /Not a menu of options/i);
});

test("both build engines ask for a walkthrough, not a one-liner", () => {
  for (const [name, prompt] of [
    ["react", APP_GENERATION_SYSTEM_PROMPT],
    ["next", NEXT_APP_GENERATION_SYSTEM_PROMPT],
  ] as const) {
    assert.match(prompt, /WALKTHROUGH, not a sentence/, `${name} engine`);
    // The old rule is the thing being replaced; if it comes back, builds go
    // back to reporting a minute of work in one line.
    assert.equal(
      /must be a friendly one-line summary/.test(prompt),
      false,
      `${name} engine reverted to the one-line summary rule`,
    );
  }
});

test("the contract stays short enough to actually be followed", () => {
  // A prompt block nobody reads is worse than no block. Observed rules only.
  assert.ok(
    RESPONSE_CONTRACT.length < 2600,
    `response contract is ${RESPONSE_CONTRACT.length} chars — trim it or drop a rule`,
  );
});
