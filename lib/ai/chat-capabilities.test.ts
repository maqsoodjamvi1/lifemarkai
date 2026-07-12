import assert from "node:assert/strict";
import test from "node:test";
import {
  detectPromptSecret,
  extractPromptSecretAssignments,
  redactPromptSecrets,
} from "./chat-capabilities";

test("redacts named secret assignments into secret mentions", () => {
  const input = "Use this key:\nOPENAI_API_KEY=sk-proj_abcdefghijklmnopqrstuvwxyz123456";
  const redacted = redactPromptSecrets(input);

  assert.equal(redacted.hasUnsecuredSecret, false);
  assert.deepEqual(redacted.assignments.map((item) => item.name), ["OPENAI_API_KEY"]);
  assert.equal(redacted.assignments[0].value, "sk-proj_abcdefghijklmnopqrstuvwxyz123456");
  assert.equal(redacted.redactedText, "Use this key:\n@secret:OPENAI_API_KEY");
});

test("detects plain raw secrets without a variable name", () => {
  const input = "sk-proj_abcdefghijklmnopqrstuvwxyz123456";

  assert.equal(extractPromptSecretAssignments(input).length, 0);
  assert.equal(redactPromptSecrets(input).hasUnsecuredSecret, true);
  assert.equal(detectPromptSecret(input)?.label, "OpenRouter/OpenAI-style key");
});
