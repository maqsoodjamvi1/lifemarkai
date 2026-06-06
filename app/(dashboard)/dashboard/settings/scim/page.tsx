import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SCIMSetupPage } from "@/components/dashboard/scim-setup-page";

export const metadata = { title: "SCIM Provisioning" };

export default async function SCIMSetup() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <SCIMSetupPage />;
}
