import { createAdminClient } from "@/lib/supabase/server";

const DEV_CREDIT_GRANT = 50;

/** In local dev, top up empty accounts so AI builds are testable. No-op in production. */
export async function ensureDevCredits(userId: string): Promise<number | null> {
  if (process.env.NODE_ENV !== "development") return null;

  const admin = await createAdminClient();
  const { data: profile } = await (admin as any)
    .from("profiles")
    .select("credits, plan, email")
    .eq("id", userId)
    .maybeSingle();

  const current = profile?.credits ?? 0;
  if (current > 0) return current;

  if (profile) {
    await (admin as any)
      .from("profiles")
      .update({ credits: DEV_CREDIT_GRANT, updated_at: new Date().toISOString() })
      .eq("id", userId);
  } else {
    const email = `dev-${userId.slice(0, 8)}@local.dev`;
    await (admin as any).from("profiles").insert({
      id: userId,
      email,
      credits: DEV_CREDIT_GRANT,
      plan: "free",
    });
  }

  return DEV_CREDIT_GRANT;
}

/** Dev-only: read profile via service role when user-scoped RLS hides the row. */
export async function getDevProfile(userId: string) {
  if (process.env.NODE_ENV !== "development") return null;
  const admin = await createAdminClient();
  const { data } = await (admin as any)
    .from("profiles")
    .select("credits, plan, email, workspace_knowledge")
    .eq("id", userId)
    .maybeSingle();
  return data;
}
