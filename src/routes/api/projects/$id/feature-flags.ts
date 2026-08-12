import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/projects/:id/feature-flags — GET list, POST create. */
export const Route = createFileRoute("/api/projects/$id/feature-flags")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data } = await supabase
          .from("project_feature_flags")
          .select("id, key, description, enabled:is_enabled, rollout_pct, updated_at")
          .eq("project_id", params.id)
          .order("created_at", { ascending: false });
        return Response.json({ flags: data ?? [] });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { key: string; description?: string; enabled?: boolean; rollout_pct?: number };
        const { data, error } = await supabase
          .from("project_feature_flags")
          .insert({
            project_id: params.id,
            created_by: user.id,
            key: body.key,
            description: body.description ?? null,
            is_enabled: body.enabled ?? false,
            rollout_pct: body.rollout_pct ?? 100,
          })
          .select("id, key, description, enabled:is_enabled, rollout_pct, updated_at")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ flag: data });
      },
    },
  },
});
