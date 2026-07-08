import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AiEvalsPage } from "@/components/dashboard/ai-evals-page";

export const metadata = { title: "AI Metrics" };

export default async function AiEvals() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <AiEvalsPage userId={user.id} />;
}
