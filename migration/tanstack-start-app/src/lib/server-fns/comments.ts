/**
 * Native project comments (list / create / patch / delete).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { assertChatAccess } from "@/lib/project/chat-access";

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

function missingOptionalColumn(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /element_xpath|element_tag|page_path|element_preview|is_guest|guest_name/i.test(
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
  const { data: profiles } = await (supabase as any)
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
  const full = await (supabase as any)
    .from("project_comments")
    .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS}`)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!full.error) return { data: (full.data ?? []) as CommentRow[], error: null };

  if (!missingOptionalColumn(full.error.message)) {
    return { data: [] as CommentRow[], error: full.error };
  }

  const basic = await (supabase as any)
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
  }));
  return { data: rows, error: null };
}

export const listComments = createServerFn({ method: "GET" })
  .validator(zodValidator(z.object({ projectId: z.string().uuid() })))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "read");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const { data: rows, error } = await selectComments(supabase, data.projectId);
    if (error) return { status: "error" as const, message: error.message };

    const withAuthor = await withAuthors(supabase, rows);
    return { status: "ok" as const, comments: withAuthor };
  });

export const createComment = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        content: z.string().min(1).max(4000),
        parent_id: z.string().uuid().nullable().optional(),
        element_xpath: z.string().nullable().optional(),
        element_tag: z.string().nullable().optional(),
        page_path: z.string().nullable().optional(),
        element_preview: z.string().nullable().optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const content = data.content.trim();
    if (!content) {
      return { status: "bad_request" as const, error: "Content is required" };
    }

    const baseInsert = {
      project_id: data.projectId,
      user_id: user.id,
      content,
      parent_id: data.parent_id ?? null,
    };

    const withElement = {
      ...baseInsert,
      element_xpath: data.element_xpath ?? null,
      element_tag: data.element_tag ?? null,
      page_path: data.page_path ?? null,
      element_preview: data.element_preview
        ? String(data.element_preview).slice(0, 120)
        : null,
    };

    let result = await (supabase as any)
      .from("project_comments")
      .insert(withElement)
      .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS}`)
      .single();

    if (result.error && missingOptionalColumn(result.error.message)) {
      result = await (supabase as any)
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
  });

export const patchComment = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        commentId: z.string().uuid(),
        content: z.string().optional(),
        resolved: z.boolean().optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const updates: Record<string, unknown> = {};
    if (typeof data.content === "string") {
      const trimmed = data.content.trim();
      if (!trimmed) {
        return { status: "bad_request" as const, error: "Content cannot be empty" };
      }
      updates.content = trimmed;
    }
    if (typeof data.resolved === "boolean") {
      updates.resolved = data.resolved;
      updates.resolved_by = data.resolved ? user.id : null;
      updates.resolved_at = data.resolved ? new Date().toISOString() : null;
    }
    if (Object.keys(updates).length === 0) {
      return { status: "bad_request" as const, error: "Nothing to update" };
    }

    const { data: row, error } = await (supabase as any)
      .from("project_comments")
      .update(updates)
      .eq("id", data.commentId)
      .eq("project_id", data.projectId)
      .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS}`)
      .single();

    if (error) return { status: "error" as const, message: error.message };

    const [withAuthor] = await withAuthors(supabase, [row as CommentRow]);
    return { status: "ok" as const, comment: withAuthor };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        commentId: z.string().uuid(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const { error } = await (supabase as any)
      .from("project_comments")
      .delete()
      .eq("id", data.commentId)
      .eq("project_id", data.projectId);

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, success: true };
  });
