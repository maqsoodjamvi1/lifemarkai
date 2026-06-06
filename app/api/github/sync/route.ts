import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  pushFiles,
  pullFiles,
  createRepo,
  ensureBranch,
  pushChangedFiles,
  getBranchStatus,
  createOrGetPR,
} from "@/lib/github/client";
import { logger } from "@/lib/logger";

/** Derive a safe branch name for a project: lifemark/<slug>-<id-prefix> */
function projectBranchName(projectName: string, projectId: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return `lifemark/${slug}-${projectId.slice(0, 8)}`;
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescriptreact",
  js: "javascript",  jsx: "javascriptreact",
  css: "css", html: "html", json: "json", md: "markdown",
  sql: "sql", sh: "shell", yaml: "yaml", yml: "yaml",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, action } = await req.json();
  // action: "create" | "push" | "pull" | "pr" | "status"

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("github_access_token, github_username")
    .eq("id", user.id)
    .single();
  if (!profile?.github_access_token) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
  }

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("*, project_files(*)")
    .eq("id", projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const token = profile.github_access_token;

  // ── Create repo ─────────────────────────────────────────────────────────────
  if (action === "create") {
    const repoSlug = project.name.toLowerCase().replace(/\s+/g, "-");
    const repo = await createRepo(token, repoSlug, project.description ?? undefined);
    const files = (project.project_files ?? []).map((f: { path: string; content: string }) => ({
      path: f.path, content: f.content,
    }));

    // Push initial files to main, then ensure project branch
    await pushFiles(token, repo.full_name, files, "Initial commit from LifemarkAI 🚀");
    const branch = projectBranchName(project.name, projectId);
    await ensureBranch(token, repo.full_name, branch, "main");

    await (supabase as any)
      .from("projects")
      .update({ github_repo: repo.full_name, github_branch: branch })
      .eq("id", projectId);

    logger.info("github.sync.create", { projectId, repo: repo.full_name, branch });
    return NextResponse.json({ repo: repo.full_name, url: repo.html_url, branch });
  }

  if (!project.github_repo) {
    return NextResponse.json({ error: "No GitHub repo connected" }, { status: 400 });
  }

  const repo = project.github_repo as string;

  // Derive/restore branch name (upgrade old projects that only have "main")
  let branch = (project.github_branch && project.github_branch !== "main")
    ? project.github_branch as string
    : projectBranchName(project.name, projectId);

  // ── Push ────────────────────────────────────────────────────────────────────
  if (action === "push") {
    // Ensure branch exists before pushing
    await ensureBranch(token, repo, branch, "main");

    const files = (project.project_files ?? []).map((f: { path: string; content: string }) => ({
      path: f.path, content: f.content,
    }));

    const { changed, commitSha } = await pushChangedFiles(
      token, repo, branch, files,
      `Update from LifemarkAI · ${new Date().toISOString()}`
    );

    // Persist branch name in case this is the first push for a legacy project
    await (supabase as any).from("projects").update({ github_branch: branch }).eq("id", projectId);

    logger.info("github.sync.push", { projectId, branch, changed, commitSha });
    return NextResponse.json({ success: true, branch, changed, commitSha });
  }

  // ── Pull ────────────────────────────────────────────────────────────────────
  if (action === "pull") {
    const files = await pullFiles(token, repo, branch);

    for (const file of files) {
      const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
      await (supabase as any).from("project_files").upsert({
        project_id: projectId,
        path: file.path,
        content: file.content,
        language: LANG_MAP[ext] ?? "plaintext",
      }, { onConflict: "project_id,path" });
    }

    logger.info("github.sync.pull", { projectId, branch, fileCount: files.length });
    return NextResponse.json({ files: files.length, branch });
  }

  // ── PR ──────────────────────────────────────────────────────────────────────
  if (action === "pr") {
    // Ensure the branch exists first
    await ensureBranch(token, repo, branch, "main");

    const pr = await createOrGetPR(
      token, repo, branch, "main",
      `Changes from LifemarkAI · ${project.name}`,
      `This pull request was generated by [LifemarkAI](https://lifemarkai.app).\n\n**Project:** ${project.name}`
    );

    logger.info("github.sync.pr", { projectId, branch, prNumber: pr.number });
    return NextResponse.json({ pr });
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  if (action === "status") {
    try {
      // Make sure branch exists before checking status
      await ensureBranch(token, repo, branch, "main");
      const status = await getBranchStatus(token, repo, branch, "main");
      return NextResponse.json({ branch, ...status });
    } catch {
      return NextResponse.json({ branch, ahead: 0, behind: 0, diverged: false });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
