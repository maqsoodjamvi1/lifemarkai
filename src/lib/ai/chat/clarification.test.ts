import test from "node:test";
import assert from "node:assert/strict";
import { buildClarificationPrompt,parseClarifyingQuestions } from "./clarification.ts";
test("preserves described multi-select options", () => {
  const q = parseClarifyingQuestions('[{"question":"Connector behavior?","multiple":true,"options":[{"label":"Real data","description":"Shared CRM","value":"shared"}]}]')[0];
  assert.equal(q?.multiple,true); assert.deepEqual(q?.options?.[0],{label:"Real data",description:"Shared CRM",value:"shared"});
});
test("rejects malformed clarification output", () => assert.deepEqual(parseClarifyingQuestions("bad"),[]));
test("prompt requests connector outcomes", () => assert.match(buildClarificationPrompt("app",true),/describe outcomes/i));
