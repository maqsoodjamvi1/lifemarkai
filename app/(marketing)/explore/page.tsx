import { createClient } from "@/lib/supabase/server";
import { ExploreClient } from "@/components/marketing/explore-client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.app";

export const metadata = {
  title: "Explore — LifemarkAI",
  description: "Browse and fork apps built by the community. See what others are building with AI.",
  openGraph: {
    title: "Explore Apps — LifemarkAI",
    description: "Browse and fork apps built by the community. See what others are building with AI.",
    url: `${APP_URL}/explore`,
    images: [{ url: `${APP_URL}/og-image.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Apps — LifemarkAI",
    description: "Browse and fork apps built by the community.",
  },
};

export const revalidate = 60; // ISR: re-render every 60s

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: { q?: string; framework?: string; sort?: string };
}) {
  const supabase = await createClient();

  const query = searchParams.q ?? "";
  const framework = searchParams.framework ?? "";
  const sort = searchParams.sort ?? "recent";

  // Fetch public projects
  let projectsQuery = (supabase as any)
    .from("projects")
    .select("id, name, description, framework, deployed_url, preview_url, created_at, user_id, slug, star_count")
    .eq("is_public", true)
    .limit(48);

  if (query) projectsQuery = projectsQuery.ilike("name", `%${query}%`);
  if (framework) projectsQuery = projectsQuery.eq("framework", framework);
  if (sort === "popular") {
    projectsQuery = projectsQuery.order("star_count", { ascending: false });
  } else if (sort === "recent") {
    projectsQuery = projectsQuery.order("created_at", { ascending: false });
  } else {
    projectsQuery = projectsQuery.order("name", { ascending: true });
  }

  const { data: projects } = await projectsQuery;

  // For popular sort: also fetch 7-day view counts to display alongside star count
  let viewCountMap: Record<string, number> = {};
  if (sort === "popular") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentViews } = await (supabase as any)
      .from("project_views")
      .select("project_id")
      .gte("viewed_at", sevenDaysAgo);
    (recentViews ?? []).forEach((v: { project_id: string }) => {
      viewCountMap[v.project_id] = (viewCountMap[v.project_id] ?? 0) + 1;
    });
  }

  // Fetch featured templates
  const { data: templates } = await (supabase as any)
    .from("templates")
    .select("id, name, description, framework, preview_url, fork_count, tags")
    .order("fork_count", { ascending: false })
    .limit(12);

  // Fetch trending projects — top 3 by view count in past 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentViews } = await (supabase as any)
    .from("project_views")
    .select("project_id")
    .gte("viewed_at", sevenDaysAgo);

  const viewCounts: Record<string, number> = {};
  (recentViews ?? []).forEach((v: { project_id: string }) => {
    viewCounts[v.project_id] = (viewCounts[v.project_id] ?? 0) + 1;
  });
  const topIds = Object.entries(viewCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((entry) => entry[0]);

  type TrendingProject = { id: string; name: string; description: string | null; framework: string; deployed_url: string | null; created_at: string; user_id: string; slug: string | null };
  let trendingProjects: TrendingProject[] = [];
  if (topIds.length > 0) {
    const { data: trendingData } = await (supabase as any)
      .from("projects")
      .select("id, name, description, framework, deployed_url, created_at, user_id, slug")
      .in("id", topIds)
      .eq("is_public", true);
    trendingProjects = ((trendingData ?? []) as TrendingProject[]).sort(
      (a: TrendingProject, b: TrendingProject) => (viewCounts[b.id] ?? 0) - (viewCounts[a.id] ?? 0)
    );
  }

  // Resolve owner usernames so cards can link to the SEO showcase pages
  // (/p/<username>/<slug>) — the indexable, view-tracked, remixable surface.
  const ownerIds = [
    ...new Set([...(projects ?? []), ...trendingProjects].map((p: { user_id: string }) => p.user_id)),
  ];
  const usernameMap: Record<string, string | null> = {};
  if (ownerIds.length > 0) {
    const { data: owners } = await (supabase as any)
      .from("profiles")
      .select("id, username")
      .in("id", ownerIds);
    (owners ?? []).forEach((o: { id: string; username: string | null }) => {
      usernameMap[o.id] = o.username;
    });
  }
  const withOwner = <T extends { user_id: string }>(arr: T[]) =>
    arr.map((p) => ({ ...p, owner_username: usernameMap[p.user_id] ?? null }));

  // Get current user (optional — for fork button state)
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch which projects the current user has already starred
  let initialStarred: string[] = [];
  if (user && (projects ?? []).length > 0) {
    const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
    const { data: starredRows } = await (supabase as any)
      .from("community_stars")
      .select("project_id")
      .eq("user_id", user.id)
      .in("project_id", projectIds);
    initialStarred = (starredRows ?? []).map((r: { project_id: string }) => r.project_id);
  }

  return (
    <ExploreClient
      projects={withOwner(projects ?? [])}
      templates={templates ?? []}
      trendingProjects={withOwner(trendingProjects)}
      viewCounts={viewCounts}
      userId={user?.id ?? null}
      initialQuery={query}
      initialFramework={framework}
      initialSort={sort}
      initialStarred={initialStarred}
    />
  );
}
