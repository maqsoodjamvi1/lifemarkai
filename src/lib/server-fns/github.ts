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
createWebhook,
} from "@/lib/github/client";
import { logger } from "../logger.ts";
import { randomBytes } from "node:crypto";
import { verifyGatewayOAuthState } from "../oauth/gateway-state.ts";
import { deleteWebhook } from "@/lib/github/client";
import { getProjectAccess,canWriteProjectFiles } from "@/lib/project/access";

// ── OAuth callback: exchange code → token, save to profile ───────────────────
// `data.state` is the signed token minted by /api/github/start (see that
// route's header comment) — verifying it here closes an OAuth connect CSRF:
// without this, a code obtained through any means could be handed to a
// signed-in victim via a crafted /api/github/connect?code=...&state=...
// link and would silently overwrite the victim's own
// profiles.github_access_token with the attacker's token.
export async function completeGithubConnect(data: any) {
    if (!data.code) return { status: "denied" as const, redirectPath: "/dashboard?error=github_denied" };

    const stateSecret = process.env.OAUTH_STATE_SECRET;
    const state = data.state && stateSecret ? verifyGatewayOAuthState(data.state, stateSecret) : null;
    if (!state || state.connector !== "github") {
      return { status: "invalid_state" as const, redirectPath: "/dashboard?error=github_invalid_state" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const, redirectPath: "/login" };

    // The state was minted for a specific user — refuse to attach a token
    // obtained under one session to a different signed-in user.
    if (state.userId !== user.id) {
      return { status: "invalid_state" as const, redirectPath: "/dashboard?error=github_state_user_mismatch" };
    }

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

    await supabase
      .from("profiles")
      .update({ github_username: githubUser.login, github_access_token: accessToken })
      .eq("id", user.id);

    return { status: "ok" as const, redirectPath: state.returnTo };
}

// ── Commit history ──────────────────────────────────────────────────────────
export async function getRepoCommits(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.owner || !data.repo) return { status: "bad_request" as const };

    const { data: profile } = await supabase
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

/**
 * Pulls a branch's files from GitHub and stores them into project_files.
 * Shared by the manual Pull action below AND the push webhook
 * (src/routes/api/github/webhook.ts) — factored out so real bidirectional
 * sync (GitHub push -> LifemarkAI pull, no click required) reuses the exact
 * same write path and failure-tracking as a user-initiated pull, rather
 * than a second copy that could silently drift from it.
 */
export async function pullAndStoreFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  token: string,
  repo: string,
  branch: string,
): Promise<{ fileCount: number; failedPaths: string[] }> {
  const files = await pullFiles(token, repo, branch);
  const failedPaths: string[] = [];
  for (const file of files) {
    const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
    const { error } = await supabase.from("project_files").upsert(
      { project_id: projectId, path: file.path, content: file.content, language: LANG_MAP[ext] ?? "plaintext" },
      { onConflict: "project_id,path" },
    );
    if (error) failedPaths.push(file.path);
  }
  return { fileCount: files.length - failedPaths.length, failedPaths };
}

/**
 * Best-effort webhook registration so GitHub pushes flow back into
 * LifemarkAI automatically. Never throws — an OAuth token without
 * hook-admin rights on the repo (org repos the user doesn't administer,
 * some fine-grained PAT scopes) just means manual Pull stays the only way
 * to sync inbound, same as before this feature existed.
 */
async function ensureWebhookRegistered(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  token: string,
  repo: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("projects")
    .select("github_webhook_id")
    .eq("id", projectId)
    .single();
  if ((existing as { github_webhook_id?: number | null } | null)?.github_webhook_id) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const secret = randomBytes(24).toString("hex");
  try {
    const hook = await createWebhook(token, repo, `${appUrl}/api/github/webhook`, secret);
    const { error: persistError } = await supabase
      .from("projects")
      // github_webhook_secret/github_webhook_id aren't in the committed
      // generated Supabase types yet (no live type-regen capability in this
      // environment) — same `as never` pattern used elsewhere in this repo
      // for columns that exist live but aren't reflected there.
      .update({ github_webhook_secret: secret, github_webhook_id: hook.id } as never)
      .eq("id", projectId);
    if (persistError) {
      // The webhook now exists live on GitHub, but the app has no record
      // of it (the guard at the top of this function only checks
      // github_webhook_id, which was never persisted) — left as-is, the
      // next sync would create ANOTHER webhook on every call, forever.
      // Clean up the one we just created instead; best-effort, never
      // throws (deleteWebhook's own contract).
      logger.info("github.webhook.persist_failed", {
        projectId, repo, message: persistError.message,
      });
      deleteWebhook(token, repo, hook.id).catch(() => undefined);
    }
  } catch (error) {
    logger.info("github.webhook.register_failed", {
      projectId, repo,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function githubSync(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const { data: profile } = await supabase
      .from("profiles")
      .select("github_access_token, github_username")
      .eq("id", user.id)
      .single();
    if (!profile?.github_access_token) return { status: "not_connected" as const };

    const { data: project } = await supabase
      .from("projects")
      .select("*, project_files(*)")
      .eq("id", data.projectId)
      .single();
    if (!project) return { status: "not_found" as const };

    // RLS alone lets any authenticated user SELECT a public project (that's
    // by design — public projects are meant to be broadly readable/copyable
    // via the remix feature). Without an explicit write-level check here,
    // that same SELECT let action=create push a public project's ENTIRE
    // file set to a brand-new repo under the CALLER's own GitHub account —
    // a silent, git-based full-source copy distinct from (and more durable
    // than) the intended remix flow, leaving no trace in the app's own UI.
    // Every other mutating project route in this codebase gates on
    // canWriteProjectFiles; this one relied on RLS alone.
    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

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
      await supabase
        .from("projects")
        .update({ github_repo: repo.full_name, github_branch: branch })
        .eq("id", projectId);
      await ensureWebhookRegistered(supabase, projectId, token, repo.full_name);
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
      const { changed, commitSha, conflictBranch } = await pushChangedFiles(
        token, repo, branch, files,
        `Update from LifemarkAI · ${new Date().toISOString()}`,
      );
      await supabase.from("projects").update({ github_branch: branch }).eq("id", projectId);
      // Lazily registers on the first push after this feature shipped, for
      // projects that connected a repo before webhook sync existed.
      await ensureWebhookRegistered(supabase, projectId, token, repo);
      if (conflictBranch) {
        logger.info("github.sync.push_conflict", { projectId, branch, conflictBranch, commitSha });
      }
      logger.info("github.sync.push", { projectId, branch, changed, commitSha });
      return { status: "ok" as const, payload: { success: true, branch, changed, commitSha, conflictBranch } };
    }

    if (action === "pull") {
      const files = await pullFiles(token, repo, branch);
      // Every upsert's `{ error }` was discarded and the count returned was
      // the number FETCHED from GitHub, not the number written. A pull that
      // stored nothing reported "N files updated".
      const failedPaths: string[] = [];
      for (const file of files) {
        const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
        const { error } = await supabase.from("project_files").upsert(
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
