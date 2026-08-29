/**
 * Native project comments (list / create / patch / delete).
 * Plain helpers — not createServerFn (see project-files.ts).
 */
import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import { assertChatAccess } from "../project/chat-access.ts";
import type { Database } from "../../types/database.ts";

type ProfileAuthor = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
};

type CommentRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  parent_id: string | null;
  content: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  element_xpath?: string | null;
  element_tag?: string | null;
  page_path?: string | null;
  element_preview?: string | null;
  is_guest?: boolean;
  guest_name?: string | null;
  pin_x?: number | null;
  pin_y?: number | null;
  pin_color?: string | null;
  client_id?: string | null;
};

const BASE_COLUMNS = `
  id,
  project_id,
  user_id,
  parent_id,
  content,
  resolved,
  resolved_by,
  resolved_at,
  created_at,
  updated_at
`;

const ELEMENT_COLUMNS = `
  element_xpath,
  element_tag,
  page_path,
  element_preview,
  is_guest,
  guest_name
`;

const PIN_LIST_COLUMNS = `
  pin_x,
  pin_y,
  pin_color,
  client_id
`;

function missingOptionalColumn(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /element_xpath|element_tag|page_path|element_preview|is_guest|guest_name|pin_x|pin_y|pin_color|client_id/i.test(
      message,
    ) && /does not exist|schema cache/i.test(message)
  );
}

async function withAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: CommentRow[],
): Promise<Array<CommentRow & { author: ProfileAuthor | null }>> {
  const ids = [
    ...new Set(
      rows
        .map((r) => r.user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, author: null }));
  }
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, email")
    .in("id", ids);
  const byId = new Map<string, ProfileAuthor>(
    ((profiles ?? []) as ProfileAuthor[]).map((p: ProfileAuthor) => [p.id, p]),
  );
  return rows.map((r) => ({
    ...r,
    author: r.user_id ? byId.get(r.user_id) ?? null : null,
  }));
}

async function selectComments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const withPins = await supabase
    .from("project_comments")
    .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS},${PIN_LIST_COLUMNS}`)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!withPins.error) return { data: (withPins.data ?? []) as unknown as CommentRow[], error: null };

  if (!missingOptionalColumn(withPins.error.message)) {
    return { data: [] as CommentRow[], error: withPins.error };
  }

  // Migration 185 (pin_x/pin_y/pin_color/client_id) hasn't run on this
  // database yet — degrade to the element-annotation columns only.
  const full = await supabase
    .from("project_comments")
    .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS}`)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!full.error) {
    const rows = ((full.data ?? []) as CommentRow[]).map((r) => ({
      ...r, pin_x: null, pin_y: null, pin_color: null, client_id: null,
    }));
    return { data: rows, error: null };
  }

  if (!missingOptionalColumn(full.error.message)) {
    return { data: [] as CommentRow[], error: full.error };
  }

  const basic = await supabase
    .from("project_comments")
    .select(BASE_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (basic.error) return { data: [] as CommentRow[], error: basic.error };

  const rows = ((basic.data ?? []) as CommentRow[]).map((r) => ({
    ...r,
    element_xpath: null,
    element_tag: null,
    page_path: null,
    element_preview: null,
    is_guest: false,
    guest_name: null,
    pin_x: null,
    pin_y: null,
    pin_color: null,
    client_id: null,
  }));
  return { data: rows, error: null };
}

export async function listComments(input: { projectId: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "read");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  const { data: rows, error } = await selectComments(supabase, input.projectId);
  if (error) return { status: "error" as const, message: error.message };

  const withAuthor = await withAuthors(supabase, rows);
  return { status: "ok" as const, comments: withAuthor };
}

