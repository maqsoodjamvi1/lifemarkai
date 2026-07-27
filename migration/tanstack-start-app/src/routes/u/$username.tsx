import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchPublicProfile } from "@/lib/public-server";

export const Route = createFileRoute("/u/$username")({
  loader: async ({ params }) => {
    const result = await fetchPublicProfile({ data: { username: params.username } });
    if (result.status === "not_found") throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    const profile = loaderData?.status === "ok" ? loaderData.profile : null;
    const name = profile?.full_name ?? profile?.username ?? "Profile";
    return {
      meta: [
        { title: `${name} — LifemarkAI` },
        {
          name: "description",
          content: profile?.bio ?? `${name}'s public projects on LifemarkAI`,
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-bold">Profile not found</h1>
      <Link to="/" className="text-violet-400 hover:underline text-sm">
        Back home
      </Link>
    </div>
  ),
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const data = Route.useLoaderData();
  if (data.status !== "ok") return null;
  const { profile, projects } = data;

  const initials = (profile.full_name ?? profile.username ?? "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const joinedYear = new Date(profile.created_at).getFullYear();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-bold text-lg tracking-tight">
            LifemarkAI
          </Link>
          <Link to="/dashboard" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Dashboard →
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-start gap-6 mb-12">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name ?? profile.username}
              className="w-20 h-20 rounded-2xl object-cover border border-white/10 shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-2xl font-bold shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{profile.full_name ?? profile.username}</h1>
            <p className="text-zinc-400 text-sm mt-0.5">@{profile.username}</p>
            {profile.bio && <p className="text-zinc-300 mt-3 max-w-xl leading-relaxed">{profile.bio}</p>}
            <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
              <span>Joined {joinedYear}</span>
              <span>{projects.length} public projects</span>
            </div>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <p className="text-lg font-medium">No public projects yet</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-5">Public projects</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project: any) => (
                <Link
                  key={project.id}
                  to="/p/$username/$projectSlug"
                  params={{
                    username: profile.username,
                    projectSlug: project.slug || project.id,
                  }}
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden hover:border-violet-500/30 hover:bg-white/[0.05] transition-all"
                >
                  <div className="aspect-video bg-zinc-900 overflow-hidden relative">
                    {project.preview_url ? (
                      <img
                        src={project.preview_url}
                        alt={project.name}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl opacity-20">⚡</div>
                    )}
                    <span className="absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/60 text-zinc-300 border border-white/10">
                      {project.framework}
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-sm truncate group-hover:text-violet-300">{project.name}</h3>
                    {project.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
