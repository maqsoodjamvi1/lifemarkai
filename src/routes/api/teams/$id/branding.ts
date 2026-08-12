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
        const { data } = await supabase.from("workspace_branding").select("*").eq("team_id", params.id).maybeSingle();
        return Response.json({ branding: data ?? null });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const nullableString = (value: unknown): string | null =>
          typeof value === "string" && value.trim() ? value.trim() : null;
        await supabase.from("workspace_branding").upsert({
          team_id: params.id,
          logo_url: nullableString(body.logo_url),
          primary_color: typeof body.primary_color === "string" ? body.primary_color : "#8b5cf6",
          company_name: nullableString(body.company_name),
          support_email: nullableString(body.support_email),
          custom_domain: nullableString(body.custom_domain),
          hide_powered_by: body.hide_powered_by === true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "team_id" });
        return Response.json({ ok: true });
      },
    },
  },
});