export async function createComment(input: {
  projectId: string;
  content: string;
  parent_id?: string | null;
  element_xpath?: string | null;
  element_tag?: string | null;
  page_path?: string | null;
  element_preview?: string | null;
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "write");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  const content = input.content.trim();
  if (!content) {
    return { status: "bad_request" as const, error: "Content is required" };
  }

  const baseInsert = {
    project_id: input.projectId,
    user_id: user.id,
    content,
    parent_id: input.parent_id ?? null,
  };

  const withElement = {
    ...baseInsert,
    element_xpath: input.element_xpath ?? null,
    element_tag: input.element_tag ?? null,
    page_path: input.page_path ?? null,
    element_preview: input.element_preview
      ? String(input.element_preview).slice(0, 120)
      : null,
  };

  let result = await supabase
    .from("project_comments")
    .insert(withElement)
    .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS}`)
    .single();

  if (result.error && missingOptionalColumn(result.error.message)) {
    result = await supabase
      .from("project_comments")
      .insert(baseInsert)
      .select(BASE_COLUMNS)
      .single();
    if (!result.error && result.data) {
      result.data = {
        ...result.data,
        element_xpath: null,
        element_tag: null,
        page_path: null,
        element_preview: null,
        is_guest: false,
        guest_name: null,
      };
    }
  }

  if (result.error) return { status: "error" as const, message: result.error.message };

  const [withAuthor] = await withAuthors(supabase, [result.data as CommentRow]);
  return { status: "ok" as const, comment: withAuthor };
}

export async function patchComment(input: {
  projectId: string;
  commentId: string;
  content?: string;
  resolved?: boolean;
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "write");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  const updates: Database["public"]["Tables"]["project_comments"]["Update"] = {};
  if (typeof input.content === "string") {
    const trimmed = input.content.trim();
    if (!trimmed) {
      return { status: "bad_request" as const, error: "Content cannot be empty" };
    }
    updates.content = trimmed;
  }
  if (typeof input.resolved === "boolean") {
    updates.resolved = input.resolved;
    updates.resolved_by = input.resolved ? user.id : null;
    updates.resolved_at = input.resolved ? new Date().toISOString() : null;
  }
  if (Object.keys(updates).length === 0) {
    return { status: "bad_request" as const, error: "Nothing to update" };
  }

  const { data: row, error } = await supabase
    .from("project_comments")
    .update(updates)
    .eq("id", input.commentId)
    .eq("project_id", input.projectId)
    .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS}`)
    .single();

  if (error) return { status: "error" as const, message: error.message };

  const [withAuthor] = await withAuthors(supabase, [row as CommentRow]);
  return { status: "ok" as const, comment: withAuthor };
}

export async function deleteComment(input: { projectId: string; commentId: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "write");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  const { error } = await supabase
    .from("project_comments")
    .delete()
    .eq("id", input.commentId)
    .eq("project_id", input.projectId);

  if (error) return { status: "error" as const, message: error.message };
  return { status: "ok" as const, success: true };
}

// ── Preview pins (src/components/editor/preview-annotations.tsx) ────────────
//
// A pin is a project_comments row with pin_x/pin_y set and a client-chosen
// client_id, unique per project (migration 185). Upserting by client_id lets
// the click-to-annotate UI create AND edit a pin through the same call —
// there's no server-assigned-id round trip to wait on before the next edit
// can be sent, which matters for a component that autosaves on every
// keystroke/color-change/resolve-toggle.

const PIN_COLUMNS = `${BASE_COLUMNS},pin_x,pin_y,pin_color,client_id`;

function missingPinColumn(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /pin_x|pin_y|pin_color|client_id/i.test(message) &&
    /does not exist|schema cache/i.test(message)
  );
}

export async function upsertPinComment(input: {
  projectId: string;
  clientId: string;
  content: string;
  pinX: number;
  pinY: number;
  pinColor: string;
  resolved: boolean;
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "write");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  const content = input.content.trim();
  if (!content) return { status: "bad_request" as const, error: "Content is required" };

  const row = {
    project_id: input.projectId,
    user_id: user.id,
    content,
    client_id: input.clientId,
    pin_x: input.pinX,
    pin_y: input.pinY,
    pin_color: input.pinColor,
    resolved: input.resolved,
    resolved_by: input.resolved ? user.id : null,
    resolved_at: input.resolved ? new Date().toISOString() : null,
  };

  const result = await supabase
    .from("project_comments")
    // client_id/pin_x/pin_y/pin_color aren't in the committed generated
    // Supabase types yet (no live type-regen capability in this
    // environment) — same `as never` pattern used elsewhere in this repo
    // for columns that exist live but aren't reflected there.
    .upsert(row as never, { onConflict: "project_id,client_id" })
    .select(PIN_COLUMNS)
    .single();

  if (result.error) {
    if (missingPinColumn(result.error.message)) {
      // Migration 185 hasn't run yet on this database — degrade to a no-op
      // rather than a hard error so the preview UI can still fall back to
      // its own local cache.
      return { status: "not_supported" as const };
    }
    return { status: "error" as const, message: result.error.message };
  }

  return { status: "ok" as const, comment: result.data };
}

export async function deletePinComment(input: { projectId: string; clientId: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "write");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  const { error } = await supabase
    .from("project_comments")
    .delete()
    .eq("project_id", input.projectId)
    .eq("client_id" as "id", input.clientId);

  if (error) {
    if (missingPinColumn(error.message)) return { status: "not_supported" as const };
    return { status: "error" as const, message: error.message };
  }
  return { status: "ok" as const, success: true };
}
