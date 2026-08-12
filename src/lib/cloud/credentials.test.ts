import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { persistManagedDbPassword } from "./credentials.ts";

// ─── The invariant no type can express ──────────────────────────────────────
//
// `createManagedProject()` returns a password Supabase will never show again.
// Ignoring it compiles, passes review, and produces a backend that works
// perfectly right up until someone needs a direct Postgres connection. That is
// exactly what happened: both call sites destructured `{ ref }` and dropped it.
//
// TypeScript cannot mark a destructured field as must-use, so the guard is a
// source-level assertion instead.

const SRC = path.resolve(import.meta.dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

test("every createManagedProject call site persists the password", () => {
  // Match an actual invocation, not a mention. Prose in a doc comment names
  // the function without awaiting it, and this file and credentials.ts both do.
  const CALL = /\bawait\s+createManagedProject\s*\(/;
  const callers = walk(SRC).filter((f) => {
    if (f.endsWith(path.join("cloud", "management.ts"))) return false; // the definition
    return CALL.test(fs.readFileSync(f, "utf8"));
  });

  // If this drops to zero, the sweep silently stopped protecting anything.
  assert.ok(callers.length >= 2, `expected at least 2 call sites, found ${callers.length}`);

  for (const file of callers) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(SRC, file);
    assert.ok(
      src.includes("persistManagedDbPassword"),
      `${rel} calls createManagedProject but never persists the password. ` +
        "Supabase shows it once; dropping it locks the backend out of direct " +
        "Postgres access permanently. Import persistManagedDbPassword from lib/cloud/credentials.",
    );
    assert.ok(
      /const\s*\{[^}]*\bdbPassword\b[^}]*\}\s*=\s*await\s+createManagedProject\(/.test(src),
      `${rel} does not destructure dbPassword from createManagedProject`,
    );
  }
});

// ─── Input guards ───────────────────────────────────────────────────────────

test("a missing project id is refused rather than written", async () => {
  const r = await persistManagedDbPassword("", "hunter2");
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /projectId/i);
});

test("an empty password is refused rather than stored as an empty string", async () => {
  // Storing "" is worse than storing nothing: a NULL reads as "never saved",
  // while "" reads as a credential that exists and simply doesn't work.
  const r = await persistManagedDbPassword("11111111-1111-4111-8111-111111111111", "");
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /no password/i);
});

test("it reports failure instead of throwing", async () => {
  // No service-role env in the test runner, so createAdminClient will fail.
  // The contract is that provisioning continues and the caller is told.
  const r = await persistManagedDbPassword("11111111-1111-4111-8111-111111111111", "a-real-password");
  assert.equal(typeof r.ok, "boolean");
  if (!r.ok) assert.equal(typeof r.error, "string");
});

// ─── The storage location is server-only by design ──────────────────────────

test("the credentials table is never granted to authenticated roles", () => {
  const migration = path.resolve(SRC, "../../../supabase/migrations/086_move_cloud_credentials.sql");
  if (!fs.existsSync(migration)) return; // repo layout differs; nothing to assert
  const sql = fs.readFileSync(migration, "utf8");
  assert.match(sql, /REVOKE ALL ON TABLE public\.project_cloud_credentials FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT ALL ON TABLE public\.project_cloud_credentials TO service_role/);
  // A CREATE POLICY here would hand project owners their own service key.
  assert.equal(/CREATE POLICY[\s\S]*project_cloud_credentials/.test(sql), false);
});
