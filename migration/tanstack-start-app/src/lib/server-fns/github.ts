/**
 * Native GitHub server-fns — reimplemented off the worker using the ported
 * lib/github/client (Octokit). Ports of app/api/github/{connect,commits,sync}.
 */
import { createClient } from "../supabase/server.ts";
import {
  getCommitHistory,
  pushFiles,
  pullFiles,
  createRepo,
  ensureBranch,
  pushChangedFiles,
  getBranchStatus,
  createOrGetPR,
} from "@/lib/github/client";
import { logger } from "../logger.ts";

// ── OAuth callback: exchange code → token, save to profile ───────────────────
export async function completeGithubConnect(data: any) {
    if (!data.code) return { status: "denied" as const, redirectPath: "/dashboard?error=github_denied" };

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: data.code,
      }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) return { status: "no_token" as const, redirectPath: "/dashboard?error=github_token" };

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const githubUser = await userRes.json();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const, redirectPath: "/login" };

    await (supabase as any)
      .from("profiles")
      .update({ github_username: githubUser.login, github_access_token: accessToken })
      .eq("id", user.id);

    return {
      status: "ok" as const,
      redirectPath: data.projectId
        ? `/editor/${data.projectId}?github=connected`
        : "/dashboard?github=connected",
    };
}

// ── Commit history ──────────────────────────────────────────────────────────
export async function getRepoCommits(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.owner || !data.repo) return { status: "bad_request" as const };

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("github_access_token, github_username")
      .eq("id", user.id)
      .single();
    if (!profile?.github_access_token) return { status: "not_connected" as const };

    try {
      const commits = await getCommitHistory(profile.github_access_token, data.owner, data.repo, data.perPage);
      return { status: "ok" as const, commits };
    } catch (error: any) {
      return { status: "error" as const, message: error?.message ?? "Failed to fetch commits" };
    }
}

// ── Sync (create / push / pull / pr / status) ────────────────────────────────
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
  js: "javascript", jsx: "javascriptreact",
  css: "css", html: "html", json: "json", md: "markdown",
  sql: "sql", sh: "shell", yaml: "yaml", yml: "yaml",
};

export async function githubSync(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("github_access_token, github_username")
      .eq("id", user.id)
      .single();
    if (!profile?.github_access_token) return { status: "not_connected" as const };

    const { data: project } = await (supabase as any)
      .from("projects")
      .select("*, project_files(*)")
      .eq("id", data.projectId)
      .single();
    if (!project) return { status: "not_found" as const };

    const token = profile.github_access_token;
    const { projectId, action } = data;

    if (action === "create") {
      const repoSlug = project.name.toLowerCase().replace(/\s+/g, "-");
      const repo = await createRepo(token, repoSlug, project.description ?? undefined);
      const files = (project.project_files ?? []).map((f: { path: string; content: string }) => ({
        path: f.path, content: f.content,
      }));
      await pushFiles(token, repo.full_name, files, "Initial commit from LifemarkAI 🚀");
      const branch = projectBranchName(project.name, projectId);
      await ensureBranch(token, repo.full_name, branch, "main");
      await (supabase as any)
        .from("projects")
        .update({ github_repo: repo.full_name, github_branch: branch })
        .eq("id", projectId);
      logger.info("github.sync.create", { projectId, repo: repo.full_name, branch });
      return { status: "ok" as const, payload: { repo: repo.full_name, url: repo.html_url, branch } };
    }

    if (!project.github_repo) return { status: "no_repo" as const };
    const repo = project.github_repo as string;
    const branch =
      project.github_branch && project.github_branch !== "main"
        ? (project.github_branch as string)
        : projectBranchName(project.name, projectId);

    if (action === "push") {
      await ensureBranch(token, repo, branch, "main");
      const files = (project.project_files ?? []).map((f: { path: string; content: string }) => ({
        path: f.path, content: f.content,
      }));
      const { changed, commitSha } = await pushChangedFiles(
        token, repo, branch, files,
        `Update from LifemarkAI · ${new Date().toISOString()}`,
      );
      await (supabase as any).from("projects").update({ github_branch: branch }).eq("id", projectId);
      logger.info("github.sync.push", { projectId, branch, changed, commitSha });
      return { status: "ok" as const, payload: { success: true, branch, changed, commitSha } };
    }

    if (action === "pull") {
      const files = await pullFiles(token, repo, branch);
      // Every upsert's `{ error }` was discarded and the count returned was
      // the number FETCHED from GitHub, not the number written. A pull that
      // stored nothing reported "N files updated".
      const failedPaths: string[] = [];
      for (const file of files) {
        const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
        const { error } = await (supabase as any).from("project_files").upsert(
          { project_id: projectId, path: file.path, content: file.content, language: LANG_MAP[ext] ?? "plaintext" },
          { onConflict: "project_id,path" },
        );
        if (error) failedPaths.push(file.path);
      }
      if (failedPaths.length > 0) {
        logger.error("github.sync.pull_write_failed", new Error("project_files upsert failed"), {
          projectId,
          branch,
          failed: failedPaths.length,
          paths: failedPaths.slice(0, 10),
        });
      }
      logger.info("github.sync.pull", {
        projectId,
        branch,
        fileCount: files.length - failedPaths.length,
      });
      return {
        status: "ok" as const,
        payload: {
          files: files.length - failedPaths.length,
          failed: failedPaths.length,
          branch,
          // The editor holds the PRE-pull content in memory. Without handing
          // the new files back, the next keystroke autosave PATCHes the stale
          // version straight over what was just pulled — the user pulls a
          // teammate's work and silently overwrites it.
          pulledFiles: files
            .filter((f) => !failedPaths.includes(f.path))
            .map((f) => ({
              path: f.path,
              content: f.content,
              language: LANG_MAP[f.path.split(".").pop()?.toLowerCase() ?? ""] ?? "plaintext",
            })),
        },
      };
    }

    if (action === "pr") {
      await ensureBranch(token, repo, branch, "main");
      const pr = await createOrGetPR(
        token, repo, branch, "main",
        `Changes from LifemarkAI · ${project.name}`,
        `This pull request was generated by [LifemarkAI](https://lifemarkai.app).\n\n**Project:** ${project.name}`,
      );
      logger.info("github.sync.pr", { projectId, branch, prNumber: pr.number });
      return { status: "ok" as const, payload: { pr } };
    }

    if (action === "status") {
      try {
        await ensureBranch(token, repo, branch, "main");
        const st = await getBranchStatus(token, repo, branch, "main");
        return { status: "ok" as const, payload: { branch, ...st } };
      } catch {
        return { status: "ok" as const, payload: { branch, ahead: 0, behind: 0, diverged: false } };
      }
    }

    return { status: "unknown_action" as const };
}
