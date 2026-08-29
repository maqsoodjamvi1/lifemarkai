/**
 * Dashboard server functions — TanStack Start port of the async Server
 * Components that backed the Next.js dashboard.
 *
 * In Next.js the data was fetched inside async RSC page/layout bodies. Under
 * TanStack Start that becomes `createServerFn` handlers: they run only on the
 * server (RPC when called from a client-side loader), so they can use the
 * cookie-bound Supabase client and RLS exactly like the old server components.
 *
 *   app/(dashboard)/layout.tsx           → fetchDashboardShell()   (auth + sidebar data)
 *   app/(dashboard)/dashboard/page.tsx   → fetchDashboardHome()    (projects/profile/templates)
 *
 * The route files (_dashboard.tsx, _dashboard/dashboard.tsx) call these from
 * their `loader`, throwing `redirect({ to: "/login" })` when unauthenticated.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./supabase/server.ts";
import { getServerUser } from "./supabase/server-user.ts";
import type { User } from "@supabase/supabase-js";
import type { Database,Profile,Project } from "../types/database.ts";
import { extractSharedProjects } from "./dashboard/shared-projects.ts";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type TemplateRow = Database["public"]["Tables"]["templates"]["Row"];
type CreditLogRow = Database["public"]["Tables"]["credit_logs"]["Row"];
type DeploymentRow = Database["public"]["Tables"]["deployments"]["Row"];
type TeamRow = Database["public"]["Tables"]["teams"]["Row"];
type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];
type DashboardProject = Project & { project_files: { count: number }[] };
type FeaturedTemplate = Pick<TemplateRow, "id" | "name" | "description" | "category" | "fork_count" | "preview_url">;
type AnalyticsProject = Pick<ProjectRow, "id" | "name" | "created_at" | "status" | "framework">;
type AnalyticsDeployment = DeploymentRow & { projects: { name: string } | null };
type TeamSummary = { id: string; name: string; credits: number; role: string };
type TeamMemberSummary = Pick<TeamMemberRow, "id" | "role" | "credits_used" | "credit_allowance" | "accepted_at" | "invited_email"> & {
  profiles: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_url"> | null;
};
type TeamProjectSummary = Pick<ProjectRow, "id" | "name" | "status" | "framework" | "deployed_url">;
type TeamDetail = { team: TeamRow; members: TeamMemberSummary[]; projects: TeamProjectSummary[] };
const PROFILE_PLANS = new Set<Profile["plan"]>(["free", "pro", "business", "enterprise"]);
const PROJECT_FRAMEWORKS = new Set<Project["framework"]>([
  "static", "react", "next", "nextjs", "vue", "svelte", "react-native", "tanstack-start", "tanstack",
]);
const PROJECT_STATUSES = new Set<Project["status"]>(["active", "archived", "building"]);
const GIT_PROVIDERS = new Set<Project["git_provider"]>(["github", "gitlab", "none"]);

function normalizeProfile(row: ProfileRow | null): Profile | null {
  if (!row) return null;
  const plan: Profile["plan"] = PROFILE_PLANS.has(row.plan as Profile["plan"])
    ? (row.plan as Profile["plan"])
    : "free";
  return { ...row, plan, onboarding_complete: row.onboarding_complete ?? false };
}

function normalizeProject(row: ProjectRow): Project {
  return {
    ...row,
    framework: PROJECT_FRAMEWORKS.has(row.framework as Project["framework"])
      ? row.framework as Project["framework"]
      : "react",
    runtime: row.runtime === "static" ? "static" : "framework",
    status: PROJECT_STATUSES.has(row.status as Project["status"])
      ? row.status as Project["status"]
      : "active",
    git_provider: GIT_PROVIDERS.has(row.git_provider as Project["git_provider"])
      ? row.git_provider as Project["git_provider"]
      : "none",
  };
}

export interface DashboardShell {
  user: User | null;
  profile: Profile | null;
  recentProjects: { id: string; name: string; updated_at: string | null }[];
}

/** Layout data: verified user + profile + the sidebar's recent-projects rail. */
export const fetchDashboardShell = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardShell> => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { user: null, profile: null, recentProjects: [] };

    const [{ data: profile }, { data: recentProjects }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("projects")
        .select("id, name, updated_at")
        .eq("user_id", user.id)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

    return { user, profile: normalizeProfile(profile), recentProjects: recentProjects ?? [] };
  },
);

