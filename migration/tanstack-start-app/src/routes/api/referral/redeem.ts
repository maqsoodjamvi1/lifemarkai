// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Native /api/referral/redeem — redeem a referral code (POST { code }). */
const REFERRER_BONUS = 25;
const REFEREE_BONUS = 10;

export const Route = createFileRoute("/api/referral/redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { code } = (await request.json()) as { code?: string };
        if (!code?.trim()) return Response.json({ error: "code required" }, { status: 400 });

        const admin = createAdminClient();

        // Check new user hasn't already been referred
        const { data: myProfile } = await (admin as any)
          .from("profiles").select("referred_by, credits").eq("id", user.id).single();
        if (myProfile?.referred_by) {
          return Response.json({ error: "You have already used a referral code" }, { status: 409 });
        }

        // Look up the referrer by code
        const { data: referrerProfile } = await (admin as any)
          .from("profiles").select("id, credits, referral_credits_earned").eq("referral_code", code.trim().toLowerCase()).single();
        if (!referrerProfile) return Response.json({ error: "Invalid referral code" }, { status: 404 });
        if (referrerProfile.id === user.id) return Response.json({ error: "Cannot use your own code" }, { status: 400 });

        // Credit referee (new user)
        await (admin as any)
          .from("profiles")
          .update({ referred_by: referrerProfile.id, credits: (myProfile?.credits ?? 0) + REFEREE_BONUS })
          .eq("id", user.id);

        // Credit referrer
        await (admin as any)
          .from("profiles")
          .update({
            credits: (referrerProfile.credits ?? 0) + REFERRER_BONUS,
            referral_credits_earned: (referrerProfile.referral_credits_earned ?? 0) + REFERRER_BONUS,
          })
          .eq("id", referrerProfile.id);

        // Log credit events
        await (admin as any).from("credit_logs").insert([
          { user_id: user.id, amount: REFEREE_BONUS, action: "referral_bonus", description: `Referral signup bonus (used code: ${code})` },
          { user_id: referrerProfile.id, amount: REFERRER_BONUS, action: "referral_bonus", description: "Referral bonus — new user signed up with your code" },
        ]);

        // Insert referral record
        await (admin as any).from("referrals").insert({
          referrer_id: referrerProfile.id,
          referee_id: user.id,
          status: "credited",
          credits_given: REFERRER_BONUS,
          credited_at: new Date().toISOString(),
        });

        // Notify referrer
        await (admin as any).from("notifications").insert({
          user_id: referrerProfile.id,
          type: "referral",
          title: "🎉 Referral bonus!",
          body: `Someone signed up with your referral code. You earned ${REFERRER_BONUS} credits!`,
          link: "/dashboard/billing",
          is_read: false,
        }).catch(() => {});

        return Response.json({ ok: true, bonusCredits: REFEREE_BONUS });
      },
    },
  },
});
