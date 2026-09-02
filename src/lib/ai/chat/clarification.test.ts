import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClarificationPrompt,
  fallbackClarifyingQuestions,
  fallbackClarifyTurn,
  parseClarifyingQuestions,
  parseClarifyTurn,
} from "./clarification.ts";
test("preserves described multi-select options", () => {
  const q = parseClarifyingQuestions('[{"question":"Connector behavior?","multiple":true,"options":[{"label":"Real data","description":"Shared CRM","value":"shared"}]}]')[0];
  assert.equal(q?.multiple,true); assert.deepEqual(q?.options?.[0],{label:"Real data",description:"Shared CRM",value:"shared"});
});
test("rejects malformed clarification output", () => assert.deepEqual(parseClarifyingQuestions("bad"),[]));
test("prompt asks for exactly one live question", () => {
  assert.match(buildClarificationPrompt("app", true), /Ask exactly ONE question/i);
  assert.match(buildClarificationPrompt("app", false, true), /do not assume they want a website/i);
  assert.match(buildClarificationPrompt("app", false, false, true), /already answered/i);
});
test("fallback questionnaire is non-empty for websites and app shells", () => {
  const site = fallbackClarifyingQuestions("landing-page", false);
  const shell = fallbackClarifyingQuestions("erp", true);
  assert.ok(site.length >= 3);
  assert.ok(shell.length >= 3);
  assert.ok(site.every((q) => q.question && (q.type === "text" || (q.options?.length ?? 0) > 0)));
  assert.ok(shell.some((q) => q.id === "auth"));
});
test("open-ended greeting fallback asks what to create, not a website palette", () => {
  const questions = fallbackClarifyingQuestions("general-app", false, true);
  assert.equal(questions[0]?.id, "product");
  assert.match(questions[0]?.question ?? "", /what do you want to create/i);
  assert.ok(!questions.some((q) => q.id === "look"));
});
test("fallback turn returns a single question from the bank", () => {
  const first = fallbackClarifyTurn("landing-page", false, true, 0);
  assert.equal(first.id, "product");
  const later = fallbackClarifyTurn("erp", true, false, 2);
  assert.equal(later.id, "auth");
});
test("parseClarifyTurn reads a single object and readyToBuild", () => {
  const turn = parseClarifyTurn('{"question":"Who is it for?","options":[{"label":"Customers","value":"public"}],"kind":"audience","readyToBuild":false}');
  assert.equal(turn.readyToBuild, false);
  assert.equal(turn.question?.question, "Who is it for?");
  assert.equal(turn.question?.type, "choice");
  const ready = parseClarifyTurn('{"ack":"Got it — a bakery site.","readyToBuild":true}');
  assert.equal(ready.readyToBuild, true);
  assert.equal(ready.question, null);
  assert.equal(ready.ack, "Got it — a bakery site.");
});
test("parseClarifyTurn takes the first item from a legacy array", () => {
  const turn = parseClarifyTurn('[{"question":"First?"},{"question":"Second?"}]');
  assert.equal(turn.question?.question, "First?");
  assert.equal(turn.readyToBuild, false);
});
