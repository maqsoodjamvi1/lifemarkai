import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/projects/:id/monetization — GET config+subscribers, POST upsert config. */
export const Route = createFileRoute("/api/projects/$id/monetization")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const [{ data: config }, { data: subscribers }] = await Promise.all([
          supabase.from("app_monetization").select("*").eq("project_id", params.id).maybeSingle(),
          supabase.from("app_subscriptions").select("subscriber_email,status,trial_end,current_period_end,created_at").eq("project_id", params.id).order("created_at", { ascending: false }),
        ]);
        return Response.json({ config: config ?? { enabled: false, price_cents: 900, currency: "usd", trial_days: 7 }, subscribers: subscribers ?? [] });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: project } = await supabase.from("projects").select("user_id").eq("id", params.id).single();
        if (!project || project.user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as { enabled: boolean; price_cents: number; currency: string; trial_days: number };
        await supabase.from("app_monetization").upsert({
          project_id: params.id, enabled: body.enabled, price_cents: body.price_cents, currency: body.currency, trial_days: body.trial_days, updated_at: new Date().toISOString(),
        }, { onConflict: "project_id" });
        return Response.json({ ok: true });
      },
    },
  },
});
