/**
 * Native /api/github/import — reimplemented off the worker.
 * Port of app/api/github/import/route.ts (now that credits + rate-limit +
 * code-parser + octokit all resolve in src). Returns a status union the route
 * maps to HTTP codes.
 */
import { Octokit } from "@octokit/rest";
import { createClient } from "../supabase/server.ts";
import { rateLimitAsync, RATE_LIMITS } from "../rate-limit.ts";
import { detectLanguage } from "../ai/code-parser.ts";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
  type CreditReservation,
} from "@/lib/credits";

const MAX_FILE_BYTES = 100 * 1024;
const MAX_FILES = 200;
const ALLOWED_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "css", "scss", "sass", "less",
  "html", "htm", "svg",
  "json", "yaml", "yml", "toml",
  "md", "mdx",
  "env", "env.example", "env.local",
  "sh", "bash",
  "py", "rb", "go", "rs",
  "sql", "graphql", "gql",
]);
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build",
  ".turbo", ".vercel", "coverage", "__pycache__",
  ".pytest_cache", "vendor", ".cache",
]);

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  if (/^[\w.-]+\/[\w.-]+$/.test(url.trim())) {
    const [owner, repo] = url.trim().split("/");
    return { owner, repo: repo.replace(/\.git$/, "") };
  }
  const https = url.match(/github\.com\/([^/]+)\/([^/?\s]+)/);
  if (https) return { owner: https[1], repo: https[2].replace(/\.git$/, "") };
  const ssh = url.match(/github\.com:([^/]+)\/([^/?\s]+)/);
  if (ssh) return { owner: ssh[1], repo: ssh[2].replace(/\.git$/, "") };
  return null;
}

function isAllowedPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.slice(0, -1).some((p) => SKIP_DIRS.has(p))) return false;
  if (parts.some((p) => p.startsWith(".") && !p.startsWith(".env"))) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
}

function detectFramework(paths: string[]): string {
  const has = (name: string) => paths.some((p) => p.includes(name));
  if (has("next.config")) return "next";
  if (has("vite.config")) return "react";
  if (has("nuxt.config")) return "vue";
  if (has("svelte.config")) return "svelte";
  if (has("astro.config") || has("remix.config") || has("angular.json")) return "react";
  return "react";
}

type ImportResult =
  | { status: "ok"; payload: { projectId: string; name: string; filesImported: number; branch: string } }
  | { status: "error"; code: number; message: string; extra?: Record<string, unknown> };

export async function importGithubRepo(data: { repoUrl: string; branch?: string }): Promise<ImportResult> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "error", code: 401, message: "Unauthorized" };

    const rl = await rateLimitAsync(user.id, RATE_LIMITS.api);
    if (!rl.success) return { status: "error", code: 429, message: "Rate limit exceeded" };

    if (!data.repoUrl || typeof data.repoUrl !== "string") {
      return { status: "error", code: 400, message: "repoUrl is required" };
    }
    const parsed = parseGitHubUrl(data.repoUrl);
    if (!parsed) return { status: "error", code: 400, message: "Invalid GitHub URL" };

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("github_access_token")
      .eq("id", user.id)
      .single();
    const octokit = new Octokit({
      auth: profile?.github_access_token ?? process.env.GITHUB_TOKEN ?? undefined,
    });

    let creditReservation: CreditReservation | null = null;
    let reservationFinalized = false;
    let durableImportStarted = false;
    try {
      const { data: repoData } = await octokit.repos.get({ owner: parsed.owner, repo: parsed.repo });
      const targetBranch = data.branch ?? repoData.default_branch;

      const { data: treeData } = await octokit.git.getTree({
        owner: parsed.owner,
        repo: parsed.repo,
        tree_sha: targetBranch,
        recursive: "1",
      });

      const allowedFiles = (treeData.tree ?? [])
        .filter((item) => item.type === "blob" && item.path && isAllowedPath(item.path))
        .slice(0, MAX_FILES);
      if (allowedFiles.length === 0) {
        return { status: "error", code: 422, message: "No importable files found in repository" };
      }

      const fileContents: Array<{ path: string; content: string; language: string }> = [];
      const batchSize = 10;
      for (let i = 0; i < allowedFiles.length; i += batchSize) {
        const batch = allowedFiles.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (file) => {
            const { data: blob } = await octokit.git.getBlob({
              owner: parsed.owner,
              repo: parsed.repo,
              file_sha: file.sha!,
            });
            const content = Buffer.from(blob.content, "base64").toString("utf-8");
            if (Buffer.byteLength(content) > MAX_FILE_BYTES) return null;
            return { path: file.path!, content, language: detectLanguage(file.path!) };
          }),
        );
        for (const r of results) if (r.status === "fulfilled" && r.value) fileContents.push(r.value);
      }
      if (fileContents.length === 0) {
        return { status: "error", code: 422, message: "Could not fetch any file contents" };
      }

      creditReservation = await reserveCredits(supabase, {
        userId: user.id,
        amount: 2,
        action: "github_import",
        projectId: null,
      });
      if (!creditReservation) {
        return { status: "error", code: 402, message: "Insufficient credits", extra: { requiredCredits: 2 } };
      }

      const projectName = `${parsed.repo} (imported)`;
      const { data: project, error: projectError } = await (supabase as any)
        .from("projects")
        .insert({
          user_id: user.id,
          name: projectName,
          description: repoData.description ?? `Imported from ${parsed.owner}/${parsed.repo}`,
          status: "active",
          framework: detectFramework(fileContents.map((f) => f.path)),
          github_repo: `${parsed.owner}/${parsed.repo}`,
          github_branch: targetBranch,
        })
        .select()
        .single();
      if (projectError || !project) return { status: "error", code: 500, message: "Failed to create project" };
      durableImportStarted = true;

      for (let i = 0; i < fileContents.length; i += 50) {
        const batch = fileContents.slice(i, i + 50).map((f) => ({
          project_id: project.id,
          path: f.path,
          content: f.content,
          language: f.language,
        }));
        const { error: filesError } = await (supabase as any).from("project_files").insert(batch);
        if (filesError) throw new Error(`Failed to persist imported files: ${filesError.message}`);
      }

      const remainingCredits = await settleCreditReservation(supabase, creditReservation.id, 2);
      if (remainingCredits == null) throw new Error("Unable to settle reserved GitHub import credits");
      reservationFinalized = true;

      return {
        status: "ok",
        payload: { projectId: project.id, name: projectName, filesImported: fileContents.length, branch: targetBranch },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("404") || message.includes("Not Found")) {
        return {
          status: "error",
          code: 404,
          message: "Repository not found or is private. Connect your GitHub account to import private repos.",
        };
      }
      console.error("[github/import]", err);
      return { status: "error", code: 500, message: "Import failed: " + message };
    } finally {
      if (creditReservation && !reservationFinalized) {
        try {
          if (durableImportStarted) {
            await settleCreditReservation(supabase, creditReservation.id, 2);
          } else {
            await cancelCreditReservation(supabase, creditReservation.id);
          }
        } catch {
          /* fail closed */
        }
      }
    }
}
