import test from "node:test";
import assert from "node:assert/strict";
import { restoreProjectFilesAtomically } from "./restore-project-files.ts";

test("restore uses the same begin + atomic commit RPC as generation", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return name === "begin_generation"
        ? { data: [{ run_id: "run-1", base_revision: 7 }], error: null }
        : { data: null, error: null };
    },
  };
  const result = await restoreProjectFilesAtomically(client, "project-1", [
    { path: "index.html", content: "<main>restored</main>", language: "html" },
  ]);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls.map((c) => c.name), ["begin_generation", "commit_generation"]);
  assert.equal(calls[1]?.args.expected_revision, 7);
});

test("a generation that raced the restore is reported as a conflict, not silently applied", async () => {
  // This is the exact scenario that destroyed a live project: a generation
  // began before Restore was clicked, was still mid-flight, and finished
  // after. The old raw delete+insert had no way to detect this and the
  // generation silently won. Routed through commit_generation, that race now
  // surfaces as a 40001 conflict instead.
  const client = {
    rpc: async (name: string) =>
      name === "begin_generation"
        ? { data: [{ run_id: "run-1", base_revision: 2 }], error: null }
        : { data: null, error: { code: "40001", message: "generation conflict" } },
  };
  const result = await restoreProjectFilesAtomically(client, "project-1", [
    { path: "app.js", content: "restored", language: "javascript" },
  ]);
  assert.equal(result.ok, false);
  assert.equal((result as { conflict: boolean }).conflict, true);
});

test("a missing begin_generation RPC (rolling deploy) is reported so the caller can fall back", async () => {
  const client = {
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "function not found in schema cache" } }),
  };
  const result = await restoreProjectFilesAtomically(client, "project-1", [
    { path: "app.js", content: "x", language: "javascript" },
  ]);
  assert.equal(result.ok, false);
  assert.equal((result as { conflict: boolean }).conflict, false);
  assert.equal((result as { rpcMissing?: boolean }).rpcMissing, true);
});

test("a non-conflict commit error is reported as a fatal, non-conflict failure", async () => {
  const client = {
    rpc: async (name: string) =>
      name === "begin_generation"
        ? { data: [{ run_id: "run-1", base_revision: 9 }], error: null }
        : { data: null, error: { code: "23505", message: "duplicate key" } },
  };
  const result = await restoreProjectFilesAtomically(client, "project-1", [
    { path: "app.js", content: "x", language: "javascript" },
  ]);
  assert.equal(result.ok, false);
  assert.equal((result as { conflict: boolean }).conflict, false);
  assert.equal((result as { rpcMissing?: boolean }).rpcMissing, undefined);
});
