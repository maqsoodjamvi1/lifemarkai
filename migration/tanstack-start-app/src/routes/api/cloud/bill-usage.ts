// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import { CENTS_PER_CREDIT } from "@/lib/credits";

/**
 * Native /api/cloud/bill-usage — nightly Cloud billing cron. Records daily
 * instance cost, debits credit balance via bill_cloud_usage RPC, pauses/resumes
 * per workspace, idle auto-pause. Auth: x-cron-secret.
 */
const CRON_SECRET = process.env.CRON_SECRET ?? "";

export const Route = createFileRoute("/api/cloud/bill-usage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace("Bearer ", "");
        if (!CRON_SECRET || provided !== CRON_SECRET) return Response.json({ error: "Forbidden" }, { status: 403 });

        const supabase = createAdminClient();
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { data: tiers } = await supabase.from("lifemark_cloud_instances").select("tier, monthly_cents");
        const tierCost: Record<string, number> = {};
        for (const t of tiers ?? []) tierCost[t.tier] = t.monthly_cents ?? 0;

        const { data: projects, error } = await supabase.from("projects")
          .select("id, user_id, name, cloud_instance, cloud_status")
          .eq("cloud_enabled", true).in("cloud_status", ["active", "paused"]);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results: Array<{ project: string; status: string; cents?: number }> = [];
        const perUserCents = new Map<string, number>();
        const userProjects = new Map<string, string[]>();

        for (const project of projects ?? []) {
          userProjects.set(project.user_id, [...(userProjects.get(project.user_id) ?? []), project.id]);
          const monthly = tierCost[project.cloud_instance ?? "tiny"] ?? 0;
          if (monthly <= 0) { results.push({ project: project.name, status: "free-tier" }); continue; }
          if (project.cloud_status === "paused") { results.push({ project: project.name, status: "paused-no-billing" }); continue; }

          const dailyCents = Math.max(1, Math.round(monthly / 30));
          const { data: existing } = await supabase.from("lifemark_cloud_usage")
            .select("id").eq("project_id", project.id).gte("recorded_at", todayStart.toISOString()).gt("compute_cents", 0).limit(1).maybeSingle();
          if (existing) { results.push({ project: project.name, status: "already-billed-today" }); continue; }

          const computeCents = Math.round(dailyCents * 0.6);
          const dbCents = dailyCents - computeCents;
          const { error: usageErr } = await supabase.from("lifemark_cloud_usage").insert({
            project_id: project.id, user_id: project.user_id, compute_cents: computeCents, db_server_cents: dbCents,
          });
          if (usageErr) { results.push({ project: project.name, status: "usage-insert-failed" }); continue; }

          perUserCents.set(project.user_id, (perUserCents.get(project.user_id) ?? 0) + dailyCents);
          results.push({ project: project.name, status: "billed", cents: dailyCents });
        }

        const walletResults: Array<{ user: string; balance: number; action: string }> = [];
        for (const [userId, projectIds] of userProjects.entries()) {
          const cents = perUserCents.get(userId) ?? 0;
          let balance: number | null = null;
          if (cents > 0) {
            const { data, error: billErr } = await supabase.rpc("bill_cloud_usage", { p_user_id: userId, p_cents: cents });
            if (billErr) { walletResults.push({ user: userId, balance: -1, action: `bill-failed: ${billErr.message}` }); continue; }
            balance = typeof data === "number" ? data : null;
          }
          if (balance === null) {
            const { data: profile } = await supabase.from("profiles").select("credits").eq("id", userId).single();
            balance = Math.round(Number(profile?.credits ?? 0) * CENTS_PER_CREDIT);
          }

          if (balance <= 0 && cents > 0) {
            await supabase.from("projects").update({ cloud_status: "paused" })
              .in("id", projectIds).neq("cloud_instance", "tiny").eq("cloud_status", "active");
            walletResults.push({ user: userId, balance, action: "paused" });
          } else if (balance > 0) {
            const { data: resumed } = await supabase.from("projects").update({ cloud_status: "active" })
              .in("id", projectIds).eq("cloud_status", "paused")
              .or("metadata->>cloud_paused_manually.is.null,metadata->>cloud_paused_manually.eq.false")
              .or("metadata->>cloud_paused_idle.is.null,metadata->>cloud_paused_idle.eq.false")
              .select("id");
            walletResults.push({ user: userId, balance, action: (resumed?.length ?? 0) > 0 ? `resumed ${resumed.length}` : "ok" });
          } else {
            walletResults.push({ user: userId, balance, action: "ok" });
          }
        }

        const idleResults: Array<{ project: string; action: string }> = [];
        try {
          const idleCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          const { data: idle } = await supabase.from("projects")
            .select("id, name, metadata").eq("cloud_enabled", true).eq("cloud_status", "active")
            .neq("cloud_instance", "tiny").lt("updated_at", idleCutoff).limit(100);
          for (const p of idle ?? []) {
            await supabase.from("projects").update({
              cloud_status: "paused",
              metadata: { ...((p.metadata ?? {}) as Record<string, unknown>), cloud_paused_idle: true, cloud_paused_at: new Date().toISOString() },
            }).eq("id", p.id);
            idleResults.push({ project: p.name, action: "idle-paused" });
          }
        } catch (err) {
          console.warn("[bill-usage] idle auto-pause failed:", err instanceof Error ? err.message : err);
        }

        return Response.json({ ok: true, projects: results, wallets: walletResults, idle: idleResults });
      },
    },
  },
});
