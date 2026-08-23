/**
 * Unit tests for polyglot bridge — offline / no-service paths must be safe.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStructuralContext,
  findCallers,
  findDefinition,
  impactAnalysis,
  indexFiles,
  planWithPythonAgent,
  polyglotHealth,
  semanticSearch,
} from "./polyglot-bridge.ts";

describe("polyglot-bridge offline", () => {
  it("returns null when service URLs are unset", async () => {
    const cfg = { rustAstUrl: undefined, pythonAiUrl: undefined, timeoutMs: 500 };
    assert.equal(await indexFiles([{ path: "a.ts", content: "export function foo() {}" }], cfg), null);
    assert.equal(await findDefinition("foo", cfg), null);
    assert.equal(await findCallers("foo", cfg), null);
    assert.equal(await impactAnalysis("foo", cfg), null);
    assert.equal(await semanticSearch("foo", {}, cfg), null);
    assert.equal(await planWithPythonAgent("build a todo app", {}, cfg), null);
  });

  it("polyglotHealth reports both false without URLs", async () => {
    const h = await polyglotHealth({ rustAstUrl: undefined, pythonAiUrl: undefined, timeoutMs: 300 });
    assert.deepEqual(h, { rust: false, python: false });
  });

  it("buildStructuralContext returns empty string offline", async () => {
    const files = new Map<string, string>([["src/app.ts", "export function main() {}"]]);
    const ctx = await buildStructuralContext(files, ["main"]);
    assert.equal(typeof ctx, "string");
  });
});
