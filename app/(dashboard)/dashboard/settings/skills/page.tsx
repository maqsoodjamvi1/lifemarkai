import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WorkspaceSkillsPage } from "@/components/dashboard/workspace-skills-page";

export const metadata = { title: "Workspace Skills" };

export default async function WorkspaceSkills() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <WorkspaceSkillsPage user={user} />;
}
