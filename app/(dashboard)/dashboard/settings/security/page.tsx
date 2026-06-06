import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SecuritySettingsPage } from "@/components/dashboard/security-settings-page";

export const metadata = { title: "Security & Privacy — LifemarkAI" };

export default async function SecurityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("full_name, email, github_username, training_opt_out, analytics_opt_out, marketing_emails")
    .eq("id", user.id)
    .single();

  return <SecuritySettingsPage user={user} profile={profile} />;
}
