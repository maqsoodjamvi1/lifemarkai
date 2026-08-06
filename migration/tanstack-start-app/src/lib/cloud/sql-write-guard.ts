/**
 * What the agent is allowed to PROPOSE against a project's live Postgres.
 *
 * ── The asymmetry this is built around ──────────────────────────────────────
 *
 * `isReadOnlySql` (agent-web-tools.ts) governs what runs WITHOUT a human in the
 * loop, and it stays exactly as strict as it is. This module governs what may be
 * put in front of a human for approval, which is a different question with a
 * different failure mode.
 *
 * A read that shouldn't have run leaks a row. A write that shouldn't have run
 * can empty a table belonging to a council or a school, and there is no undo
 * inside the product. So this guard refuses far more than it needs to, and every
 * rule below is written to fail CLOSED: anything it cannot understand with
 * certainty is rejected rather than passed along with a caveat.
 *
 * The rule that earns its place above all others is WHERE-required. `DELETE FROM
 * students` and `UPDATE invoices SET status='paid'` are valid SQL, are one
 * keystroke from their correct versions, and are unrecoverable. Requiring a
 * predicate does not make the mistake impossible — an agent can write
 * `WHERE true` — but it makes it *visible*, in the proposal the human reads,
 * instead of hiding inside an absence.
 *
 * What this module deliberately does NOT do is decide whether the statement is a
 * good idea. That is the human's job, and the row-count preview
 * (sql-write-preview.ts) exists so they can do it with real numbers.
 */

export type SqlWriteKind = "insert" | "update" | "delete";

export interface SqlWriteRejection {
  ok: false;
  /** Shown to the agent so it can rewrite, and logged. */
  reason: string;
}

export interface SqlWriteAccepted {
  ok: true;
  kind: SqlWriteKind;
  /** The statement with any trailing semicolon removed — safe to embed. */
  statement: string;
  /** Table as written, for display. Not resolved or schema-qualified. */
  table: string;
  /**
   * Comments stripped, whitespace collapsed, trailing semicolon removed.
   * Handed to the preview builder so the two never derive it differently.
   */
  normalised: string;
  /**
   * `normalised` with string-literal contents blanked, same length.
   * Index-for-index comparable with `normalised` — the preview finds clause
   * boundaries here and slices them out of `normalised`, so a literal
   * containing the word "where" can never move a boundary.
   */
  masked: string;
}

export type SqlWriteVerdict = SqlWriteAccepted | SqlWriteRejection;

const reject = (reason: string): SqlWriteRejection => ({ ok: false, reason });

/**
 * Schema and transaction keywords that can never legitimately appear inside an
 * INSERT / UPDATE / DELETE, and are catastrophic if one somehow does.
 *
 * This list is a SECOND line of defence, not the first. The real guarantees come
 * from the checks around it: the statement must begin with INSERT/UPDATE/DELETE,
 * there can only be one of them, string literals are masked before any keyword
 * is matched, and dollar-quoting and subqueries are refused outright.
 *
 * Because it is secondary, it is kept deliberately NARROW. An earlier draft
 * included `set`, `do`, `comment`, `copy`, `lock`, `analyze` and others — which
 * rejected `UPDATE t SET …` (every update), `ON CONFLICT DO UPDATE` (every
 * upsert) and any table with a column called `comment`. A guard that blocks the
 * ordinary case gets switched off, and then it guards nothing.
 */
const DDL_AND_PRIVILEGE =
  /\b(drop|alter|truncate|create|grant|revoke|reindex|vacuum|commit|rollback|savepoint|discard|deallocate)\b/i;

/**
 * Strip comments and collapse whitespace so the checks below see one clean line.
 *
 * Comment stripping is a security step, not a cosmetic one: `DELETE FROM t --\n
 * WHERE id=1` is a full-table delete wearing a predicate, and without this the
 * WHERE check would pass it.
 */
function normalise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Blank out single-quoted string literals, preserving length.
 *
 * Every keyword check runs against this masked form, so a row whose content
 * happens to contain the word "where", "drop" or a semicolon cannot influence
 * whether the statement is accepted. Dollar-quoting is not unmasked — it is
 * rejected outright below, because matching `$tag$ … $tag$` correctly is more
 * subtlety than this guard should carry.
 */
