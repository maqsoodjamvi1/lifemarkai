import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ExternalLink, Github, Rocket, Eye } from "lucide-react";
import { fetchPublicProject } from "@/lib/public-server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";
import { RemixButton } from "@/components/marketing/remix-button";
import { ProjectViewTracker } from "@/components/marketing/project-view-tracker";

export const Route = createFileRoute("/p/$username/$projectSlug")({
  loader: async ({ params }) => {
    const result = await fetchPublicProject({
      data: { username: params.username, projectSlug: params.projectSlug },
    });
    if (result.status === "not_found") throw notFound();
    return result;
  },
  head: ({ loaderData, params }) => {
    const project = loaderData?.status === "ok" ? loaderData.project : null;
    const profile = loaderData?.status === "ok" ? loaderData.profile : null;
    const title = project
      ? `${project.name} by ${profile?.full_name || params.username} — LifemarkAI`
      : "Project — LifemarkAI";
    return {
      meta: [
        { title },
        { name: "description", content: project?.description || "A project built with LifemarkAI" },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-bold">Project not found</h1>
      <Link to="/explore" className="text-sm text-violet-600 hover:underline">
        Explore apps
      </Link>
    </div>
  ),
  component: PublicProjectPage,
});

function PublicProjectPage() {
  const data = Route.useLoaderData();
  const { username } = Route.useParams();
  if (data.status !== "ok") return null;
  const { profile, project, files, technologies } = data;

  return (
    <div className="min-h-screen bg-background">
      <ProjectViewTracker projectId={project.id} />

      <nav className="border-b border-border px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg">
          LifemarkAI
        </Link>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/signup">Start building</Link>
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile.avatar_url || ""} />
              <AvatarFallback>{profile.full_name?.[0] || username[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <Link
              to="/u/$username"
              params={{ username }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {profile.full_name || username}
            </Link>
          </div>

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
                  <a
                    href={`https://github.com/${project.github_repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
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
                <RemixButton projectId={project.id} remixCount={project.remix_count ?? 0} />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="capitalize">
              {project.framework}
            </Badge>
            {technologies.slice(0, 5).map((tech) => (
              <Badge key={tech} variant="outline" className="text-xs">
                {tech}
              </Badge>
            ))}
            <span>·</span>
            <span>Created {formatDate(project.created_at)}</span>
            {(project.total_views ?? 0) > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {Number(project.total_views).toLocaleString()} views
                </span>
              </>
            )}
            {project.deployed_url && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-green-500">
                  <Rocket className="h-3 w-3" /> Live
                </span>
              </>
            )}
          </div>
        </div>

        {project.deployed_url ? (
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 flex items-center gap-2 border-b border-border">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-muted-foreground font-mono flex-1 text-center">
                {project.deployed_url}
              </span>
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

        {files.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Files ({files.length})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {files.slice(0, 12).map((file: { path: string }) => (
                <div
                  key={file.path}
                  className="px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs font-mono truncate"
                >
                  {file.path}
                </div>
              ))}
              {files.length > 12 && (
                <div className="px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
                  +{files.length - 12} more
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 to-purple-500/10 p-8 text-center">
          <h3 className="text-xl font-bold mb-2">Build your own app with AI</h3>
          <p className="text-muted-foreground mb-6">
            Create full-stack apps in minutes — no coding required.
          </p>
          <Button size="lg" asChild>
            <Link to="/signup">Start building for free</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
