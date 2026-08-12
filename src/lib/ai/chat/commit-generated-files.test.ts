import test from "node:test";
import assert from "node:assert/strict";
import { commitGeneratedFiles } from "./commit-generated-files.ts";

test("generated files use begin + atomic commit RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return name === "begin_generation"
        ? { data: [{ run_id: "run-1", base_revision: 4 }], error: null }
        : { data: 5, error: null };
    },
  };
  const result = await commitGeneratedFiles(client as never, "project-1", [
    { path: "index.html", content: "<main>ok</main>", language: "html" },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(calls.map((call) => call.name), ["begin_generation", "commit_generation"]);
  assert.equal(calls[1]?.args.expected_revision, 4);
});

test("generation conflicts preserve newer project files", async () => {
  const client = {
    rpc: async (name: string) => name === "begin_generation"
      ? { data: [{ run_id: "run-1", base_revision: 2 }], error: null }
      : { data: null, error: { code: "40001", message: "generation conflict" } },
  };
  await assert.rejects(
    () => commitGeneratedFiles(client as never, "project-1", [{ path: "app.js", content: "x", language: "js" }]),
    /newer files were preserved/,
  );
});
