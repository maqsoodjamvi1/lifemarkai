import test from "node:test";
import assert from "node:assert/strict";
import { classifySqlWrite } from "./sql-write-guard.ts";

const ok = (sql: string) => {
  const v = classifySqlWrite(sql);
  assert.equal(v.ok, true, `expected accepted, got: ${v.ok ? "" : v.reason} — ${sql}`);
  return v as Extract<typeof v, { ok: true }>;
};
const no = (sql: string, expect?: RegExp) => {
  const v = classifySqlWrite(sql);
  assert.equal(v.ok, false, `expected REJECTED but it was accepted: ${sql}`);
  if (expect && !v.ok) assert.match(v.reason, expect, sql);
  return v as Extract<typeof v, { ok: false }>;
};

// ─── The catastrophic cases. These are why the module exists. ───────────────

test("a DELETE with no WHERE is refused", () => {
  no("DELETE FROM students", /without a WHERE/i);
  no("delete from public.invoices;", /without a WHERE/i);
});

test("an UPDATE with no WHERE is refused", () => {
  no("UPDATE invoices SET status = 'paid'", /without a WHERE/i);
});

test("a WHERE hidden behind a line comment does not count", () => {
  // `DELETE FROM t --\nWHERE id=1` is a full-table delete wearing a predicate.
  // Comment stripping happens before the WHERE check for exactly this reason.
  no("DELETE FROM students -- WHERE id = 1", /without a WHERE/i);
  no("DELETE FROM students /* WHERE id = 1 */", /without a WHERE/i);
});

test("a WHERE that exists only inside a string literal does not count", () => {
  no("UPDATE notes SET body = 'tell me where it hurts'", /without a WHERE/i);
});

test("explicit whole-table intent is allowed through, because it is now visible", () => {
  // The point of the rule is not to make this impossible — it is to force the
  // agent to write something the approver will read and question.
  const v = ok("UPDATE flags SET enabled = false WHERE true");
  assert.equal(v.kind, "update");
});

// ─── Statement smuggling ────────────────────────────────────────────────────

test("a second statement is refused", () => {
  no("DELETE FROM sessions WHERE id = 1; DROP TABLE students", /one statement/i);
  no("UPDATE a SET b = 1 WHERE c = 2; UPDATE d SET e = 3 WHERE f = 4", /one statement/i);
});

test("a semicolon inside a string literal is not a second statement", () => {
  ok("UPDATE notes SET body = 'a; b; c' WHERE id = 7");
});

test("a trailing semicolon is fine and is stripped", () => {
  const v = ok("DELETE FROM sessions WHERE id = 1;");
  assert.equal(v.statement.endsWith(";"), false);
});

test("an unterminated string is refused", () => {
  no("UPDATE notes SET body = 'oops WHERE id = 1", /unterminated/i);
});

test("escaped quotes inside a literal are handled", () => {
  ok("UPDATE staff SET name = 'O''Brien' WHERE id = 3");
});

test("dollar-quoted strings are refused outright", () => {
  no("UPDATE fn SET body = $$ anything at all $$ WHERE id = 1", /dollar-quoted/i);
  no("UPDATE fn SET body = $tag$ x $tag$ WHERE id = 1", /dollar-quoted/i);
});

// ─── Schema and privilege changes ───────────────────────────────────────────

test("DDL is refused", () => {
  for (const sql of [
    "DROP TABLE students",
    "TRUNCATE invoices",
    "ALTER TABLE staff ADD COLUMN x int",
    "CREATE TABLE t (id int)",
    "GRANT ALL ON students TO anon",
    "REVOKE SELECT ON students FROM authenticated",
  ]) {
    no(sql);
  }
});

test("transaction control is refused", () => {
  no("BEGIN", /INSERT INTO, UPDATE or DELETE/i);
  no("UPDATE t SET a = 1 WHERE b = 2 COMMIT", /COMMIT/i);
});

test("a row whose content contains a DDL word is still allowed", () => {
  // Masking literals is what makes this safe rather than a false positive.
  ok("UPDATE articles SET title = 'How to drop a table safely' WHERE id = 12");
  ok("INSERT INTO logs (message) VALUES ('user ran TRUNCATE on staging')");
});

// ─── Reads, subqueries, RETURNING ───────────────────────────────────────────

test("a SELECT is refused — reads go through db_query", () => {
  no("SELECT * FROM students", /INSERT INTO, UPDATE or DELETE/i);
});

test("a subquery is refused", () => {
  no("DELETE FROM invoices WHERE student_id IN (SELECT id FROM students WHERE year = 2020)", /subquer/i);
  no("UPDATE a SET b = (SELECT max(c) FROM d) WHERE e = 1", /subquer/i);
});

test("RETURNING is refused because the preview appends its own", () => {
  no("DELETE FROM sessions WHERE id = 1 RETURNING id", /RETURNING/i);
});

// ─── The ordinary cases must actually work ──────────────────────────────────

test("the operational fixes this exists for are accepted", () => {
  const cases: Array<[string, string, string]> = [
    ["UPDATE profiles SET department_id = 4, role = 'hr' WHERE id = 'abc-123'", "update", "profiles"],
    ["DELETE FROM user_roles WHERE user_id = 'abc' AND role = 'viewer'", "delete", "user_roles"],
    ["INSERT INTO user_roles (user_id, role) VALUES ('abc', 'pa')", "insert", "user_roles"],
    ["UPDATE public.feature_flags SET enabled = true WHERE key = 'minutes'", "update", "public.feature_flags"],
  ];
  for (const [sql, kind, table] of cases) {
    const v = ok(sql);
    assert.equal(v.kind, kind, sql);
    assert.equal(v.table, table, sql);
  }
});

test("a quoted table name survives", () => {
  const v = ok(`UPDATE "user profiles" SET x = 1 WHERE id = 2`);
  assert.equal(v.table, `"user profiles"`);
});

test("the accepted statement is the original text, not a normalised copy", () => {
  // The human approves exactly what runs. Reformatting it — even harmlessly —
  // means the string they read is not the string that executes.
  const sql = "UPDATE   profiles\n   SET role = 'hr'\n   WHERE id = 'abc'";
  const v = ok(sql);
  assert.equal(v.statement, sql.trim());
});

// ─── Degenerate input ───────────────────────────────────────────────────────

test("empty, whitespace and comment-only input is refused", () => {
  no("", /empty/i);
  no("   ", /empty/i);
  no("-- just a note", /only comments/i);
});

test("absurdly long input is refused before anything tries to parse it", () => {
  no("UPDATE t SET a = 1 WHERE b = " + "9".repeat(8000), /too long/i);
});

test("a non-string never throws", () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    const v = classifySqlWrite(bad as unknown as string);
    assert.equal(v.ok, false);
  }
});

test("case and whitespace do not defeat any rule", () => {
  no("dElEtE   fRoM   students", /without a WHERE/i);
  no("  DELETE\n\tFROM\n students  ", /without a WHERE/i);
  ok("dElEtE fRoM sessions wHeRe id = 1");
});
