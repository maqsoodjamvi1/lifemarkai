import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const REFERRER_BONUS = 25;
const REFEREE_BONUS  = 10;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json() as { code?: string };
  if (!code?.trim()) return NextResponse.json({ error: "code required" }, { status: 400 });

  const admin = await createAdminClient();

  // Check new user hasn't already been referred
  const { data: myProfile } = await (admin as any)
    .from("profiles").select("referred_by, credits").eq("id", user.id).single();
  if (myProfile?.referred_by) {
    return NextResponse.json({ error: "You have already used a referral code" }, { status: 409 });
  }

  // Look up the referrer by code
  const { data: referrerProfile } = await (admin as any)
    .from("profiles").select("id, credits").eq("referral_code", code.trim().toLowerCase()).single();
  if (!referrerProfile) return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
  if (referrerProfile.id === user.id) return NextResponse.json({ error: "Cannot use your own code" }, { status: 400 });

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
  // credit_logs columns are `action` (NOT NULL) + `description` — the previous
  // `reason`/`type` fields don't exist, so these audit rows silently never wrote.
  await (admin as any).from("credit_logs").insert([
    { user_id: user.id,             amount: REFEREE_BONUS,  action: "referral_bonus", description: `Referral signup bonus (used code: ${code})` },
    { user_id: referrerProfile.id,  amount: REFERRER_BONUS, action: "referral_bonus", description: "Referral bonus — new user signed up with your code" },
  ]);

  // Insert referral record
  await (admin as any).from("referrals").insert({
    referrer_id: referrerProfile.id,
    referee_id:  user.id,
    status:      "credited",
    credits_given: REFERRER_BONUS,
    credited_at: new Date().toISOString(),
  });

  // Notify referrer
  await (admin as any).from("notifications").insert({
    user_id: referrerProfile.id,
    type:    "referral",
    title:   "🎉 Referral bonus!",
    body: `Someone signed up with your referral code. You earned ${REFERRER_BONUS} credits!`,
    link:    "/dashboard/billing",
    is_read: false,
  }).catch(() => {});

  return NextResponse.json({ ok: true, bonusCredits: REFEREE_BONUS });
}
