// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { toPersistedMessageMode } from "@/lib/ai/persist-message-mode";
import { persistChatTurnMessages } from "@/lib/ai/persist-chat-turn";

async function assertProjectOwner(supabase: any, projectId: string, userId: string) {
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();

  if (!project) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (project.user_id !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { project };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertProjectOwner(supabase, id, user.id);
  if (access.error) return access.error;

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

/** Client fallback when the SSE turn finishes without assistantMessageId. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertProjectOwner(supabase, id, user.id);
  if (access.error) return access.error;

  let body: {
    messages?: Array<{
      role: "user" | "assistant" | "system";
      content: string;
      mode?: string;
      tokens_used?: number | null;
      model?: string | null;
      metadata?: Record<string, unknown> | null;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows = Array.isArray(body.messages) ? body.messages : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
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

  const access = await assertProjectOwner(supabase, id, user.id);
  if (access.error) return access.error;

  const { error } = await (supabase as any)
    .from("messages")
    .delete()
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
