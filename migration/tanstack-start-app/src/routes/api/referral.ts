import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Native /api/referral — current user's referral code, link, and stats. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.app";

export const Route = createFileRoute("/api/referral")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createAdminClient();
        const { data: profile } = await admin
          .from("profiles")
          .select("referral_code, referral_credits_earned")
          .eq("id", user.id)
          .single();

        const { data: referrals } = await admin
          .from("referrals")
          .select("id, status, credits_given, created_at, credited_at, referee_id")
          .eq("referrer_id", user.id)
          .order("created_at", { ascending: false });

        const code = profile?.referral_code ?? null;

        return Response.json({
          code,
          link: code ? `${APP_URL}/signup?ref=${code}` : null,
          creditsEarned: profile?.referral_credits_earned ?? 0,
          referrals: (referrals ?? []).map(
            (r: { id: string; status: string; credits_given: number; created_at: string; credited_at: string | null }) => ({
              id: r.id,
              status: r.status,
              creditsGiven: r.credits_given,
              createdAt: r.created_at,
              creditedAt: r.credited_at,
            }),
          ),
          pendingCount: (referrals ?? []).filter((r: { status: string }) => r.status === "pending").length,
          creditedCount: (referrals ?? []).filter((r: { status: string }) => r.status === "credited").length,
        });
      },
    },
  },
});
