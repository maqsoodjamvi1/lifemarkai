import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createBillingPortalSession } from "@/lib/stripe/client";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase as any).from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!profile?.stripe_customer_id) return NextResponse.json({ error: "No billing account found" }, { status: 400 });

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL!;
  const url = await createBillingPortalSession(profile.stripe_customer_id, `${origin}/dashboard/billing`);

  return NextResponse.json({ url });
}
