import assert from "node:assert/strict";
import { test } from "node:test";
import { backendFromEnvVars } from "./project-backend.ts";

test("backendFromEnvVars prefers the service role key and marks RLS off", () => {
  const b = backendFromEnvVars({
    VITE_SUPABASE_URL: "https://abc.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    VITE_SUPABASE_ANON_KEY: "anon",
  });
  assert.equal(b.kind, "supabase");
  if (b.kind === "supabase") {
    assert.equal(b.key, "service");
    assert.equal(b.rls, false);
  }
});

test("backendFromEnvVars uses the anon key when no service role is set", () => {
  const b = backendFromEnvVars({
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  });
  assert.equal(b.kind, "supabase");
  if (b.kind === "supabase") {
    assert.equal(b.url, "https://abc.supabase.co");
    assert.equal(b.rls, true);
  }
});

test("backendFromEnvVars is none without a hosted URL and key", () => {
  assert.equal(backendFromEnvVars({}).kind, "none");
  assert.equal(backendFromEnvVars({ VITE_SUPABASE_URL: "https://abc.supabase.co" }).kind, "none");
});
