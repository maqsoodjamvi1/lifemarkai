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
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types/database";

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
      (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
      (supabase as any)
        .from("projects")
        .select("id, name, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

    return { user, profile: profile ?? null, recentProjects: recentProjects ?? [] };
  },
);

export interface DashboardHome {
  projects: any[];
  profile: Profile | null;
  featuredTemplates: any[];
}

/** Home page data: the user's projects, their profile, and featured templates. */
export const fetchDashboardHome = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardHome> => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { projects: [], profile: null, featuredTemplates: [] };

    const [{ data: projects }, { data: profile }, { data: featuredTemplates }] =
      await Promise.all([
        (supabase as any)
          .from("projects")
          .select("*, project_files(count)")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
        (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
        (supabase as any)
          .from("templates")
          .select("id, name, description, framework, fork_count, tags, preview_url")
          .order("fork_count", { ascending: false })
          .limit(6),
      ]);

    return {
      projects: projects ?? [],
      profile: profile ?? null,
      featuredTemplates: featuredTemplates ?? [],
    };
  },
);

/** /dashboard/projects */
export const fetchProjectsPage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { projects: [] as any[], profile: null as Profile | null };

  const [{ data: projects }, { data: profile }] = await Promise.all([
    (supabase as any)
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
  ]);
  return { projects: projects ?? [], profile: profile ?? null };
});

/** /dashboard/billing */
export const fetchBillingPage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) {
    return { profile: null as Profile | null, creditLogs: [] as any[], teams: [] as any[] };
  }

  const [profileRes, logsRes, membershipsRes] = await Promise.all([
    (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
    (supabase as any)
      .from("credit_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    (supabase as any)
      .from("team_members")
      .select("role, credits_used, credit_allowance, teams(id, name, credits)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
  ]);

  const teams = (membershipsRes.data ?? [])
    .map((m: any) => {
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
    profile: profileRes.data ?? null,
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
      projects: [] as any[],
      creditLogs: [] as any[],
      deployments: [] as any[],
    };
  }

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("id, name, created_at, status, framework")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const { data: creditLogs } = await (supabase as any)
    .from("credit_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const ids = (projects || []).map((p: { id: string }) => p.id);
  const { data: deployments } = ids.length
    ? await (supabase as any)
        .from("deployments")
        .select("*, projects(name)")
        .in("project_id", ids)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  return {
    profile: profile ?? null,
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
      personalProjects: [] as any[],
      teams: [] as any[],
    };
  }

  const [profileRes, personalProjectsRes, membershipsRes] = await Promise.all([
    (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
    (supabase as any)
      .from("projects")
      .select("id, name, status")
      .eq("user_id", user.id)
      .is("team_id", null)
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("team_members")
      .select("team_id, teams(id, name, slug, plan, credits, max_members, owner_id)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
  ]);

  const teamIds = (membershipsRes.data ?? [])
    .map((m: any) => (m.teams as { id: string } | null)?.id)
    .filter(Boolean) as string[];

  const teamDetails = await Promise.all(
    teamIds.map(async (teamId) => {
      const [teamRes, membersRes, projectsRes] = await Promise.all([
        (supabase as any).from("teams").select("*").eq("id", teamId).single(),
        (supabase as any)
          .from("team_members")
          .select(
            "id, role, credits_used, credit_allowance, accepted_at, invited_email, profiles(id, full_name, email, avatar_url)",
          )
          .eq("team_id", teamId)
          .order("created_at"),
        (supabase as any)
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
    profile: profileRes.data ?? null,
    personalProjects: personalProjectsRes.data ?? [],
    teams: teamDetails.filter((t) => t.team !== null),
  };
});

/** Marketing templates gallery */
export const fetchTemplatesPage = createServerFn({ method: "GET" })
  .validator((d: { category?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const supabase = await createClient();
      let query = (supabase as any)
        .from("templates")
        .select("id, name, description, framework, preview_url, fork_count, tags")
        .order("fork_count", { ascending: false })
        .limit(48);
      if (data.category && data.category !== "All") {
        query = query.contains("tags", [data.category]);
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
      let projectsQuery = (supabase as any)
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
      let usernameById: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("id, username")
          .in("id", userIds);
        for (const p of profiles ?? []) {
          if (p?.id && p?.username) usernameById[p.id] = p.username;
        }
      }
      return {
        projects: rows.map((p: any) => ({
          ...p,
          username: usernameById[p.user_id] ?? null,
        })),
      };
    } catch (err) {
      console.warn("[fetchExplorePage]", err);
      return { projects: [] };
    }
  });