export interface DashboardHome {
  projects: DashboardProject[];
  /**
   * Projects another user owns and invited this user to collaborate on
   * (an accepted row in `collaborators`) — NOT this user's own public
   * projects. The dashboard's "Shared with me" tab (project-browser-tabs.tsx)
   * used to filter the *owned* project list by `is_public`, which can only
   * ever show a project this user made public themselves; a project someone
   * else actually shared was never fetched at all, so the tab was either
   * empty or showed the wrong projects for every collaborator. This list is
   * fetched separately so the tab has the right data to show.
   */
  sharedProjects: Project[];
  profile: Profile | null;
  featuredTemplates: FeaturedTemplate[];
}

/** Home page data: the user's projects, their profile, and featured templates. */
export const fetchDashboardHome = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardHome> => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { projects: [], sharedProjects: [], profile: null, featuredTemplates: [] };

    const [{ data: projects }, { data: profile }, { data: featuredTemplates }, { data: collabRows }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("*, project_files(count)")
          .eq("user_id", user.id)
          // Archived projects are hidden, not deleted. Before this, `status` was
          // written but nothing ever read it - every project in the database had
          // status 'active' and archiving one would have changed precisely nothing
          // while appearing to work. The filter is what gives the status meaning.
          .neq("status", "archived")
          .order("updated_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("templates")
          .select("id, name, description, category, fork_count, preview_url")
          .order("fork_count", { ascending: false })
          .limit(6),
        supabase
          .from("collaborators")
          .select("projects(*)")
          .eq("user_id", user.id)
          // Pending invites aren't "shared with me" yet — they show up
          // wherever invites are managed, not mixed into the project grid.
          .not("accepted_at", "is", null),
      ]);

    const sharedProjects = extractSharedProjects(
      (collabRows ?? []) as Array<{ projects: ProjectRow | null }>,
    ).map(normalizeProject);

    return {
      projects: (projects ?? []).map(({ project_files, ...project }) => ({
        ...normalizeProject(project),
        project_files,
      })),
      sharedProjects,
      profile: normalizeProfile(profile),
      featuredTemplates: featuredTemplates ?? [],
    };
  },
);

/** /dashboard/projects */
export const fetchProjectsPage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { projects: [] as ProjectRow[], profile: null as Profile | null };

  const [{ data: projects }, { data: profile }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);
  return { projects: projects ?? [], profile: normalizeProfile(profile) };
});

/** /dashboard/billing */
export const fetchBillingPage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) {
    return { profile: null as Profile | null, creditLogs: [] as CreditLogRow[], teams: [] as TeamSummary[] };
  }

  const [profileRes, logsRes, membershipsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("credit_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("team_members")
      .select("role, credits_used, credit_allowance, teams(id, name, credits)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
  ]);

  const teams = (membershipsRes.data ?? [])
    .map((m) => {
      const team = m.teams as { id: string; name: string; credits: number } | null;
      return {
        id: team?.id ?? "",
        name: team?.name ?? "",
        credits: team?.credits ?? 0,
        role: m.role,
      };
    })
    .filter((t: { id: string }) => t.id);

  return {
    profile: normalizeProfile(profileRes.data),
    creditLogs: logsRes.data ?? [],
    teams,
  };
});

