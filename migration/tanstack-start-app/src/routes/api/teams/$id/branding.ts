// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/teams/:id/branding — GET/POST workspace branding. */
export const Route = createFileRoute("/api/teams/$id/branding")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data } = await (supabase as any).from("workspace_branding").select("*").eq("team_id", params.id).maybeSingle();
        return Response.json({ branding: data ?? null });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        await (supabase as any).from("workspace_branding").upsert({
          team_id: params.id,
          logo_url: body.logo_url ?? null,
          primary_color: body.primary_color ?? "#8b5cf6",
          company_name: body.company_name ?? null,
          support_email: body.support_email ?? null,
          custom_domain: body.custom_domain ?? null,
          hide_powered_by: body.hide_powered_by ?? false,
          updated_at: new Date().toISOString(),
        }, { onConflict: "team_id" });
        return Response.json({ ok: true });
      },
    },
  },
});
