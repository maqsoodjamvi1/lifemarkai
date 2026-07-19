// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sanitizeMessageContent, toPersistedMessageMode } from "@/lib/ai/persist-message-mode";
import { persistChatTurnMessages } from "@/lib/ai/persist-chat-turn";
import { assertChatAccess } from "@/lib/project/chat-access";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "read");
  if ("error" in access) return access.error;

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

  let query = (supabase as any)
    .from("messages")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();

  return NextResponse.json({ messages: page, hasMore });
}

/** Client fallback when the SSE turn finishes without assistantMessageId.
 *  Also supports:
 *  - undo restore: `{ restore: true, messages: [...] }` with original ids
 *  - edit-past truncate: `{ truncate: true, afterMessageId }` or `{ truncate: true, fromCreatedAt }`
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "write");
  if ("error" in access) return access.error;

  let body: {
    restore?: boolean;
    truncate?: boolean;
    afterMessageId?: string;
    fromCreatedAt?: string;
    includePivot?: boolean;
    messages?: Array<{
      id?: string;
      role: "user" | "assistant" | "system";
      content: string;
      mode?: string;
      tokens_used?: number | null;
      model?: string | null;
      metadata?: Record<string, unknown> | null;
      rating?: 1 | -1 | null;
      created_at?: string;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Edit-past / regenerate — delete messages at/after a pivot.
  if (body.truncate === true) {
    let fromCreatedAt = typeof body.fromCreatedAt === "string" ? body.fromCreatedAt : null;
    const afterMessageId = typeof body.afterMessageId === "string" ? body.afterMessageId : null;
    const includePivot = body.includePivot !== false;

    if (!fromCreatedAt && afterMessageId) {
      const { data: pivot, error: pivotErr } = await (supabase as any)
        .from("messages")
        .select("id, created_at")
        .eq("id", afterMessageId)
        .eq("project_id", id)
        .maybeSingle();
      if (pivotErr) {
        return NextResponse.json({ error: pivotErr.message }, { status: 500 });
      }
      if (!pivot) {
        return NextResponse.json({ error: "Pivot message not found" }, { status: 404 });
      }
      fromCreatedAt = pivot.created_at;
    }

    if (!fromCreatedAt) {
      return NextResponse.json(
        { error: "afterMessageId or fromCreatedAt required for truncate" },
        { status: 400 },
      );
    }

    let del = (supabase as any)
      .from("messages")
      .delete({ count: "exact" })
      .eq("project_id", id);

    del = includePivot ? del.gte("created_at", fromCreatedAt) : del.gt("created_at", fromCreatedAt);

    const { error, count } = await del;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, truncated: true, deleted: count ?? null });
  }

  const rows = Array.isArray(body.messages) ? body.messages : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  // Undo clear / undo delete — re-insert rows with original ids + timestamps.
  if (body.restore === true) {
    const payload = rows
      .filter((m) => m.id && m.content != null)
      .map((m) => ({
        id: m.id,
        project_id: id,
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
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from("messages")
      .upsert(payload, { onConflict: "id" })
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, restored: data?.length ?? payload.length });
  }

  const result = await persistChatTurnMessages(
    supabase,
    rows.map((m) => ({
      project_id: id,
      role: m.role,
      content: m.content,
      mode: toPersistedMessageMode(m.mode),
      tokens_used: m.tokens_used ?? null,
      model: m.model ?? null,
      metadata: m.metadata ?? null,
    })),
    { projectId: id, label: "client-fallback" },
  );

  if (result.error) {
    return NextResponse.json({ error: "Failed to persist messages" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assistantMessageId: result.assistantMessageId });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "write");
  if ("error" in access) return access.error;

  const { error } = await (supabase as any)
    .from("messages")
    .delete()
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
