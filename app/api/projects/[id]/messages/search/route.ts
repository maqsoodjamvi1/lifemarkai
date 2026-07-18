import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { embedTexts } from "@/lib/ai/embed-text";
import {
  rankMessagesByEmbedding,
  rankMessagesByKeyword,
  type ChatSearchMode,
} from "@/lib/editor/search-chat-messages";

export const runtime = "nodejs";

/** GET /api/projects/[id]/messages/search?q=&mode=keyword|semantic */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const mode = (url.searchParams.get("mode") ?? "keyword") as ChatSearchMode;
  if (!q) return NextResponse.json({ hits: [], mode: "keyword" as const });

  const { data: rows, error } = await (supabase as any)
    .from("messages")
    .select("id, role, content, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const messages = (rows ?? []).reverse();

  if (mode === "semantic") {
    const excerpts = messages.map((m: { id: string; content: string }) =>
      (m.content ?? "").slice(0, 800),
    );
    const vectors = await embedTexts([q, ...excerpts]);
    if (vectors && vectors.length === messages.length + 1) {
      const queryVec = vectors[0]!;
      const map = new Map<string, number[]>();
      messages.forEach((m: { id: string }, i: number) => {
        map.set(m.id, vectors[i + 1]!);
      });
      const hits = rankMessagesByEmbedding(messages, queryVec, map, 40);
      return NextResponse.json({ hits, mode: "semantic" as const });
    }
    // Fallback when embeddings unavailable
    const hits = rankMessagesByKeyword(messages, q, 40);
    return NextResponse.json({ hits, mode: "keyword" as const, fallback: true });
  }

  const hits = rankMessagesByKeyword(messages, q, 40);
  return NextResponse.json({ hits, mode: "keyword" as const });
}
