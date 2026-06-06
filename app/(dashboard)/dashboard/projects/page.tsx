import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProjectsGrid } from "@/components/dashboard/projects-grid";
import { ProjectActions } from "@/components/dashboard/new-project-button";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export const metadata = {
  title: "Projects",
  description: "All your AI-generated projects",
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <DashboardHeader user={user} profile={profile} />
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">All Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {projects?.length ?? 0} project{projects?.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <ProjectActions />
        </div>
        <ProjectsGrid projects={projects ?? []} />
      </div>
    </div>
  );
}
