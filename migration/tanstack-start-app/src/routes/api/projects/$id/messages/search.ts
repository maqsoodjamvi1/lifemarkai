// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/ai/embed-text";
import {
  rankMessagesByEmbedding,
  rankMessagesByKeyword,
  type ChatSearchMode,
} from "@/lib/editor/search-chat-messages";
import { getOrCreateMessageEmbeddings } from "@/lib/editor/message-embeddings";
import { assertChatAccess } from "@/lib/project/chat-access";


/** GET /api/projects/[id]/messages/search?q=&mode=keyword|semantic */
async function handleGET(req: Request, params: any) {
  const { id } = params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "read");
  if ("error" in access) return access.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const mode = (url.searchParams.get("mode") ?? "keyword") as ChatSearchMode;
  if (!q) return Response.json({ hits: [], mode: "keyword" as const });

  const { data: rows, error } = await (supabase as any)
    .from("messages")
    .select("id, role, content, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const messages = (rows ?? []).reverse();

  if (mode === "semantic") {
    const queryVectors = await embedTexts([q]);
    if (!queryVectors?.[0]) {
      const hits = rankMessagesByKeyword(messages, q, 40);
      return Response.json({ hits, mode: "keyword" as const, fallback: true });
    }

    const map = await getOrCreateMessageEmbeddings(supabase, id, messages);
    if (map.size === 0) {
      const hits = rankMessagesByKeyword(messages, q, 40);
      return Response.json({ hits, mode: "keyword" as const, fallback: true });
    }

    const hits = rankMessagesByEmbedding(messages, queryVectors[0], map, 40);
    return Response.json({
      hits,
      mode: "semantic" as const,
      cached: true,
      embedded: map.size,
    });
  }

  const hits = rankMessagesByKeyword(messages, q, 40);
  return Response.json({ hits, mode: "keyword" as const });
}


export const Route = createFileRoute("/api/projects/$id/messages/search")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
    },
  },
});
