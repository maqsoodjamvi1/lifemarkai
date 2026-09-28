import assert from "node:assert/strict";
import { test } from "node:test";
import type { EditorTask } from "./types.ts";
import { enrichStructuralRisk } from "./structural-risk.ts";

function task(title: string): EditorTask {
  return { id: "edit", title, role: "frontend", status: "pending", dependsOn: [], risk: 15 };
}

test("only explicit project paths receive a higher advisory risk", async () => {
  const originalFetch = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json({ risks: [{ id: "edit", score: 65 }] });
  };
  try {
    const named = task("Change src/a.ts");
    const vague = task("Improve component");
    await enrichStructuralRisk([named, vague], new Map([["src/a.ts", "function a() {}"]]), "http://127.0.0.1:8765");
    assert.equal(named.risk, 65);
    assert.equal(vague.risk, 15);
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("unavailable service preserves planner risk", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const item = task("Change src/a.ts");
    await enrichStructuralRisk([item], new Map([["src/a.ts", "function a() {}"]]), "http://127.0.0.1:8765");
    assert.equal(item.risk, 15);
  } finally { globalThis.fetch = originalFetch; }
});

test("never sends project environment or configuration files to the side service", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.files.map((file: { path: string }) => file.path), ["src/a.ts"]);
    return Response.json({ risks: [] });
  };
  try {
    await enrichStructuralRisk([task("Edit src/a.ts")], new Map([
      [".env.local", "API_KEY=secret"],
      ["vite.config.ts", "const API_KEY = \"secret\""],
      ["next.config.js", "module.exports = { secret: \"secret\" }"],
      ["src/a.ts", "export function a() {}"],
    ]), "http://127.0.0.1:8765");
  } finally { globalThis.fetch = originalFetch; }
});
