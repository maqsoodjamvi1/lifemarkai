// @ts-nocheck
/**
 * GitLab sync route — mirrors app/api/github/sync/route.ts
 *
 * Actions: create | push | pull | mr | status
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createRepo,
  ensureBranch,
  pushFiles,
  pushChangedFiles,
  pullFiles,
  getBranchStatus,
  createOrGetMR,
} from "@/lib/gitlab/client";
import { logger } from "@/lib/logger";

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescriptreact",
  js: "javascript",  jsx: "javascriptreact",
  css: "css", html: "html", json: "json", md: "markdown",
  sql: "sql", sh: "shell", yaml: "yaml", yml: "yaml",
};

function projectBranchName(projectName: string, projectId: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return `lifemark/${slug}-${projectId.slice(0, 8)}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, action } = await req.json();

  // Load profile — need GitLab token
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("gitlab_access_token, gitlab_username")
    .eq("id", user.id)
    .single();

  if (!profile?.gitlab_access_token) {
    return NextResponse.json({ error: "GitLab not connected" }, { status: 400 });
  }

  const token: string = profile.gitlab_access_token;

  // Load project with files
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("*, project_files(*)")
    .eq("id", projectId)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // ── Create ────────────────────────────────────────────────────────────────
  if (action === "create") {
    const repoSlug = project.name.toLowerCase().replace(/\s+/g, "-");
    const repo = await createRepo(token, repoSlug, project.description ?? undefined);

    const files = (project.project_files ?? []).map((f: any) => ({
      path: f.path, content: f.content,
    }));

    // Initial commit to default branch, then create project branch
    await pushFiles(token, repo.id, files, "Initial commit from LifemarkAI 🚀", repo.default_branch);
    const branch = projectBranchName(project.name, projectId);
    await ensureBranch(token, repo.id, branch, repo.default_branch);

    // Store the GitLab numeric project ID in github_repo field (prefixed) so existing
    // project_files queries keep working. We also set git_provider.
    const repoRef = `gitlab:${repo.id}`;
    await (supabase as any)
      .from("projects")
      .update({ github_repo: repoRef, github_branch: branch, git_provider: "gitlab" })
      .eq("id", projectId);

    logger.info("gitlab.sync.create", { projectId, repoId: repo.id, namespace: repo.path_with_namespace, branch });
    return NextResponse.json({ repo: repo.path_with_namespace, url: repo.web_url, branch });
  }

  // Resolve stored GitLab project ID (stored as "gitlab:<id>")
  const rawRepo: string = project.github_repo ?? "";
  if (!rawRepo.startsWith("gitlab:")) {
    return NextResponse.json({ error: "No GitLab repo connected to this project" }, { status: 400 });
  }
  const glProjectId = rawRepo.replace("gitlab:", "");

  let branch = (project.github_branch && project.github_branch !== "main")
    ? project.github_branch as string
    : projectBranchName(project.name, projectId);

  // ── Push ──────────────────────────────────────────────────────────────────
  if (action === "push") {
    await ensureBranch(token, glProjectId, branch);

    const files = (project.project_files ?? []).map((f: any) => ({
      path: f.path, content: f.content,
    }));

    const { changed } = await pushChangedFiles(
      token, glProjectId, branch, files,
      `Update from LifemarkAI · ${new Date().toISOString()}`
    );

    await (supabase as any).from("projects").update({ github_branch: branch }).eq("id", projectId);

    logger.info("gitlab.sync.push", { projectId, branch, changed });
    return NextResponse.json({ success: true, branch, changed });
  }

  // ── Pull ──────────────────────────────────────────────────────────────────
  if (action === "pull") {
    const files = await pullFiles(token, glProjectId, branch);

    for (const file of files) {
      const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
      await (supabase as any).from("project_files").upsert({
        project_id: projectId,
        path: file.path,
        content: file.content,
        language: LANG_MAP[ext] ?? "plaintext",
      }, { onConflict: "project_id,path" });
    }

    logger.info("gitlab.sync.pull", { projectId, branch, fileCount: files.length });
    return NextResponse.json({ files: files.length, branch });
  }

  // ── MR (Merge Request) ────────────────────────────────────────────────────
  if (action === "mr") {
    await ensureBranch(token, glProjectId, branch);

    const mr = await createOrGetMR(
      token, glProjectId, branch, "main",
      `Changes from LifemarkAI · ${project.name}`,
      `This merge request was generated by [LifemarkAI](https://lifemarkai.app).\n\n**Project:** ${project.name}`
    );

    logger.info("gitlab.sync.mr", { projectId, branch, mrIid: mr.iid });
    return NextResponse.json({ mr });
  }

  // ── Status ────────────────────────────────────────────────────────────────
  if (action === "status") {
    try {
      await ensureBranch(token, glProjectId, branch);
      const status = await getBranchStatus(token, glProjectId, branch, "main");
      return NextResponse.json({ branch, ...status });
    } catch {
      return NextResponse.json({ branch, ahead: 0, behind: 0, diverged: false });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