/** /dashboard/analytics */
export const fetchAnalyticsPage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) {
    return {
      profile: null as Profile | null,
      projects: [] as AnalyticsProject[],
      creditLogs: [] as CreditLogRow[],
      deployments: [] as AnalyticsDeployment[],
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, created_at, status, framework")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const { data: creditLogs } = await supabase
    .from("credit_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const ids = (projects || []).map((p: { id: string }) => p.id);
  const { data: deployments } = ids.length
    ? await supabase
        .from("deployments")
        .select("*, projects(name)")
        .in("project_id", ids)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  return {
    profile: normalizeProfile(profile),
    projects: projects ?? [],
    creditLogs: creditLogs ?? [],
    deployments: deployments ?? [],
  };
});

/** /dashboard/team */
export const fetchTeamPage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) {
    return {
      profile: null as Profile | null,
      personalProjects: [] as Pick<ProjectRow, "id" | "name" | "status">[],
      teams: [] as TeamDetail[],
    };
  }

  const [profileRes, personalProjectsRes, membershipsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("projects")
      .select("id, name, status")
      .eq("user_id", user.id)
      .is("team_id", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("team_members")
      .select("team_id, teams(id, name, slug, plan, credits, max_members, owner_id)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
  ]);

  const teamIds = (membershipsRes.data ?? [])
    .map((m) => m.teams?.id)
    .filter(Boolean) as string[];

  const teamDetails = await Promise.all(
    teamIds.map(async (teamId) => {
      const [teamRes, membersRes, projectsRes] = await Promise.all([
        supabase.from("teams").select("*").eq("id", teamId).single(),
        supabase
          .from("team_members")
          .select(
            "id, role, credits_used, credit_allowance, accepted_at, invited_email, profiles!team_members_user_id_fkey(id, full_name, email, avatar_url)",
          )
          .eq("team_id", teamId)
          .order("created_at"),
        supabase
          .from("projects")
          .select("id, name, status, framework, deployed_url")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false }),
      ]);
      return {
        team: teamRes.data,
        members: membersRes.data ?? [],
        projects: projectsRes.data ?? [],
      };
    }),
  );

  return {
    profile: normalizeProfile(profileRes.data),
    personalProjects: personalProjectsRes.data ?? [],
    teams: teamDetails.filter((detail): detail is TeamDetail => detail.team !== null),
  };
});

/** Marketing templates gallery */
export const fetchTemplatesPage = createServerFn({ method: "GET" })
  .validator((d: { category?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const supabase = await createClient();
      let query = supabase
        .from("templates")
        .select("id, name, description, category, preview_url, fork_count")
        .order("fork_count", { ascending: false })
        .limit(48);
      if (data.category && data.category !== "All") {
        query = query.eq("category", data.category);
      }
      const { data: templates } = await query;
      const { user } = await getServerUser(supabase);
      return { templates: templates ?? [], signedIn: !!user };
    } catch (err) {
      console.warn("[fetchTemplatesPage]", err);
      return { templates: [], signedIn: false };
    }
  });

/** Explore public apps (includes owner username for /p deep-links). */
export const fetchExplorePage = createServerFn({ method: "GET" })
  .validator((d: { q?: string; framework?: string; sort?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const supabase = await createClient();
      let projectsQuery = supabase
        .from("projects")
        .select(
          "id, name, description, framework, deployed_url, preview_url, created_at, user_id, slug, star_count",
        )
        .eq("is_public", true)
        .limit(48);
      if (data.q) projectsQuery = projectsQuery.ilike("name", `%${data.q}%`);
      if (data.framework) projectsQuery = projectsQuery.eq("framework", data.framework);
      if (data.sort === "popular") {
        projectsQuery = projectsQuery.order("star_count", { ascending: false });
      } else {
        projectsQuery = projectsQuery.order("created_at", { ascending: false });
      }
      const { data: projects } = await projectsQuery;
      const rows = projects ?? [];
      const userIds = [...new Set(rows.map((p: { user_id: string }) => p.user_id).filter(Boolean))];
      const usernameById: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);
        for (const p of profiles ?? []) {
          if (p?.id && p?.username) usernameById[p.id] = p.username;
        }
      }
      return {
        projects: rows.map((p) => ({
          ...p,
          username: usernameById[p.user_id] ?? null,
        })),
      };
    } catch (err) {
      console.warn("[fetchExplorePage]", err);
      return { projects: [] };
    }
  });

