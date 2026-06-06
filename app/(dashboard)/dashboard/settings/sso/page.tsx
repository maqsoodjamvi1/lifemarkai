import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SSOSetupPage } from "@/components/dashboard/sso-setup-page";

export const metadata = { title: "Workspace SSO" };

export default async function SSOSetup() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <SSOSetupPage />;
}
