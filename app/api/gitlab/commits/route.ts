// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCommitHistory } from "@/lib/gitlab/client";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json();

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("gitlab_access_token")
    .eq("id", user.id)
    .single();

  if (!profile?.gitlab_access_token) {
    return NextResponse.json({ error: "GitLab not connected" }, { status: 400 });
  }

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("github_repo, github_branch")
    .eq("id", projectId)
    .single();

  if (!project?.github_repo?.startsWith("gitlab:")) {
    return NextResponse.json({ error: "No GitLab repo connected" }, { status: 400 });
  }

  const glProjectId = project.github_repo.replace("gitlab:", "");
  const branch = project.github_branch ?? "main";

  const commits = await getCommitHistory(profile.gitlab_access_token, glProjectId, branch, 20);
  return NextResponse.json({ commits });
}
