import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSupabaseWired } from "./detect-supabase-wiring";

test("hasSupabaseWired flags a migrations directory even with empty content", () => {
  const result = hasSupabaseWired([{ path: "supabase/migrations/001_init.sql", content: "" }]);
  assert.equal(result.hasSupabase, true);
  assert.deepEqual(result.evidence, ["supabase/migrations/001_init.sql"]);
});

test("hasSupabaseWired flags a supabase edge function directory", () => {
  const result = hasSupabaseWired([{ path: "supabase/functions/hello/index.ts", content: "" }]);
  assert.equal(result.hasSupabase, true);
});

test("hasSupabaseWired flags a supabase-js import", () => {
  const result = hasSupabaseWired([
    { path: "src/lib/db.ts", content: 'import { createClient } from "@supabase/supabase-js";' },
  ]);
  assert.equal(result.hasSupabase, true);
  assert.match(result.evidence[0], /\(import\)$/);
});

test("hasSupabaseWired flags a raw Supabase env var reference", () => {
  const result = hasSupabaseWired([
    { path: "src/config.ts", content: "const url = process.env.NEXT_PUBLIC_SUPABASE_URL;" },
  ]);
  assert.equal(result.hasSupabase, true);
  assert.match(result.evidence[0], /\(env\)$/);
});

test("hasSupabaseWired flags a createClient(...supabase...) call", () => {
  const result = hasSupabaseWired([
    { path: "src/db.ts", content: 'const db = createClient("https://x.supabase.co", key);' },
  ]);
  assert.equal(result.hasSupabase, true);
  assert.match(result.evidence[0], /\(client\)$/);
});

test("hasSupabaseWired returns false for a project with no Supabase signal at all", () => {
  const result = hasSupabaseWired([
    { path: "src/App.tsx", content: "export default function App() { return <div>hi</div>; }" },
    { path: "package.json", content: '{"name":"my-app"}' },
  ]);
  assert.equal(result.hasSupabase, false);
  assert.deepEqual(result.evidence, []);
});

test("hasSupabaseWired returns an empty file list as not wired", () => {
  assert.deepEqual(hasSupabaseWired([]), { hasSupabase: false, evidence: [] });
});

test("hasSupabaseWired dedupes evidence and caps scanning once 6 hits are found", () => {
  const files = Array.from({ length: 20 }, (_, i) => ({
    path: `src/file${i}.ts`,
    content: 'import { createClient } from "@supabase/supabase-js";',
  }));
  const result = hasSupabaseWired(files);
  assert.equal(result.hasSupabase, true);
  // Every hit is a distinct path, so dedup doesn't collapse them, but the
  // scan should have stopped once it collected 6 — it must not silently
  // walk (and hold in memory) every file in a huge project.
  assert.equal(result.evidence.length, 6);
});

test("hasSupabaseWired treats a file with no matching content as non-evidence, not a false positive", () => {
  const result = hasSupabaseWired([
    { path: "src/unrelated.ts", content: "export const x = 1;" },
  ]);
  assert.equal(result.hasSupabase, false);
});
