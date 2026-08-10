import test from "node:test";
import assert from "node:assert/strict";
import { commitGenerationSnapshot } from "./commit-generation-snapshot.ts";

test("agent snapshots stage then atomically replace the complete filesystem", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return name === "begin_generation"
        ? { data: [{ run_id: "run-agent", base_revision: 8 }], error: null }
        : { data: 9, error: null };
    },
  };
  const files = await commitGenerationSnapshot(client as never, "project-1", "agent", [
    { path: "src/main.tsx", content: "export default function App() { return <main>OK</main> }", language: "typescriptreact" },
  ]);
  assert.equal(files.length, 1);
  assert.deepEqual(calls.map((call) => call.name), ["begin_generation", "commit_generation_snapshot"]);
  assert.equal(calls[0]?.args.run_source, "agent");
  assert.equal(calls[1]?.args.expected_revision, 8);
});

test("agent snapshot activation failures never fall back to direct writes", async () => {
  const client = {
    rpc: async (name: string) => name === "begin_generation"
      ? { data: [{ run_id: "run-agent", base_revision: 8 }], error: null }
      : { data: null, error: { code: "40001", message: "generation conflict" } },
  };
  await assert.rejects(
    () => commitGenerationSnapshot(client as never, "project-1", "agent", [
      { path: "index.html", content: "<main>safe</main>", language: "html" },
    ]),
    /Could not activate verified generation/,
  );
});
