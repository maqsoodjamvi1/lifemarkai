import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BillingPortalClient } from "@/components/dashboard/billing-portal-client";
import { PLANS } from "@/lib/stripe/plans";

export const metadata = { title: "Billing — LifemarkAI" };

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("plan, credits, stripe_customer_id, created_at")
    .eq("id", user.id)
    .single();

  // Load credit log for usage chart (last 30 entries)
  const { data: creditLogs } = await (supabase as any)
    .from("credit_logs")
    .select("amount, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const planId = (profile as any)?.plan ?? "free";
  const currentPlan = PLANS.find((p) => p.id === planId) ?? PLANS[0];
  const credits = (profile as any)?.credits ?? 0;
  const hasStripe = !!(profile as any)?.stripe_customer_id;

  return (
    <BillingPortalClient
      user={{ id: user.id, email: user.email ?? "" }}
      currentPlan={currentPlan}
      credits={credits}
      hasStripe={hasStripe}
      creditLogs={(creditLogs ?? []) as { amount: number; reason: string; created_at: string }[]}
      plans={PLANS}
    />
  );
}
