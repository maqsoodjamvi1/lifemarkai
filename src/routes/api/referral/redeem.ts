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

        // Look up the referrer by code
        const { data: referrerProfile } = await admin
          .from("profiles").select("id, referral_credits_earned").eq("referral_code", code.trim().toLowerCase()).single();
        if (!referrerProfile) return Response.json({ error: "Invalid referral code" }, { status: 404 });
        if (referrerProfile.id === user.id) return Response.json({ error: "Cannot use your own code" }, { status: 400 });

        // Claim the redemption FIRST, atomically, with the "not already
        // redeemed" check built into the same statement — `.is("referred_by",
        // null)` in the WHERE clause means this UPDATE only actually touches
        // (and only actually returns) a row if referred_by was still NULL at
        // the moment Postgres locked it. This used to be a plain SELECT
        // ("have I already redeemed?") followed much later by an UPDATE, with
        // both credit grants and a credit_logs insert in between — two
        // concurrent POSTs (a double-click, a naive retry, or a deliberate
        // script) could both read referred_by as NULL before either wrote it,
        // and both would fall through to award credits, letting a user farm
        // unlimited free credits for both sides of the referral. A second,
        // concurrent redemption attempt now loses the race here and gets
        // nothing — it can never reach the credit-granting code below.
        const { data: claimed } = await admin
          .from("profiles")
          .update({ referred_by: referrerProfile.id })
          .eq("id", user.id)
          .is("referred_by", null)
          .select("id")
          .maybeSingle();
        if (!claimed) {
          return Response.json({ error: "You have already used a referral code" }, { status: 409 });
        }

        // add_credits is the atomic, race-safe credit-grant RPC (migration
        // 006/085) — `credits = credits + amount` inside the database, not a
        // read-then-write with a value computed in this request, which would
        // itself be a second race against any other concurrent credit change
        // even after the claim above closes the double-redeem.
        await admin.rpc("add_credits", {
          p_user_id: user.id,
          p_amount: REFEREE_BONUS,
          p_action: "referral_bonus",
          p_description: `Referral signup bonus (used code: ${code})`,
        });
        await admin.rpc("add_credits", {
          p_user_id: referrerProfile.id,
          p_amount: REFERRER_BONUS,
          p_action: "referral_bonus",
          p_description: "Referral bonus — new user signed up with your code",
        });
        await admin
          .from("profiles")
          .update({ referral_credits_earned: (referrerProfile.referral_credits_earned ?? 0) + REFERRER_BONUS })
          .eq("id", referrerProfile.id);

        // Insert referral record
        await admin.from("referrals").insert({
          referrer_id: referrerProfile.id,
          referee_id: user.id,
          status: "credited",
          credits_given: REFERRER_BONUS,
          credited_at: new Date().toISOString(),
        });

        // Notify referrer
        await Promise.resolve(admin.from("notifications").insert({
          user_id: referrerProfile.id,
          type: "referral",
          title: "🎉 Referral bonus!",
          body: `Someone signed up with your referral code. You earned ${REFERRER_BONUS} credits!`,
          link: "/dashboard/billing",
          is_read: false,
        })).catch(() => {});

        return Response.json({ ok: true, bonusCredits: REFEREE_BONUS });
      },
    },
  },
});
