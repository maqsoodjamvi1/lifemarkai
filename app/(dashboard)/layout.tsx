import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { PwaInstallPrompt } from "@/components/dashboard/pwa-install-prompt";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const [{ data: profile }, { data: recentProjects }] = await Promise.all([
    (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
    (supabase as any)
      .from("projects")
      .select("id, name, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar user={user} profile={profile} recentProjects={recentProjects ?? []} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
      <PwaInstallPrompt />
    </div>
  );
}
