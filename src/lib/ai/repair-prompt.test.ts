import assert from "node:assert/strict";
import test from "node:test";
import { buildRepairPrompt } from "./system-prompts.ts";

const files = [{ path: "src/App.tsx", content: 'export default function App() { return <h1>Keep my design</h1>; }' }];

test("repair receives actual source and requests only changed files", () => {
  const prompt = buildRepairPrompt(files, ["src/App.tsx:1: Missing symbol"]);
  assert.ok(prompt.includes(JSON.stringify(files)));
  assert.ok(prompt.includes("src/App.tsx:1: Missing symbol"));
  assert.match(prompt, /do not return unchanged files/);
});

test("enrichment receives source so existing design can be preserved", () => {
  const prompt = buildRepairPrompt(files, ["Missing contact section"], "Add a contact form");
  assert.ok(prompt.includes(JSON.stringify(files)));
  assert.ok(prompt.includes("Add a contact form"));
  assert.ok(prompt.includes("Missing contact section"));
});
