import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsPage } from "@/components/dashboard/settings-page";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await (supabase as any).from("profiles").select("*").eq("id", user.id).single();
  return <SettingsPage user={user} profile={profile} />;
}
