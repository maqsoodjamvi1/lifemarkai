import test from "node:test";
import assert from "node:assert/strict";
import { planSqlWrite } from "./sql-write-preview.ts";

const plan = (sql: string) => {
  const p = planSqlWrite(sql);
  assert.equal(p.ok, true, `expected a plan, got: ${p.ok ? "" : p.reason}`);
  return p as Extract<typeof p, { ok: true }>;
};
const refused = (sql: string, expect?: RegExp) => {
  const p = planSqlWrite(sql);
  assert.equal(p.ok, false, `expected refusal, got a plan for: ${sql}`);
  if (expect && !p.ok) assert.match(p.reason, expect, sql);
};

// ─── The count query must select the same rows the write touches ────────────

test("an UPDATE becomes a count over the same table and predicate", () => {
  const p = plan("UPDATE profiles SET role = 'hr' WHERE department_id = 4 AND active = true");
  assert.equal(
    p.countQuery,
    "SELECT count(*)::bigint AS affected FROM profiles WHERE department_id = 4 AND active = true",
  );
});

test("a DELETE becomes a count over the same table and predicate", () => {
  const p = plan("DELETE FROM sessions WHERE user_id = 'abc' AND expired = true");
  assert.equal(
    p.countQuery,
    "SELECT count(*)::bigint AS affected FROM sessions WHERE user_id = 'abc' AND expired = true",
  );
});

test("a schema-qualified table is preserved in the count", () => {
  const p = plan("UPDATE public.feature_flags SET enabled = true WHERE key = 'minutes'");
  assert.match(p.countQuery ?? "", /FROM public\.feature_flags WHERE key = 'minutes'$/);
});

test("a literal containing the word where does not move the boundary", () => {
  // The boundary is found on the masked text and applied to the real text, so
  // the predicate is the real one even though an earlier literal says "where".
  const p = plan("UPDATE notes SET body = 'tell me where it hurts' WHERE id = 7");
  assert.equal(p.countQuery, "SELECT count(*)::bigint AS affected FROM notes WHERE id = 7");
});

test("the predicate keeps its own string literals intact", () => {
  const p = plan("DELETE FROM logs WHERE message = 'where are you' AND id = 3");
  assert.equal(
    p.countQuery,
    "SELECT count(*)::bigint AS affected FROM logs WHERE message = 'where are you' AND id = 3",
  );
});

test("explicit whole-table intent produces an honest full-table count", () => {
  const p = plan("UPDATE flags SET enabled = false WHERE true");
  assert.equal(p.countQuery, "SELECT count(*)::bigint AS affected FROM flags WHERE true");
});

// ─── INSERT counts statically ───────────────────────────────────────────────

test("a single-row INSERT is one row, with no query needed", () => {
  const p = plan("INSERT INTO user_roles (user_id, role) VALUES ('abc', 'pa')");
  assert.equal(p.staticCount, 1);
  assert.equal(p.countQuery, null);
});

test("a multi-row INSERT counts its tuples", () => {
  const p = plan("INSERT INTO user_roles (user_id, role) VALUES ('a','x'), ('b','y'), ('c','z')");
  assert.equal(p.staticCount, 3);
});

test("a function call inside a tuple does not inflate the count", () => {
  // Depth tracking, not a paren count — `(now(), 'x')` is one row, not two.
  const p = plan("INSERT INTO audit (at, who) VALUES (now(), 'abc')");
  assert.equal(p.staticCount, 1);
});

test("nested parens across several tuples still count correctly", () => {
  const p = plan("INSERT INTO t (a, b) VALUES (coalesce(now(), now()), 1), (now(), 2)");
  assert.equal(p.staticCount, 2);
});

test("an INSERT with no VALUES list is refused rather than guessed", () => {
  refused("INSERT INTO t DEFAULT VALUES", /plain `VALUES/i);
});

// ─── Shapes that cannot be counted exactly are refused ──────────────────────

test("UPDATE ... FROM is refused", () => {
  refused(
    "UPDATE invoices SET paid = true FROM students WHERE invoices.student_id = students.id",
    /cannot be counted exactly/i,
  );
});

test("DELETE ... USING is refused", () => {
  refused(
    "DELETE FROM invoices USING students WHERE invoices.student_id = students.id",
    /cannot be counted exactly/i,
  );
});

test("a table named `from` in the predicate does not trigger the FROM refusal", () => {
  // The FROM check only looks at the text BEFORE the WHERE, so a predicate
  // mentioning a column called from_date is unaffected.
  const p = plan("DELETE FROM bookings WHERE from_date < '2020-01-01'");
  assert.match(p.countQuery ?? "", /WHERE from_date < '2020-01-01'$/);
});

// ─── Everything the guard refuses, the planner refuses too ──────────────────

test("the planner runs the guard, so callers cannot skip it", () => {
  refused("DELETE FROM students", /without a WHERE/i);
  refused("DROP TABLE students", /INSERT INTO, UPDATE or DELETE/i);
  refused("DELETE FROM a WHERE id = 1; DROP TABLE b", /one statement/i);
  refused("SELECT * FROM students", /INSERT INTO, UPDATE or DELETE/i);
});

// ─── The approved statement is never rewritten ──────────────────────────────

test("the statement carried into the plan is the original text", () => {
  const sql = "UPDATE   profiles\n  SET role = 'hr'\n  WHERE id = 'abc'";
  const p = plan(sql);
  assert.equal(p.statement, sql.trim());
  // ...while the count query is built from the normalised form.
  assert.equal(p.countQuery, "SELECT count(*)::bigint AS affected FROM profiles WHERE id = 'abc'");
});
