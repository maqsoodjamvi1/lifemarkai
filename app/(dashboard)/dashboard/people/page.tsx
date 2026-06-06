import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PeoplePage } from "@/components/dashboard/people-page";

export const metadata = { title: "People" };

export default async function People() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <PeoplePage currentUserId={user.id} />;
}
