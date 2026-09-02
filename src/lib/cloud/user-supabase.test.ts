import assert from "node:assert/strict";
import { test } from "node:test";
import { supabaseRefFromProjectUrl } from "./user-supabase.ts";

test("supabaseRefFromProjectUrl reads the project ref from a hosted URL", () => {
  assert.equal(supabaseRefFromProjectUrl("https://abcdxyz.supabase.co"), "abcdxyz");
  assert.equal(supabaseRefFromProjectUrl("https://abcdxyz.supabase.co/rest/v1"), "abcdxyz");
});

test("supabaseRefFromProjectUrl rejects non-Supabase hosts", () => {
  assert.equal(supabaseRefFromProjectUrl("https://example.com"), null);
  assert.equal(supabaseRefFromProjectUrl("not-a-url"), null);
});
