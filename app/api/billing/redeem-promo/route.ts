import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json() as { code?: string };
  if (!code?.trim()) return NextResponse.json({ error: "No promo code provided." }, { status: 400 });

  // Get customer ID
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found. Please purchase a plan first." }, { status: 400 });
  }

  // Look up the promotion code in Stripe
  let promotionCode;
  try {
    const codes = await stripe.promotionCodes.list({ code: code.trim(), active: true, limit: 1 });
    promotionCode = codes.data[0];
  } catch {
    return NextResponse.json({ error: "Could not look up promo code." }, { status: 500 });
  }

  if (!promotionCode) {
    return NextResponse.json({ error: "Invalid or expired promo code." }, { status: 400 });
  }

  // Find the customer's active subscription
  const subscriptions = await stripe.subscriptions.list({
    customer: profile.stripe_customer_id,
    status: "active",
    limit: 1,
  });

  if (subscriptions.data.length === 0) {
    // No active subscription — apply to customer as a one-time coupon credit note
    // Instead, return a helpful message to use it at checkout
    return NextResponse.json({
      message: "Code verified! Apply it at checkout when upgrading your plan.",
    });
  }

  // Apply the promotion code coupon to the active subscription
  const subscription = subscriptions.data[0];
  try {
    await stripe.subscriptions.update(subscription.id, {
      coupon: promotionCode.coupon.id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to apply coupon.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ message: `Promo code applied! Your discount is active.` });
}
