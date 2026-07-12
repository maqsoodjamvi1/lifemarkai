// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Octokit } from "@octokit/rest";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { detectLanguage } from "@/lib/ai/code-parser";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
  type CreditReservation,
} from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

// Max file size to import (100 KB per file)
const MAX_FILE_BYTES = 100 * 1024;
// Max number of files to import
const MAX_FILES = 200;
// Extensions we care about — skip binary/build artefacts
const ALLOWED_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "css", "scss", "sass", "less",
  "html", "htm", "svg",
  "json", "yaml", "yml", "toml",
  "md", "mdx",
  "env", "env.example", "env.local",
  "sh", "bash",
  "py", "rb", "go", "rs",
  "sql",
  "graphql", "gql",
]);

// Directories to always skip
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build",
  ".turbo", ".vercel", "coverage", "__pycache__",
  ".pytest_cache", "vendor", ".cache",
]);

/**
 * Parse owner/repo from a GitHub URL.
 * Supports formats:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 *   owner/repo
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Plain "owner/repo"
  if (/^[\w.-]+\/[\w.-]+$/.test(url.trim())) {
    const [owner, repo] = url.trim().split("/");
    return { owner, repo: repo.replace(/\.git$/, "") };
  }
  // HTTPS URL
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/?\s]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2].replace(/\.git$/, "") };
  }
  // SSH URL
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/?\s]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/, "") };
  }
  return null;
}

function isAllowedPath(path: string): boolean {
  const parts = path.split("/");
  // Skip if any directory segment is in the blocklist
  if (parts.slice(0, -1).some((p) => SKIP_DIRS.has(p))) return false;
  // Skip dot-files/folders (except .env*)
  if (parts.some((p) => p.startsWith(".") && !p.startsWith(".env"))) return false;
  // Check extension
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { repoUrl, branch } = await req.json() as { repoUrl: string; branch?: string };
  if (!repoUrl || typeof repoUrl !== "string") {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
  }

  // Use user's GitHub token if available (allows private repos), fall back to anonymous
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
    // Fetch repo metadata
    const { data: repoData } = await octokit.repos.get({
      owner: parsed.owner,
      repo: parsed.repo,
    });

    const targetBranch = branch ?? repoData.default_branch;

    // Fetch the full file tree (recursive)
    const { data: treeData } = await octokit.git.getTree({
      owner: parsed.owner,
      repo: parsed.repo,
      tree_sha: targetBranch,
      recursive: "1",
    });

    // Filter to allowed files only
    const allowedFiles = (treeData.tree ?? []).filter(
      (item) => item.type === "blob" && item.path && isAllowedPath(item.path)
    ).slice(0, MAX_FILES);

    if (allowedFiles.length === 0) {
      return NextResponse.json({ error: "No importable files found in repository" }, { status: 422 });
    }

    // Fetch file contents in batches of 10 (avoid rate limits)
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
          // Blobs are base64-encoded
          const content = Buffer.from(blob.content, "base64").toString("utf-8");
          if (Buffer.byteLength(content) > MAX_FILE_BYTES) return null;
          return {
            path: file.path!,
            content,
            language: detectLanguage(file.path!),
          };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) fileContents.push(r.value);
      }
    }

    if (fileContents.length === 0) {
      return NextResponse.json({ error: "Could not fetch any file contents" }, { status: 422 });
    }

    // Remote discovery is read-only. Reserve the full import cost immediately
    // before creating any durable project state.
    creditReservation = await reserveCredits(supabase, {
      userId: user.id,
      amount: 2,
      action: "github_import",
      projectId: null,
    });
    if (!creditReservation) {
      return NextResponse.json(
        { error: "Insufficient credits", requiredCredits: 2 },
        { status: 402 },
      );
    }

    // Create the project
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

    if (projectError || !project) {
      return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }
    durableImportStarted = true;

    // Insert files in batches
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

    const remainingCredits = await settleCreditReservation(
      supabase,
      creditReservation.id,
      2,
    );
    if (remainingCredits == null) throw new Error("Unable to settle reserved GitHub import credits");
    reservationFinalized = true;

    return NextResponse.json({
      projectId: project.id,
      name: projectName,
      filesImported: fileContents.length,
      branch: targetBranch,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // GitHub 404 means repo not found or private
    if (message.includes("404") || message.includes("Not Found")) {
      return NextResponse.json(
        { error: "Repository not found or is private. Connect your GitHub account to import private repos." },
        { status: 404 }
      );
    }
    console.error("[github/import]", err);
    return NextResponse.json({ error: "Import failed: " + message }, { status: 500 });
  } finally {
    if (creditReservation && !reservationFinalized) {
      try {
        if (durableImportStarted) {
          const remaining = await settleCreditReservation(supabase, creditReservation.id, 2);
          reservationFinalized = remaining != null;
        } else {
          await cancelCreditReservation(supabase, creditReservation.id);
          reservationFinalized = true;
        }
      } catch {
        // Fail closed when a project or any imported files may already exist.
      }
    }
  }
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
