import test from "node:test";
import assert from "node:assert/strict";
import { commitGeneratedFiles } from "./commit-generated-files.ts";

function previousFilesQuery(rows: Array<{ path: string; content: string; language?: string }> = []) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: rows, error: null }),
      }),
    }),
  };
}

test("generated files use begin + atomic commit RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    ...previousFilesQuery(),
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
    ...previousFilesQuery([{ path: "app.js", content: "old" }]),
    rpc: async (name: string) => name === "begin_generation"
      ? { data: [{ run_id: "run-1", base_revision: 2 }], error: null }
      : { data: null, error: { code: "40001", message: "generation conflict" } },
  };
  await assert.rejects(
    () => commitGeneratedFiles(client as never, "project-1", [{ path: "app.js", content: "x", language: "js" }]),
    /newer files were preserved/,
  );
});

test("commit drops TanStack Vite entries even without a stored contract", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    ...previousFilesQuery([
      { path: "src/routes/__root.tsx", content: "export const Route = {};", language: "typescriptreact" },
    ]),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return name === "begin_generation"
        ? { data: [{ run_id: "run-1", base_revision: 4 }], error: null }
        : { data: 5, error: null };
    },
  };
  const result = await commitGeneratedFiles(client as never, "project-1", [
    { path: "src/App.tsx", content: "export default function App() { return null; }", language: "typescriptreact" },
    { path: "src/routes/index.tsx", content: "export const Route = {};", language: "typescriptreact" },
  ]);
  assert.equal(result.some((file) => file.path === "src/App.tsx"), false);
  assert.ok(result.some((file) => file.path === "src/routes/index.tsx"));
  const staged = calls.find((call) => call.name === "commit_generation")?.args.staged_files as Array<{ path: string }>;
  assert.equal(staged.some((file) => file.path === "src/App.tsx"), false);
});
