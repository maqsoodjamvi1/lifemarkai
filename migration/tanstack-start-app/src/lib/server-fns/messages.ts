/**
 * Native project messages — list / persist / truncate / restore / clear.
 * Plain helpers — not createServerFn (see project-files.ts).
 */
import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import { assertChatAccess } from "../project/chat-access.ts";
import { persistChatTurnMessages } from "../ai/persist-chat-turn.ts";

function toPersistedMessageMode(mode: string | null | undefined): "chat" | "agent" | "plan" | "build" {
  if (mode === "agent" || mode === "plan" || mode === "build" || mode === "chat") return mode;
  if (mode === "patch") return "build";
  return "chat";
}

function sanitizeMessageContent(role: string, content: unknown): string {
  const text = typeof content === "string" ? content.trim() : "";
  if (text) return text;
  return role === "user" ? "(empty message)" : "Changes applied.";
}

export async function listMessages(data: {
  projectId: string;
  before?: string;
  limit?: number;
}) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "read");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const limit = data.limit ?? 100;
    let query = (supabase as any)
      .from("messages")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (data.before) query = query.lt("created_at", data.before);

    const { data: rows, error } = await query;
    if (error) return { status: "error" as const, message: error.message };

    const list = rows ?? [];
    const hasMore = list.length > limit;
    const page = (hasMore ? list.slice(0, limit) : list).reverse();
    return { status: "ok" as const, messages: page, hasMore };
}

export async function postMessages(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    if (data.truncate === true) {
      let fromCreatedAt = data.fromCreatedAt ?? null;
      const includePivot = data.includePivot !== false;

      if (!fromCreatedAt && data.afterMessageId) {
        const { data: pivot, error: pivotErr } = await (supabase as any)
          .from("messages")
          .select("id, created_at")
          .eq("id", data.afterMessageId)
          .eq("project_id", data.projectId)
          .maybeSingle();
        if (pivotErr) return { status: "error" as const, message: pivotErr.message };
        if (!pivot) return { status: "not_found" as const, error: "Pivot message not found" };
        fromCreatedAt = pivot.created_at;
      }
      if (!fromCreatedAt) {
        return {
          status: "error" as const,
          message: "afterMessageId or fromCreatedAt required for truncate",
        };
      }

      let del = (supabase as any)
        .from("messages")
        .delete({ count: "exact" })
        .eq("project_id", data.projectId);
      del = includePivot
        ? del.gte("created_at", fromCreatedAt)
        : del.gt("created_at", fromCreatedAt);
      const { error, count } = await del;
      if (error) return { status: "error" as const, message: error.message };
      return { status: "ok" as const, truncated: true, deleted: count ?? null };
    }

    const rows = data.messages ?? [];
    if (rows.length === 0) {
      return { status: "error" as const, message: "messages required" };
    }

    if (data.restore === true) {
      const payload = rows
        .filter((m: any) => m.id && m.content != null)
        .map((m: any) => ({
          id: m.id,
          project_id: data.projectId,
          role: m.role,
          content: sanitizeMessageContent(m.role, m.content),
          mode: toPersistedMessageMode(m.mode),
          tokens_used: m.tokens_used ?? null,
          model: m.model ?? null,
          metadata: m.metadata ?? null,
          rating: m.rating ?? null,
          ...(m.created_at ? { created_at: m.created_at } : {}),
        }));
      if (payload.length === 0) {
        return { status: "error" as const, message: "messages required" };
      }
      const { data: restored, error } = await (supabase as any)
        .from("messages")
        .upsert(payload, { onConflict: "id" })
        .select("id");
      if (error) return { status: "error" as const, message: error.message };
      return { status: "ok" as const, restored: restored?.length ?? payload.length };
    }

    const result = await persistChatTurnMessages(
      supabase,
      rows.map((m: any) => ({
        project_id: data.projectId,
        role: m.role,
        content: m.content,
        mode: toPersistedMessageMode(m.mode),
        tokens_used: m.tokens_used ?? null,
        model: m.model ?? null,
        metadata: m.metadata ?? null,
      })),
      { projectId: data.projectId, label: "client-fallback" },
    );

    if (result.error) {
      return { status: "error" as const, message: "Failed to persist messages" };
    }
    return {
      status: "ok" as const,
      assistantMessageId: result.assistantMessageId ?? null,
    };
}

export async function clearMessages(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const { error } = await (supabase as any)
      .from("messages")
      .delete()
      .eq("project_id", data.projectId);
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const };
}

export async function patchMessage(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const { data: row, error: fetchError } = await (supabase as any)
      .from("messages")
      .select("id, metadata, rating")
      .eq("id", data.messageId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (fetchError) return { status: "error" as const, message: fetchError.message };
    if (!row) return { status: "not_found" as const };

    const update: Record<string, unknown> = {};
    if ("rating" in data) update.rating = data.rating ?? null;
    if ("metadata" in data) {
      if (data.mergeMetadata !== false && data.metadata && typeof data.metadata === "object") {
        const prev =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {};
        update.metadata = { ...prev, ...data.metadata };
      } else {
        update.metadata = data.metadata ?? null;
      }
    }
    if (Object.keys(update).length === 0) {
      return { status: "error" as const, message: "No fields to update" };
    }

    const { data: message, error } = await (supabase as any)
      .from("messages")
      .update(update)
      .eq("id", data.messageId)
      .eq("project_id", data.projectId)
      .select("*")
      .single();
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, message };
}

export async function deleteMessage(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const { error } = await (supabase as any)
      .from("messages")
      .delete()
      .eq("id", data.messageId)
      .eq("project_id", data.projectId);
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const };
}
