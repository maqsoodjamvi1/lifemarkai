/**
 * Native billing helpers (GET credits). Stripe checkout POST stays on Next proxy.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { ensureDevCredits } from "@/lib/dev-credits";

export const getCredits = createServerFn({ method: "GET" })
  .validator(
    zodValidator(
      z
        .object({
          debugZeroCredits: z.boolean().optional(),
        })
        .catch({}),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("credits, plan")
      .eq("id", user.id)
      .maybeSingle();

    const { data: memberships } = await (supabase as any)
      .from("team_members")
      .select("team_id, role, credits_used, credit_allowance, teams(id, name, credits)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null);

    let credits = profile?.credits ?? 0;
    const debugZero =
      data.debugZeroCredits === true && process.env.NODE_ENV === "development";

    if (debugZero) {
      credits = 0;
    } else {
      const granted = await ensureDevCredits(user.id);
      if (granted !== null) credits = granted;
    }

    return {
      status: "ok" as const,
      credits,
      plan: profile?.plan ?? "free",
      teams: memberships ?? [],
    };
  });

// ── Batch C: Stripe billing POST façades ───────────────────────────────────
// Stripe SDK stays in the Next handler (served by the API worker); these are
// typed, cookie-forwarding RPC clients following the ai-json proxy pattern.

const checkoutInput = z.object({
  plan: z.string().min(1),
  billing: z.enum(["monthly", "yearly"]).optional(),
});

/** Start a subscription checkout → returns the hosted Stripe Checkout URL. */
/**
 * PHASE 1: the legacy proxy-backed server-fns (startCheckout, openBillingPortal,
 * purchaseCreditPack, redeemPromo, applyStudentDiscount, setAutoTopup) were removed.
 * They dispatched to app/api via the retired API worker and had ZERO callers —
 * every billing route now uses the native implementations in
 * `@/lib/server-fns/billing-native` and `billing-auto-topup`.
 * `getCredits` above is fully native (direct Supabase) and stays.
 */
