// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Github, Rocket, GitFork, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";
import { RemixButton } from "@/components/marketing/remix-button";
import { ProjectViewTracker } from "@/components/marketing/project-view-tracker";

interface PublicProjectPageProps {
  params: Promise<{ username: string; projectSlug: string }>;
}

export async function generateMetadata({ params }: PublicProjectPageProps): Promise<Metadata> {
  const { username, projectSlug } = await params;
  const supabase = await createClient();
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("id, full_name")
    .eq("username", username)
    .single();

  if (!profile) return { title: "Project Not Found" };

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("name, description")
    .eq("user_id", profile.id)
    .eq("is_public", true)
    .eq("slug", projectSlug)
    .single();

  if (!project) return { title: "Project Not Found" };

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.app";
  const title = `${project.name} by ${profile.full_name || username} — LifemarkAI`;
  const description = project.description || `A project built with LifemarkAI`;
  const ogImageUrl = `${APP_URL}/preview/${project.id}/og`;
  const pageUrl = `${APP_URL}/p/${username}/${projectSlug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "website",
      siteName: "LifemarkAI",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: project.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicProjectPage({ params }: PublicProjectPageProps) {
  const { username, projectSlug } = await params;
  const supabase = await createClient();

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, avatar_url, username")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("*")
    .eq("user_id", profile.id)
    .eq("is_public", true)
    .eq("slug", projectSlug)
    .single();

  if (!project) notFound();

  const { data: files } = await (supabase as any)
    .from("project_files")
    .select("path, language")
    .eq("project_id", project.id)
    .limit(50);

  const technologies = [...new Set((files || []).map((f) => f.language).filter(Boolean))];

  return (
    <div className="min-h-screen bg-background">
      {/* Silently track this page view */}
      <ProjectViewTracker projectId={project.id} />

      {/* Navbar */}
      <nav className="border-b border-border px-6 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg gradient-text">
          LifemarkAI
        </Link>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">Start building</Link>
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile.avatar_url || ""} />
              <AvatarFallback>{profile.full_name?.[0] || username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm text-muted-foreground">
                <Link href={`/p/${username}`} className="hover:text-foreground transition-colors">
                  {profile.full_name || username}
                </Link>
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">{project.name}</h1>
                {project.description && (
                  <p className="text-muted-foreground mt-2">{project.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {project.github_repo && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://github.com/${project.github_repo}`} target="_blank" rel="noopener noreferrer">
                      <Github className="h-4 w-4 mr-1.5" /> GitHub
                    </a>
                  </Button>
                )}
                {project.deployed_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={project.deployed_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1.5" /> Live App
                    </a>
                  </Button>
                )}
                {project.remix_enabled && (
                  <RemixButton projectId={project.id} remixCount={project.remix_count} />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="capitalize">{project.framework}</Badge>
            {technologies.slice(0, 5).map((tech) => (
              <Badge key={tech} variant="outline" className="text-xs">{tech}</Badge>
            ))}
            <span>·</span>
            <span>Created {formatDate(project.created_at)}</span>
            {(project.total_views ?? 0) > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  {(project.total_views as number).toLocaleString()} views
                </span>
              </>
            )}
            {/* "live" is a deployment status, never a project status — a project
                is live when it has a deployed URL */}
            {project.deployed_url && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-green-500">
                  <Rocket className="h-3 w-3" /> Live
                </span>
              </>
            )}
          </div>
        </div>

        {/* Preview */}
        {project.deployed_url ? (
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 flex items-center gap-2 border-b border-border">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-muted-foreground font-mono flex-1 text-center">{project.deployed_url}</span>
              <a href={project.deployed_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
              </a>
            </div>
            <iframe
              src={project.deployed_url}
              className="w-full h-[500px] bg-white"
              title={project.name}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-muted/30 flex items-center justify-center h-48">
            <div className="text-center">
              <Rocket className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No live preview available</p>
            </div>
          </div>
        )}

        {/* Files */}
        {files && files.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Files ({files.length})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {files.slice(0, 12).map((file) => (
                <div
                  key={file.path}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs font-mono"
                >
                  <span className="text-muted-foreground truncate">{file.path}</span>
                </div>
              ))}
              {files.length > 12 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
                  +{files.length - 12} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 to-purple-500/10 p-8 text-center">
          <h3 className="text-xl font-bold mb-2">Build your own app with AI</h3>
          <p className="text-muted-foreground mb-6">
            LifemarkAI lets you create full-stack apps in minutes — no coding required.
          </p>
          <Button size="lg" asChild>
            <Link href="/signup">Start building for free</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
