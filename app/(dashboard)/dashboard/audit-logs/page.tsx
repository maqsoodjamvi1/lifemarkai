import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AuditLogsPage } from "@/components/dashboard/audit-logs-page";

export const metadata = { title: "Audit Logs" };

export default async function AuditLogs() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <AuditLogsPage userId={user.id} />;
}
