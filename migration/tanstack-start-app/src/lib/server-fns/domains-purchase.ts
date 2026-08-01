/**
 * Native domains checkout + purchase — reimplemented off the worker.
 * Ports of app/api/domains/{checkout,purchase} (need lib/plans/gating + stripe).
 */
import { createClient } from "@/lib/supabase/server";
import { stripe, getOrCreateCustomer } from "@/lib/stripe/client";
import { getRegistrar, isPurchaseEnabled, type RegistrantContact } from "@/lib/domains/registrar";
import { completeDomainPurchase } from "@/lib/domains/complete-domain-purchase";
import { requireFeature } from "@/lib/plans/gating";

export async function createDomainCheckout(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const gate = await requireFeature(user.id, "workspace_domains");
    if (!gate.ok) return { status: "gated" as const, code: gate.status, message: gate.error, requiredPlan: gate.requiredPlan };
    if (!process.env.STRIPE_SECRET_KEY) return { status: "unconfigured" as const, message: "Stripe is not configured" };
    if (!isPurchaseEnabled()) return { status: "unconfigured" as const, message: "Domain registrar is not configured" };

    if (!data.projectId || !data.domain || !data.contact || !data.priceCents || data.priceCents < 100) {
      return { status: "bad_request" as const, message: "projectId, domain, contact, and priceCents are required" };
    }

    const { data: project } = await (supabase as any)
      .from("projects").select("id").eq("id", data.projectId).eq("user_id", user.id).single();
    if (!project) return { status: "not_found" as const };

    const yr = Math.min(Math.max(data.years ?? 1, 1), 10);
    const registrar = getRegistrar();
    const { data: profile } = await (supabase as any)
      .from("profiles").select("stripe_customer_id, email, full_name").eq("id", user.id).single();

    let customerId = profile?.stripe_customer_id ?? "";
    if (!customerId) {
      customerId = await getOrCreateCustomer(user.id, profile?.email ?? user.email ?? "", profile?.full_name ?? undefined);
      await (supabase as any).from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const { data: pending } = await (supabase as any)
      .from("domain_registrations")
      .upsert(
        {
          project_id: data.projectId,
          user_id: user.id,
          domain: data.domain.toLowerCase(),
          registrar: registrar.id,
          status: "pending_payment",
          price_cents: data.priceCents,
          years: yr,
          auto_renew: true,
          metadata: { contact: data.contact },
        },
        { onConflict: "domain" },
      )
      .select("id")
      .single();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: data.priceCents,
            product_data: { name: `Domain registration — ${data.domain}`, description: `${yr}-year registration + auto DNS wiring` },
          },
          quantity: 1,
        },
      ],
      success_url: `${data.appUrl}/editor/${data.projectId}?panel=domains&domain_purchased=1`,
      cancel_url: `${data.appUrl}/editor/${data.projectId}?panel=domains&domain_cancelled=1`,
      metadata: {
        kind: "domain_purchase",
        userId: user.id,
        projectId: data.projectId,
        domain: data.domain.toLowerCase(),
        years: String(yr),
        registrationId: pending?.id ?? "",
        contactJson: JSON.stringify(data.contact),
      },
    });

    await (supabase as any).from("domain_registrations").update({ stripe_ref: session.id }).eq("domain", data.domain.toLowerCase());
    return { status: "ok" as const, url: session.url, sessionId: session.id };
}

export async function purchaseDomainDirect(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const gate = await requireFeature(user.id, "workspace_domains");
    if (!gate.ok) return { status: "gated" as const, code: gate.status, message: gate.error, requiredPlan: gate.requiredPlan };
    if (!isPurchaseEnabled()) return { status: "unconfigured" as const, message: "Domain purchase is not configured on this server." };
    if (!data.projectId || !data.domain || !data.contact) {
      return { status: "bad_request" as const, message: "projectId, domain and contact are required" };
    }

    const { data: project } = await (supabase as any)
      .from("projects").select("id").eq("id", data.projectId).eq("user_id", user.id).single();
    if (!project) return { status: "not_found" as const };

    const result = await completeDomainPurchase({
      projectId: data.projectId,
      userId: user.id,
      domain: data.domain.toLowerCase(),
      contact: data.contact,
      years: data.years ?? 1,
      autoRenew: data.autoRenew ?? true,
    });
    if (!result.ok) return { status: "registrar_error" as const, message: result.error };
    return { status: "ok" as const, result };
}
