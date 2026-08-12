import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getCommitHistory } from "@/lib/gitlab/client";

/** Native /api/gitlab/commits — commit history for a GitLab-linked project. */
export const Route = createFileRoute("/api/gitlab/commits")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId } = await request.json();

        const { data: profile } = await supabase
          .from("profiles").select("gitlab_access_token").eq("id", user.id).single();
        if (!profile?.gitlab_access_token) {
          return Response.json({ error: "GitLab not connected" }, { status: 400 });
        }

        const { data: project } = await supabase
          .from("projects").select("github_repo, github_branch").eq("id", projectId).single();
        if (!project?.github_repo?.startsWith("gitlab:")) {
          return Response.json({ error: "No GitLab repo connected" }, { status: 400 });
        }

        const glProjectId = project.github_repo.replace("gitlab:", "");
        const branch = project.github_branch ?? "main";

        const commits = await getCommitHistory(profile.gitlab_access_token, glProjectId, branch, 20);
        return Response.json({ commits });
      },
    },
  },
});
