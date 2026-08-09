/**
 * "This will change N rows" — and N is exact, or there is no proposal.
 *
 * ── Why exactness is non-negotiable ─────────────────────────────────────────
 *
 * The whole approval flow rests on one number. A person glancing at a proposal
 * decides in about two seconds, and they decide on the count: 1 is fine, 4,000
 * is not. If that number can be wrong — even occasionally, even slightly — then
 * every approval it ever collected was uninformed, and the flow is worse than
 * having no flow, because it manufactures confidence.
 *
 * So this module has exactly two outcomes: an exact count, or a refusal. There
 * is no estimate, no "approximately", and no EXPLAIN-based guess. Every shape of
 * statement it cannot count precisely is rejected back to the agent, which can
 * rewrite it as something simpler.
 *
 * ── Why it counts with a SELECT rather than a rolled-back write ─────────────
 *
 * The obvious approach is to run the real statement inside BEGIN … ROLLBACK and
 * report the rows it touched. That is exact by construction, and it also
 * validates the statement against the real schema. It was not used because the
 * Supabase Management API's /database/query endpoint gives no contract about
 * multi-statement bodies or which statement's rows come back, and a preview that
 * silently reports the wrong statement's result is the precise failure this
 * module exists to prevent. A rolled-back write also has to actually take row
 * locks on production data to count them.
 *
 * The SELECT approach is safe to reason about because of what the guard has
 * already forbidden. There are no subqueries, so there is exactly one WHERE in
 * the statement. There is no dollar-quoting, so literals mask cleanly. There is
 * one statement. Under those constraints, finding the predicate is not really
 * parsing SQL — it is finding the one unmasked `WHERE`.
 */
import { classifySqlWrite,type SqlWriteVerdict } from "./sql-write-guard.ts";

export interface SqlWritePlan {
  ok: true;
  kind: "insert" | "update" | "delete";
  table: string;
  /** Exactly what will run on approval. */
  statement: string;
  /**
   * A read-only statement whose single value is the exact number of rows the
   * write will affect. Null for INSERT, where the count is known statically.
   */
  countQuery: string | null;
  /** Known without asking the database. INSERT only. */
  staticCount: number | null;
}

export interface SqlWritePlanRejected {
  ok: false;
  reason: string;
}

export type SqlWritePlanResult = SqlWritePlan | SqlWritePlanRejected;

const reject = (reason: string): SqlWritePlanRejected => ({ ok: false, reason });

/** Index of the sole top-level WHERE, found on the masked text. -1 if absent. */
function whereIndex(masked: string): number {
  const m = /\bwhere\b/i.exec(masked);
  return m ? m.index : -1;
}

/**
 * Count the tuples in a plain `VALUES (…), (…)` list.
 *
 * Depth-aware so a tuple containing a function call — `VALUES (now(), 'x')` —
 * counts once rather than twice. Returns null for anything that is not a simple
 * VALUES list, which is then refused rather than guessed at.
 */
function countValuesTuples(masked: string): number | null {
  const vm = /\bvalues\b/i.exec(masked);
  if (!vm) return null;
  let depth = 0;
  let tuples = 0;
  for (let i = vm.index + vm[0].length; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "(") {
      if (depth === 0) tuples++;
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth < 0) return null; // unbalanced — refuse
    }
  }
  if (depth !== 0) return null;
  return tuples > 0 ? tuples : null;
}

/**
 * Turn a validated write into a plan a human can approve.
 *
 * Runs the guard first, so callers never need to remember to.
 */
export function planSqlWrite(raw: string): SqlWritePlanResult {
  const verdict: SqlWriteVerdict = classifySqlWrite(raw);
  if (!verdict.ok) return reject(verdict.reason);

  const { kind, table, statement, normalised, masked } = verdict;

  if (kind === "insert") {
    // `INSERT … SELECT` is already refused by the guard, so the only shape left
    // is a literal VALUES list, and its length is the row count.
    const tuples = countValuesTuples(masked);
    if (tuples == null) {
      return reject(
        "Could not determine how many rows this INSERT adds. Write it as a plain `VALUES (…)` list so the number of rows can be shown before approval.",
      );
    }
    return { ok: true, kind, table, statement, countQuery: null, staticCount: tuples };
  }

  // UPDATE … FROM and DELETE … USING join against other tables, which changes
  // the affected count in ways a single-table SELECT cannot reproduce. Refuse
  // rather than show a number that is confidently wrong.
  const head = masked.slice(0, whereIndex(masked) === -1 ? masked.length : whereIndex(masked));
  if (kind === "update" && /\bfrom\b/i.test(head)) {
    return reject("`UPDATE … FROM` cannot be counted exactly before it runs. Read the rows first with db_query, then propose a write keyed on their ids.");
  }
  if (kind === "delete" && /\busing\b/i.test(head)) {
    return reject("`DELETE … USING` cannot be counted exactly before it runs. Read the rows first with db_query, then propose a delete keyed on their ids.");
  }

  const wi = whereIndex(masked);
  // The guard guarantees a WHERE exists on update/delete; this is belt and
  // braces so a future change there cannot silently produce a full-table count.
  if (wi === -1) return reject("Internal: no WHERE clause found on a statement that requires one.");

  // Slice the ORIGINAL normalised text at an index found on the MASKED text.
  // Same length, so the index is valid in both, and a literal containing the
  // word "where" cannot move the boundary.
  const predicate = normalised.slice(wi + "where".length).trim();
  if (!predicate) return reject("The WHERE clause is empty.");

  return {
    ok: true,
    kind,
    table,
    statement,
    countQuery: `SELECT count(*)::bigint AS affected FROM ${table} WHERE ${predicate}`,
    staticCount: null,
  };
}
