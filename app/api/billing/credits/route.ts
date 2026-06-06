import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { CREDIT_PACKS } from "@/lib/stripe/plans";

// GET — user credit balance + team pools
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("credits, plan")
    .eq("id", user.id)
    .single();

  const { data: memberships } = await (supabase as any)
    .from("team_members")
    .select("team_id, role, credits_used, credit_allowance, teams(id, name, credits)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);

  return NextResponse.json({
    credits: profile?.credits ?? 0,
    plan: profile?.plan ?? "free",
    teams: memberships ?? [],
  });
}

// POST — initiate credit pack purchase via Stripe Checkout
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packKey, teamId } = await req.json();
  const pack = CREDIT_PACKS.find((p) => p.key === packKey);
  if (!pack) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: profile?.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: pack.priceCents,
          product_data: {
            name: `${pack.credits} LifemarkAI Credits`,
            description: pack.description,
            images: [],
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: user.id,
      teamId: teamId ?? "",
      packKey: pack.key,
      credits: String(pack.credits),
    },
    success_url: `${appUrl}/dashboard/billing?credit_success=1&pack=${pack.key}`,
    cancel_url:  `${appUrl}/dashboard/billing?credit_cancel=1`,
  });

  // Record pending pack
  await (supabase as any).from("credit_packs").insert({
    user_id:          user.id,
    team_id:          teamId ?? null,
    amount:           pack.credits,
    price_cents:      pack.priceCents,
    stripe_session_id: session.id,
    pack_key:         pack.key,
    status:           "pending",
  });

  return NextResponse.json({ url: session.url });
}
