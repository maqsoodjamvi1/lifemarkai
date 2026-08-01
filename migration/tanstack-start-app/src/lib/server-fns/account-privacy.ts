/** Native account/privacy — reimplemented off the worker (pure Supabase). */
import { createClient } from "@/lib/supabase/server";

export async function getPrivacy() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthorized" as const };
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("training_opt_out, analytics_opt_out, marketing_emails")
    .eq("id", user.id)
    .single();
  return {
    status: "ok" as const,
    training_opt_out: profile?.training_opt_out ?? false,
    analytics_opt_out: profile?.analytics_opt_out ?? false,
    marketing_emails: profile?.marketing_emails ?? true,
  };
}

export async function updatePrivacy(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const updates: Record<string, boolean> = {};
    if (typeof data.training_opt_out === "boolean") updates.training_opt_out = data.training_opt_out;
    if (typeof data.analytics_opt_out === "boolean") updates.analytics_opt_out = data.analytics_opt_out;
    if (typeof data.marketing_emails === "boolean") updates.marketing_emails = data.marketing_emails;
    if (Object.keys(updates).length === 0) return { status: "noop" as const };

    const { data: row, error } = await (supabase as any)
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, profile: row };
}
