import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const loader = readFileSync(new URL("./optional-playwright.ts", import.meta.url), "utf8");
const consumers = [
  "./ai/agent-browser.ts",
  "./ai/self-verify.ts",
  "../routes/api/projects/$id/browser-test.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("Playwright is optional, opt-in, and invisible to Vite dependency scanning", () => {
  assert.match(loader, /PLAYWRIGHT_ENABLED !== "true"/);
  assert.match(loader, /runtimeImport\("playwright"\)/);
  for (const source of consumers) {
    assert.match(source, /loadOptionalPlaywright/);
    assert.doesNotMatch(source, /import\([^\n]*playwright/);
  }
});
