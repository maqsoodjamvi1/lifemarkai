import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WorkspaceKnowledgePage } from "@/components/dashboard/workspace-knowledge-page";

export const metadata = { title: "Workspace Knowledge" };

export default async function WorkspaceKnowledge() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <WorkspaceKnowledgePage user={user} />;
}
