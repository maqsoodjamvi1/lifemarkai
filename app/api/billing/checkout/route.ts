import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { stripe, getOrCreateCustomer } from "@/lib/stripe/client";
import { PLANS } from "@/lib/stripe/plans";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan: planId, billing = "monthly" } = await req.json() as {
    plan: string;
    billing?: "monthly" | "yearly";
  };

  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const priceId = billing === "yearly" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) return NextResponse.json({ error: "Plan not available" }, { status: 400 });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("stripe_customer_id, full_name, email")
    .eq("id", user.id)
    .single();

  const email = profile?.email ?? user.email ?? "";
  let customerId = profile?.stripe_customer_id ?? "";

  if (!customerId) {
    customerId = await getOrCreateCustomer(user.id, email, profile?.full_name ?? undefined);
    await (supabase as any).from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard/billing?upgraded=1&plan=${planId}`,
    cancel_url:  `${appUrl}/dashboard/billing`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId: user.id, planId, billing },
    },
  });

  return NextResponse.json({ url: session.url });
}
