import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { InboxPage } from "@/components/dashboard/inbox-page";

export const metadata = { title: "Inbox" };

export default async function Inbox() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <InboxPage userId={user.id} />;
}
