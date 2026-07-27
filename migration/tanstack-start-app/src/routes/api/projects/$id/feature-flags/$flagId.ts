// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/projects/:id/feature-flags/:flagId — PATCH toggle/rollout, DELETE. */
export const Route = createFileRoute("/api/projects/$id/feature-flags/$flagId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { enabled?: boolean; rollout_pct?: number };
        await (supabase as any).from("feature_flags").update({ ...body, updated_at: new Date().toISOString() }).eq("id", params.flagId).eq("project_id", params.id);
        return Response.json({ ok: true });
      },
      DELETE: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        await (supabase as any).from("feature_flags").delete().eq("id", params.flagId).eq("project_id", params.id);
        return Response.json({ ok: true });
      },
    },
  },
});
