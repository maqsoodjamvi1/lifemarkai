// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";

/** Native /api/analytics/usage — 30-day credit burn + generations by model/mode. */
export const Route = createFileRoute("/api/analytics/usage")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const iso = thirtyDaysAgo.toISOString();

        const { data: creditLogs } = await supabase
          .from("credit_logs")
          .select("credits_used, created_at")
          .eq("user_id", user.id)
          .gte("created_at", iso)
          .order("created_at", { ascending: true });

        const { data: projectRows } = await supabase
          .from("projects").select("id").eq("user_id", user.id);
        const projectIds = (projectRows ?? []).map((p: { id: string }) => p.id);

        let messages: Array<{ model: string | null; created_at: string; tokens_used: number | null; mode: string | null }> = [];
        if (projectIds.length > 0) {
          const { data: msgData } = await supabase
            .from("messages")
            .select("model, created_at, tokens_used, mode")
            .eq("role", "assistant")
            .gte("created_at", iso)
            .in("project_id", projectIds);
          messages = msgData ?? [];
        }

        const burnByDay: Record<string, number> = {};
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          burnByDay[d.toISOString().slice(0, 10)] = 0;
        }
        (creditLogs ?? []).forEach((log: { created_at: string; credits_used: number | null }) => {
          const key = log.created_at.slice(0, 10);
          if (key in burnByDay) burnByDay[key] += log.credits_used ?? 1;
        });

        const byModel: Record<string, { count: number; tokens: number }> = {};
        messages.forEach((msg) => {
          const model = msg.model ?? "unknown";
          if (!byModel[model]) byModel[model] = { count: 0, tokens: 0 };
          byModel[model].count += 1;
          byModel[model].tokens += msg.tokens_used ?? 0;
        });

        const byMode: Record<string, number> = {};
        messages.forEach((msg) => {
          const mode = msg.mode ?? "chat";
          byMode[mode] = (byMode[mode] ?? 0) + 1;
        });

        return Response.json({
          burnByDay: Object.entries(burnByDay).map(([date, credits]) => ({ date, credits })),
          byModel: Object.entries(byModel).map(([model, v]) => ({ model, ...v })),
          byMode: Object.entries(byMode).map(([mode, count]) => ({ mode, count })),
          totalCredits: (creditLogs ?? []).reduce((s, l: { credits_used: number | null }) => s + (l.credits_used ?? 1), 0),
          totalGenerations: messages.length,
        });
      },
    },
  },
});
