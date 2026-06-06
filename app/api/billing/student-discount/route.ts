import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { stripe, getOrCreateCustomer } from "@/lib/stripe/client";

// One-time 50% off for 3 months coupon
const STUDENT_COUPON_PARAMS = {
  name: "LifemarkAI Student Discount",
  percent_off: 50,
  duration: "repeating" as const,
  duration_in_months: 3,
  max_redemptions: 1, // per coupon object — we create a fresh one per user
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eduEmail } = await req.json() as { eduEmail?: string };
  if (!eduEmail?.trim()) return NextResponse.json({ error: "No email provided." }, { status: 400 });

  // Validate .edu suffix
  if (!eduEmail.trim().toLowerCase().endsWith(".edu")) {
    return NextResponse.json({ error: "Only .edu email addresses qualify for the student discount." }, { status: 400 });
  }

  // Get or build profile
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("stripe_customer_id, student_discount_used, full_name")
    .eq("id", user.id)
    .single();

  // Check if already used
  if (profile?.student_discount_used) {
    return NextResponse.json({ error: "Student discount has already been applied to this account." }, { status: 400 });
  }

  const email = user.email ?? "";
  let customerId = profile?.stripe_customer_id ?? "";

  if (!customerId) {
    customerId = await getOrCreateCustomer(user.id, email, profile?.full_name ?? undefined);
    await (supabase as any).from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  // Create a single-use coupon for this student
  let coupon;
  try {
    coupon = await stripe.coupons.create({
      ...STUDENT_COUPON_PARAMS,
      metadata: { userId: user.id, eduEmail: eduEmail.trim() },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create coupon.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Find active subscription and apply, or apply to customer for next invoice
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });

  if (subscriptions.data.length > 0) {
    // Apply to active subscription
    try {
      await stripe.subscriptions.update(subscriptions.data[0].id, {
        coupon: coupon.id,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to apply coupon to subscription.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } else {
    // No active sub — attach coupon to customer so it applies at next checkout
    try {
      await stripe.customers.update(customerId, { coupon: coupon.id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to attach coupon to account.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Mark as used so they can't claim again
  await (supabase as any)
    .from("profiles")
    .update({ student_discount_used: true })
    .eq("id", user.id);

  return NextResponse.json({
    message: "🎓 50% student discount applied for 3 months! Enjoy building with LifemarkAI.",
  });
}
