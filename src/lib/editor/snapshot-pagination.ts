/**
 * Pure pagination logic behind the version-history list (History panel +
 * src/lib/server-fns/snapshots.ts's listOrGetSnapshot). Pulled out so the
 * cursor math and page-merge logic — the part that turns "cap at 50" into
 * "scroll for more, like Lovable" — are unit tested without a database.
 *
 * Pinned snapshots are always returned in full on the first page (there are
 * normally few of them, and a user expects every pin to be visible, not
 * just the most recent 50) — only non-pinned snapshots are paginated by a
 * created_at keyset cursor.
 */

export interface SnapshotPageRow {
  id: string;
  created_at: string | null;
}

/**
 * The cursor to request the next page with, or null when this page wasn't
 * full — a short page means there's nothing more to fetch.
 */
export function computeNextCursor(nonPinnedRows: SnapshotPageRow[], limit: number): string | null {
  if (nonPinnedRows.length < limit) return null;
  return nonPinnedRows[nonPinnedRows.length - 1]?.created_at ?? null;
}

/**
 * Appends a newly-fetched page onto the list already held in state,
 * dropping any row whose id is already present — a snapshot pinned or
 * deleted between page loads (or the keyset boundary landing on a
 * millisecond shared by two rows) shouldn't show up twice.
 */
export function mergeSnapshotPage<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((s) => s.id));
  const deduped = incoming.filter((s) => !seen.has(s.id));
  return [...existing, ...deduped];
}
