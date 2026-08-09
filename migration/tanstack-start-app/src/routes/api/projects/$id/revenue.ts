import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/projects/:id/revenue — in-app payment revenue analytics.
 * MRR = (active + trialing subscribers) × app_monetization.price_cents.
 */
interface SubRow { status: string; created_at: string; updated_at: string; }
const MONTHS = 6;

export const Route = createFileRoute("/api/projects/$id/revenue")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await supabase
          .from("projects").select("user_id").eq("id", id).single();
        if (!project || project.user_id !== user.id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const [{ data: config }, { data: subs }] = await Promise.all([
          supabase.from("app_monetization").select("price_cents, currency").eq("project_id", id).maybeSingle(),
          supabase.from("app_subscriptions").select("status, created_at, updated_at").eq("project_id", id),
        ]);

        const priceCents: number = config?.price_cents ?? 0;
        const currency: string = config?.currency ?? "usd";
        const rows: SubRow[] = (subs ?? []) as SubRow[];

        const now = Date.now();
        const cutoff30 = now - 30 * 24 * 60 * 60 * 1000;

        const isActive = (s: SubRow) => s.status === "active" || s.status === "trialing";
        const activeSubscribers = rows.filter(isActive).length;
        const mrrCents = activeSubscribers * priceCents;
        const newLast30 = rows.filter((s) => new Date(s.created_at).getTime() >= cutoff30).length;
        const churnedLast30 = rows.filter(
          (s) => s.status === "canceled" && new Date(s.updated_at).getTime() >= cutoff30,
        ).length;

        const series: Array<{ key: string; label: string; newSubs: number; churned: number; activeAtEnd: number; mrrCents: number }> = [];

        for (let i = MONTHS - 1; i >= 0; i--) {
          const d = new Date();
          d.setUTCDate(1);
          d.setUTCHours(0, 0, 0, 0);
          d.setUTCMonth(d.getUTCMonth() - i);
          const monthStart = d.getTime();
          const monthEndExclusive = new Date(d);
          monthEndExclusive.setUTCMonth(monthEndExclusive.getUTCMonth() + 1);
          const monthEnd = monthEndExclusive.getTime();

          const newSubs = rows.filter((s) => {
            const t = new Date(s.created_at).getTime();
            return t >= monthStart && t < monthEnd;
          }).length;
          const churned = rows.filter((s) => {
            if (s.status !== "canceled") return false;
            const t = new Date(s.updated_at).getTime();
            return t >= monthStart && t < monthEnd;
          }).length;
          const activeAtEnd = rows.filter((s) => {
            if (new Date(s.created_at).getTime() >= monthEnd) return false;
            if (s.status !== "canceled") return true;
            return new Date(s.updated_at).getTime() >= monthEnd;
          }).length;

          series.push({
            key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
            label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
            newSubs,
            churned,
            activeAtEnd,
            mrrCents: activeAtEnd * priceCents,
          });
        }

        return Response.json({ currency, priceCents, activeSubscribers, mrrCents, newLast30, churnedLast30, series });
      },
    },
  },
});