function maskParts(sql: string): { masked: string; unterminated: boolean } {
  let masked = "";
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { masked += "  "; i++; continue; }
        inStr = false;
        masked += "'";
      } else {
        masked += " ";
      }
      continue;
    }
    if (ch === "'") { inStr = true; masked += "'"; continue; }
    masked += ch;
  }
  return { masked, unterminated: inStr };
}

/** `public.invoices`, `"my table"`, `invoices` — as written, for display only. */
const TABLE_AFTER =
  /^(?:insert\s+into|update|delete\s+from)\s+((?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))?)/i;

/**
 * Decide whether a statement may be shown to a human for approval.
 *
 * Fails closed on every ambiguity. The `reason` is written for the agent to read
 * and act on, because the agent is the one that has to produce something better.
 */
export function classifySqlWrite(raw: string): SqlWriteVerdict {
  if (typeof raw !== "string" || !raw.trim()) return reject("Empty statement.");
  if (raw.length > 8000) return reject("Statement is too long to review safely (max 8000 characters).");

  const cleaned = normalise(raw);
  if (!cleaned) return reject("Statement is only comments.");

  const { masked, unterminated } = maskParts(cleaned);
  if (unterminated) return reject("Unterminated string literal.");

  // Dollar-quoting hides arbitrary text from the literal masker above, which
  // would make every keyword check below unreliable. Refuse rather than parse.
  if (/\$[A-Za-z_]*\$/.test(masked)) return reject("Dollar-quoted strings are not allowed in a proposed write.");

  // One statement. A trailing semicolon is fine; an interior one is smuggling.
  const body = masked.endsWith(";") ? masked.slice(0, -1) : masked;
  if (body.includes(";")) return reject("Only one statement may be proposed at a time.");

  const kindMatch = /^(insert\s+into|update|delete\s+from)\b/i.exec(body);
  if (!kindMatch) {
    return reject(
      "Only INSERT INTO, UPDATE or DELETE FROM may be proposed. Reads run directly through db_query; schema changes belong in a migration file.",
    );
  }
  const head = kindMatch[1].toLowerCase();
  const kind: SqlWriteKind = head.startsWith("insert") ? "insert" : head.startsWith("update") ? "update" : "delete";

  // DDL is checked on the MASKED body so a row containing the word "drop"
  // cannot trip it, and so `DELETE FROM t WHERE x=1; DROP TABLE t` — already
  // caught above — has a second line of defence if the first ever regresses.
  // The leading keyword is removed first so `DELETE`/`UPDATE` don't self-match.
  const afterHead = body.slice(kindMatch[0].length);
  const ddl = DDL_AND_PRIVILEGE.exec(afterHead);
  if (ddl) return reject(`\`${ddl[0].toUpperCase()}\` is not allowed in a proposed write. Schema and permission changes belong in a migration file.`);

  // The rule that matters most.
  if (kind !== "insert" && !/\bwhere\b/i.test(afterHead)) {
    return reject(
      `A ${kind.toUpperCase()} without a WHERE clause would affect every row in the table. Add a predicate. If you genuinely mean every row, write it explicitly as \`WHERE true\` so the person approving can see that.`,
    );
  }

  // A subquery makes the row-count preview and human review much harder to
  // reason about, and is almost never needed for the operational fixes this
  // tool exists for. Refuse it; the agent can read first and write literals.
  if (/\bselect\b/i.test(afterHead)) {
    return reject("Subqueries are not allowed in a proposed write. Read the values first with db_query, then propose a write using literal values.");
  }

  // RETURNING would collide with the preview wrapper, which appends its own.
  if (/\breturning\b/i.test(afterHead)) {
    return reject("Remove the RETURNING clause — the affected rows are reported automatically.");
  }

  const tableMatch = TABLE_AFTER.exec(body);
  if (!tableMatch) return reject("Could not identify the target table.");

  // Return the ORIGINAL text (semicolon trimmed), not the masked or collapsed
  // form — the human approves what will actually run, character for character.
  const statement = raw.trim().replace(/;\s*$/, "");
  const normalised = cleaned.replace(/;\s*$/, "");
  return {
    ok: true,
    kind,
    statement,
    table: tableMatch[1].replace(/\s*\.\s*/, "."),
    normalised,
    masked: body,
  };
}
