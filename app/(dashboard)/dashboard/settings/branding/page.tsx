// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WorkspaceBrandingPage } from "@/components/dashboard/workspace-branding-page";

export const metadata = { title: "Workspace Branding — LifemarkAI" };

export default async function BrandingRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Branding/white-label is team-scoped — resolve the user's first team.
  const { data: memberships } = await (supabase as any)
    .from("team_members")
    .select("teams(id, plan)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);

  const team = (memberships ?? [])
    .map((m: any) => m.teams)
    .filter(Boolean)[0] as { id: string; plan?: string } | undefined;

  if (!team) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold">Workspace Branding</h1>
        <p className="text-sm text-muted-foreground">
          Branding &amp; white-label is a team workspace feature. Create or join a team to
          customize your logo, colors, support email, and custom domain.
        </p>
        <a href="/dashboard/team" className="mt-4 inline-block text-sm text-primary underline">
          Go to Team settings
        </a>
      </div>
    );
  }

  return <WorkspaceBrandingPage teamId={team.id} plan={team.plan ?? "free"} />;
}
