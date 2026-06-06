import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("full_name, bio, avatar_url")
    .eq("username", username)
    .eq("is_public", true)
    .single();

  if (!profile) return { title: "Profile not found" };

  return {
    title: `${profile.full_name ?? username} — LifemarkAI`,
    description: profile.bio ?? `${profile.full_name ?? username}'s public projects on LifemarkAI`,
    openGraph: {
      images: profile.avatar_url ? [profile.avatar_url] : [],
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  // Fetch public profile
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio, github_username, created_at")
    .eq("username", username)
    .eq("is_public", true)
    .single();

  if (!profile) notFound();

  // Fetch user's public projects
  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("id, name, description, preview_url, deployed_url, framework, created_at, slug")
    .eq("user_id", profile.id)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(24);

  const initials = (profile.full_name ?? profile.username ?? "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const joinedYear = new Date(profile.created_at).getFullYear();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight">
            ⚡ LifemarkAI
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Dashboard →
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Profile hero */}
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
            <h1 className="text-2xl font-bold text-white">
              {profile.full_name ?? profile.username}
            </h1>
            <p className="text-zinc-400 text-sm mt-0.5">@{profile.username}</p>

            {profile.bio && (
              <p className="text-zinc-300 mt-3 max-w-xl leading-relaxed">
                {profile.bio}
              </p>
            )}

            <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
              <span>Joined {joinedYear}</span>
              {profile.github_username && (
                <a
                  href={`https://github.com/${profile.github_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  {profile.github_username}
                </a>
              )}
              <span>{(projects ?? []).length} public projects</span>
            </div>
          </div>
        </div>

        {/* Projects grid */}
        {(projects ?? []).length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <p className="text-lg font-medium">No public projects yet</p>
            <p className="text-sm mt-2">
              {profile.full_name ?? profile.username} hasn&apos;t shared any projects publicly.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-white mb-5">
              Public projects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(projects ?? []).map(
                (project: {
                  id: string;
                  name: string;
                  description: string | null;
                  preview_url: string | null;
                  deployed_url: string | null;
                  framework: string;
                  slug: string | null;
                }) => (
                  <Link
                    key={project.id}
                    href={
                      project.slug
                        ? `/p/${profile.username}/${project.slug}`
                        : `/p/${profile.username}/${project.id}`
                    }
                    className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden hover:border-violet-500/30 hover:bg-white/[0.05] transition-all"
                  >
                    {/* Preview thumbnail */}
                    <div className="aspect-video bg-zinc-900 overflow-hidden relative">
                      {project.preview_url ? (
                        <img
                          src={project.preview_url}
                          alt={project.name}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl opacity-20">⚡</span>
                        </div>
                      )}
                      {/* Framework badge */}
                      <span className="absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-zinc-300 border border-white/10">
                        {project.framework}
                      </span>
                    </div>

                    <div className="p-4">
                      <h3 className="font-semibold text-sm text-white truncate group-hover:text-violet-300 transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                          {project.description}
                        </p>
                      )}
                      {project.deployed_url && (
                        <p className="text-[10px] text-zinc-600 mt-2 font-mono truncate">
                          {project.deployed_url.replace(/^https?:\/\//, "")}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
