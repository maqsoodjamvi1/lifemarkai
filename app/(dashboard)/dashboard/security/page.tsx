import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SecurityCenterPage } from "@/components/dashboard/security-center-page";

export const metadata = { title: "Security Center" };

export default async function SecurityCenter() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <SecurityCenterPage userId={user.id} />;
}
