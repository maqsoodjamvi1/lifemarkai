/**
 * Pure logic behind src/components/editor/preview-annotations.tsx's pin
 * sync — pulled out of the component so the row→Annotation mapping and the
 * change-detection used to decide what to upsert/delete can be unit tested
 * without mounting React or a network layer.
 */

export interface Annotation {
  id: string;
  x: number; // percent of container width
  y: number; // percent of container height
  text: string;
  color: string;
  createdAt: string;
  resolved: boolean;
}

/** Shape of a project_comments row as returned by GET /api/projects/:id/comments. */
export interface PinCommentRow {
  client_id?: string | null;
  id: string;
  pin_x?: number | null;
  pin_y?: number | null;
  pin_color?: string | null;
  content: string;
  created_at: string;
  resolved: boolean;
}

/**
 * Maps a project_comments row to the preview-pin shape, or null when the
 * row isn't a pin at all (a regular threaded comment has no pin_x/pin_y).
 * Prefers the client-chosen id (client_id) over the server row id so a pin
 * this client itself created keeps the same id it used to create it with.
 */
export function rowToAnnotation(row: PinCommentRow): Annotation | null {
  if (typeof row.pin_x !== "number" || typeof row.pin_y !== "number") return null;
  return {
    id: row.client_id || row.id,
    x: row.pin_x,
    y: row.pin_y,
    text: row.content,
    color: row.pin_color || "yellow",
    createdAt: row.created_at,
    resolved: row.resolved,
  };
}

/** Comparable signature of the fields the server needs to know about. */
export function signature(a: Annotation): string {
  return JSON.stringify([a.x, a.y, a.text, a.color, a.resolved]);
}

/**
 * Diffs the current annotation list against a map of last-synced signatures
 * (mutated in place by the caller as each sync call resolves) to decide
 * what needs an upsert vs. a delete. Pure and side-effect-free so the sync
 * decision itself — not just the network calls it drives — is testable.
 */
export function diffForSync(
  annotations: Annotation[],
  synced: Map<string, string>,
): { toUpsert: Annotation[]; toDeleteIds: string[] } {
  const currentIds = new Set(annotations.map((a) => a.id));
  const toUpsert = annotations.filter((a) => synced.get(a.id) !== signature(a));
  const toDeleteIds = [...synced.keys()].filter((id) => !currentIds.has(id));
  return { toUpsert, toDeleteIds };
}
