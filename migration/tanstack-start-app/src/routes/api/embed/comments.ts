import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Native /api/embed/comments — anonymous ("no account") preview comments.
 *   GET  ?projectId=&pagePath= → list comments for a PUBLIC project
 *   POST                       → post a guest comment on a PUBLIC project
 * Guest writes go through service role after validating the project is public.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function assertPublic(supabase: any, projectId: string) {
  const { data } = await supabase.from("projects").select("id, is_public").eq("id", projectId).single();
  return Boolean(data?.is_public);
}

export const Route = createFileRoute("/api/embed/comments")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const projectId = url.searchParams.get("projectId");
        const pagePath = url.searchParams.get("pagePath");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400, headers: CORS });

        const supabase = createAdminClient();
        if (!(await assertPublic(supabase, projectId))) {
          return Response.json({ error: "Project is not public" }, { status: 403, headers: CORS });
        }

        let q = supabase
          .from("project_comments")
          .select("id, content, guest_name, is_guest, page_path, element_xpath, element_preview, resolved, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .limit(500);
        if (pagePath) q = q.eq("page_path", pagePath);

        const { data, error } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });

        const comments = (data ?? []).map((c: any) => ({
          ...c,
          author: c.is_guest ? (c.guest_name || "Guest") : "Team",
          guest_name: undefined,
        }));
        return Response.json({ comments }, { headers: CORS });
      },

      POST: async ({ request }) => {
        let body: any;
        try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

        const projectId = body.projectId;
        const content = String(body.content ?? "").trim();
        const guestName = String(body.guestName ?? "").trim().slice(0, 60);
        if (!projectId || !content) return Response.json({ error: "projectId and content required" }, { status: 400, headers: CORS });
        if (content.length > 4000) return Response.json({ error: "Comment too long (max 4000)" }, { status: 400, headers: CORS });
        if (!guestName) return Response.json({ error: "guestName required" }, { status: 400, headers: CORS });

        const supabase = createAdminClient();
        if (!(await assertPublic(supabase, projectId))) {
          return Response.json({ error: "Comments are only open on public projects" }, { status: 403, headers: CORS });
        }

        const { data, error } = await supabase
          .from("project_comments")
          .insert({
            project_id: projectId,
            user_id: null,
            is_guest: true,
            guest_name: guestName,
            content,
            page_path: body.pagePath ?? null,
            element_xpath: body.elementXpath ?? null,
            element_tag: body.elementTag ?? null,
            element_preview: body.elementPreview ?? null,
          })
          .select("id, content, page_path, element_xpath, element_preview, created_at")
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });
        return Response.json({ comment: { ...data, author: guestName, is_guest: true } }, { status: 201, headers: CORS });
      },
    },
  },
});
