import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./agent-browser.ts", import.meta.url), "utf8");

test("Playwright stays optional and opt-in for normal development", () => {
  assert.match(source, /PLAYWRIGHT_ENABLED !== "true"/);
  assert.match(source, /runtimeImport\("playwright"\)/);
  assert.doesNotMatch(source, /import\([^\n]*playwright/);
});
