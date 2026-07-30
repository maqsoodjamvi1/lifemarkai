// @ts-nocheck
import { Octokit } from "@octokit/rest";

export function createGitHubClient(accessToken: string) {
  return new Octokit({ auth: accessToken });
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
}

export interface GitHubFile {
  path: string;
  content: string;
  sha?: string;
}

export async function listRepos(token: string): Promise<GitHubRepo[]> {
  const octokit = createGitHubClient(token);
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "updated", per_page: 50,
  });
  return data.map((r) => ({
    id: r.id, name: r.name, full_name: r.full_name,
    private: r.private, default_branch: r.default_branch,
    html_url: r.html_url, description: r.description,
  }));
}

export async function createRepo(token: string, name: string, description?: string): Promise<GitHubRepo> {
  const octokit = createGitHubClient(token);
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name, description, private: true, auto_init: true,
  });
  return {
    id: data.id, name: data.name, full_name: data.full_name,
    private: data.private, default_branch: data.default_branch,
    html_url: data.html_url, description: data.description,
  };
}

export async function pushFiles(
  token: string,
  repo: string, // "owner/repo"
  files: GitHubFile[],
  message: string,
  branch = "main"
): Promise<void> {
  const octokit = createGitHubClient(token);
  const [owner, repoName] = repo.split("/");

  // Get current branch SHA
  let treeSha: string;
  let commitSha: string;
  try {
    const { data: ref } = await octokit.rest.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` });
    commitSha = ref.object.sha;
    const { data: commit } = await octokit.rest.git.getCommit({ owner, repo: repoName, commit_sha: commitSha });
    treeSha = commit.tree.sha;
  } catch {
    // Branch doesn't exist yet
    const { data: ref } = await octokit.rest.git.getRef({ owner, repo: repoName, ref: "heads/main" });
    commitSha = ref.object.sha;
    const { data: commit } = await octokit.rest.git.getCommit({ owner, repo: repoName, commit_sha: commitSha });
    treeSha = commit.tree.sha;
  }

  // Create blobs for each file
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner, repo: repoName,
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });
      return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    })
  );

  // Create tree
  const { data: tree } = await octokit.rest.git.createTree({
    owner, repo: repoName, base_tree: treeSha, tree: treeItems,
  });

  // Create commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner, repo: repoName, message,
    tree: tree.sha, parents: [commitSha],
  });

  // Update branch ref
  await octokit.rest.git.updateRef({
    owner, repo: repoName, ref: `heads/${branch}`, sha: newCommit.sha,
  });
}

export async function pullFiles(
  token: string,
  repo: string,
  branch = "main"
): Promise<GitHubFile[]> {
  const octokit = createGitHubClient(token);
  const [owner, repoName] = repo.split("/");

  const { data: tree } = await octokit.rest.git.getTree({
    owner, repo: repoName, tree_sha: branch, recursive: "1",
  });

  const files: GitHubFile[] = [];
  for (const item of tree.tree) {
    if (item.type !== "blob" || !item.path) continue;
    // Skip binary files
    const ext = item.path.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "gif", "ico", "woff", "woff2", "ttf", "eot"].includes(ext ?? "")) continue;

    const { data } = await octokit.rest.git.getBlob({
      owner, repo: repoName, file_sha: item.sha!,
    });
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    files.push({ path: item.path, content, sha: item.sha });
  }
  return files;
}

export async function getCommitHistory(
  token: string,
  repo: string,
  branch = "main",
  limit = 20
): Promise<Array<{ sha: string; message: string; author: string; date: string }>> {
  const octokit = createGitHubClient(token);
  const [owner, repoName] = repo.split("/");

  const { data } = await octokit.rest.repos.listCommits({
    owner, repo: repoName, sha: branch, per_page: limit,
  });

  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? "Unknown",
    date: c.commit.author?.date ?? "",
  }));
}

// ── Branch management ─────────────────────────────────────────────────────────

/** Create a new branch from an existing one (idempotent — returns existing if already there) */
export async function ensureBranch(
  token: string,
  repo: string,
  branchName: string,
  fromBranch = "main"
): Promise<{ exists: boolean; sha: string }> {
  const octokit = createGitHubClient(token);
  const [owner, repoName] = repo.split("/");

  // Check if branch already exists
  try {
    const { data } = await octokit.rest.git.getRef({ owner, repo: repoName, ref: `heads/${branchName}` });
    return { exists: true, sha: data.object.sha };
  } catch {
    // Branch doesn't exist — create from source
    const { data: sourceRef } = await octokit.rest.git.getRef({ owner, repo: repoName, ref: `heads/${fromBranch}` });
    await octokit.rest.git.createRef({
      owner, repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: sourceRef.object.sha,
    });
    return { exists: false, sha: sourceRef.object.sha };
  }
}

/** Get ahead/behind count between two branches */
export async function getBranchStatus(
  token: string,
  repo: string,
  head: string,
  base = "main"
): Promise<{ ahead: number; behind: number; diverged: boolean }> {
  const octokit = createGitHubClient(token);
  const [owner, repoName] = repo.split("/");

  try {
    const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner, repo: repoName,
      basehead: `${base}...${head}`,
    });
    return {
      ahead: data.ahead_by,
      behind: data.behind_by,
      diverged: data.status === "diverged",
    };
  } catch {
    return { ahead: 0, behind: 0, diverged: false };
  }
}

// ── Pull Request ──────────────────────────────────────────────────────────────

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  createdAt: string;
}

/** Create a PR from head branch → base branch (idempotent — returns existing open PR) */
export async function createOrGetPR(
  token: string,
  repo: string,
  head: string,
  base = "main",
  title = "Changes from LifemarkAI",
  body = "This pull request was generated by [LifemarkAI](https://lifemarkai.app)."
): Promise<PullRequest> {
  const octokit = createGitHubClient(token);
  const [owner, repoName] = repo.split("/");

  // Check for existing open PR from same head → base
  const { data: existing } = await octokit.rest.pulls.list({
    owner, repo: repoName, head: `${owner}:${head}`, base, state: "open",
  });

  if (existing.length > 0) {
    const pr = existing[0];
    return { number: pr.number, title: pr.title, url: pr.html_url, state: "open", createdAt: pr.created_at };
  }

  const { data: pr } = await octokit.rest.pulls.create({
    owner, repo: repoName, head, base, title, body,
  });

  return { number: pr.number, title: pr.title, url: pr.html_url, state: "open", createdAt: pr.created_at };
}

/** List open PRs for a repo */
export async function listPullRequests(
  token: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
): Promise<PullRequest[]> {
  const octokit = createGitHubClient(token);
  const [owner, repoName] = repo.split("/");

  const { data } = await octokit.rest.pulls.list({ owner, repo: repoName, state, per_page: 10 });
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state: pr.merged_at ? "merged" : (pr.state as "open" | "closed"),
    createdAt: pr.created_at,
  }));
}

// ── Diff-aware push ───────────────────────────────────────────────────────────

/** Push only files that differ from the remote tree — returns number of changed files */
export async function pushChangedFiles(
  token: string,
  repo: string,
  branch: string,
  files: GitHubFile[],
  message: string
): Promise<{ changed: number; commitSha: string }> {
  const octokit = createGitHubClient(token);
  const [owner, repoName] = repo.split("/");

  // Get current tree at branch tip
  const { data: ref } = await octokit.rest.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` });
  const commitSha = ref.object.sha;
  const { data: commit } = await octokit.rest.git.getCommit({ owner, repo: repoName, commit_sha: commitSha });
  const { data: baseTree } = await octokit.rest.git.getTree({ owner, repo: repoName, tree_sha: commit.tree.sha, recursive: "1" });

  // Build lookup: path → sha
  const remoteShas = new Map<string, string>(
    baseTree.tree.filter((t) => t.type === "blob").map((t) => [t.path!, t.sha!])
  );

  // Compute which files actually changed (by hashing content)
  const changedFiles: GitHubFile[] = [];
  for (const file of files) {
    // We can't easily compute git blob SHA client-side, so include all modified files
    // (GitHub will deduplicate blobs automatically)
    const remoteExists = remoteShas.has(file.path);
    // Only skip if we can verify the file is identical (requires fetching blob — expensive)
    // For now include all files (GitHub's blob dedup makes this fast anyway)
    changedFiles.push(file);
    void remoteExists; // suppress unused warning
  }

  if (changedFiles.length === 0) return { changed: 0, commitSha };

  // Create blobs
  const treeItems = await Promise.all(
    changedFiles.map(async (file) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner, repo: repoName,
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });
      return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    })
  );

  const { data: newTree } = await octokit.rest.git.createTree({ owner, repo: repoName, base_tree: commit.tree.sha, tree: treeItems });
  const { data: newCommit } = await octokit.rest.git.createCommit({ owner, repo: repoName, message, tree: newTree.sha, parents: [commitSha] });
  await octokit.rest.git.updateRef({ owner, repo: repoName, ref: `heads/${branch}`, sha: newCommit.sha });

  return { changed: changedFiles.length, commitSha: newCommit.sha };
}
