// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TeamPage } from "@/components/dashboard/team-page";

export const metadata = { title: "Team — LifemarkAI" };

export default async function TeamRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, personalProjectsRes, membershipsRes] = await Promise.all([
    (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
    (supabase as any).from("projects")
      .select("id, name, status")
      .eq("user_id", user.id)
      .is("team_id", null)
      .order("created_at", { ascending: false }),
    (supabase as any).from("team_members")
      .select("team_id, teams(id, name, slug, plan, credits, max_members, owner_id)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
  ]);

  // For each team, fetch full member + project data
  const teamIds = (membershipsRes.data ?? []).map((m) => {
    const t = m.teams as unknown as { id: string } | null;
    return t?.id;
  }).filter(Boolean) as string[];

  const teamDetails = await Promise.all(
    teamIds.map(async (teamId) => {
      const [teamRes, membersRes, projectsRes] = await Promise.all([
        (supabase as any).from("teams").select("*").eq("id", teamId).single(),
        (supabase as any).from("team_members")
          .select("id, role, credits_used, credit_allowance, accepted_at, invited_email, profiles(id, full_name, email, avatar_url)")
          .eq("team_id", teamId)
          .order("created_at"),
        (supabase as any).from("projects")
          .select("id, name, status, framework, deployed_url")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false }),
      ]);
      return {
        team:     teamRes.data,
        members:  membersRes.data ?? [],
        projects: projectsRes.data ?? [],
      };
    })
  );

  const validTeams = teamDetails.filter((t) => t.team !== null) as Array<{
    team: NonNullable<typeof teamDetails[number]["team"]>;
    members: typeof teamDetails[number]["members"];
    projects: typeof teamDetails[number]["projects"];
  }>;

  return (
    <TeamPage
      profile={profileRes.data ?? null}
      personalProjects={personalProjectsRes.data ?? []}
      teams={validTeams}
    />
  );
}
