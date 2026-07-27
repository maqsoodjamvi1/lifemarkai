// @ts-nocheck
/**
 * GitLab REST API client — mirrors lib/github/client.ts surface area.
 *
 * Uses the GitLab REST API v4: https://docs.gitlab.com/ee/api/rest/
 * No extra npm package required — plain fetch calls.
 */

const GL = "https://gitlab.com/api/v4";

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function gl(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${GL}${path}`, {
    method,
    headers: headers(token),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GitLab API ${method} ${path} → ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitLabRepo {
  id: number;
  name: string;
  path_with_namespace: string; // "owner/repo"
  web_url: string;
  description: string | null;
  default_branch: string;
  visibility: "private" | "internal" | "public";
}

export interface GitLabFile {
  path: string;
  content: string;
}

// ── Repo CRUD ─────────────────────────────────────────────────────────────────

export async function listRepos(token: string): Promise<GitLabRepo[]> {
  const data = await gl("GET", `/projects?membership=true&order_by=last_activity_at&per_page=50`, token);
  return data.map((p: any) => ({
    id: p.id,
    name: p.name,
    path_with_namespace: p.path_with_namespace,
    web_url: p.web_url,
    description: p.description,
    default_branch: p.default_branch ?? "main",
    visibility: p.visibility,
  }));
}

export async function createRepo(
  token: string,
  name: string,
  description?: string
): Promise<GitLabRepo> {
  const data = await gl("POST", "/projects", token, {
    name,
    description: description ?? "",
    visibility: "private",
    initialize_with_readme: true,
  });
  return {
    id: data.id,
    name: data.name,
    path_with_namespace: data.path_with_namespace,
    web_url: data.web_url,
    description: data.description,
    default_branch: data.default_branch ?? "main",
    visibility: data.visibility,
  };
}

// ── Branch helpers ────────────────────────────────────────────────────────────

export async function ensureBranch(
  token: string,
  projectId: number | string,
  branchName: string,
  fromBranch = "main"
): Promise<{ exists: boolean }> {
  const encoded = encodeURIComponent(String(projectId));
  try {
    await gl("GET", `/projects/${encoded}/repository/branches/${encodeURIComponent(branchName)}`, token);
    return { exists: true };
  } catch {
    await gl("POST", `/projects/${encoded}/repository/branches`, token, {
      branch: branchName,
      ref: fromBranch,
    });
    return { exists: false };
  }
}

export async function getBranchStatus(
  token: string,
  projectId: number | string,
  head: string,
  base = "main"
): Promise<{ ahead: number; behind: number; diverged: boolean }> {
  const encoded = encodeURIComponent(String(projectId));
  try {
    const data = await gl(
      "GET",
      `/projects/${encoded}/repository/compare?from=${encodeURIComponent(base)}&to=${encodeURIComponent(head)}`,
      token
    );
    // GitLab compare returns commits array — "ahead" = commits on head not in base
    const ahead = Array.isArray(data.commits) ? data.commits.length : 0;
    return { ahead, behind: 0, diverged: false };
  } catch {
    return { ahead: 0, behind: 0, diverged: false };
  }
}

// ── File push / pull ──────────────────────────────────────────────────────────

/**
 * Push a batch of files to a GitLab project branch using the Commits API.
 * Creates or updates files in a single commit.
 */
export async function pushFiles(
  token: string,
  projectId: number | string,
  files: GitLabFile[],
  message: string,
  branch = "main"
): Promise<void> {
  const encoded = encodeURIComponent(String(projectId));

  // Determine which files already exist on the branch so we can use
  // create vs update actions correctly.
  let existingPaths = new Set<string>();
  try {
    const tree: any[] = await gl(
      "GET",
      `/projects/${encoded}/repository/tree?recursive=true&ref=${encodeURIComponent(branch)}&per_page=100`,
      token
    );
    existingPaths = new Set(tree.filter((t) => t.type === "blob").map((t) => t.path));
  } catch {
    // Empty repo — all files are new
  }

  const actions = files.map((f) => ({
    action: existingPaths.has(f.path) ? "update" : "create",
    file_path: f.path,
    content: Buffer.from(f.content).toString("base64"),
    encoding: "base64",
  }));

  await gl("POST", `/projects/${encoded}/repository/commits`, token, {
    branch,
    commit_message: message,
    actions,
  });
}

/**
 * Push only changed files (same semantics as GitHub pushChangedFiles).
 * GitLab's commits API accepts mixed create/update/delete actions in one call.
 */
export async function pushChangedFiles(
  token: string,
  projectId: number | string,
  branch: string,
  files: GitLabFile[],
  message: string
): Promise<{ changed: number }> {
  if (files.length === 0) return { changed: 0 };
  await pushFiles(token, projectId, files, message, branch);
  return { changed: files.length };
}

/**
 * Pull all text files from a GitLab project branch.
 */
export async function pullFiles(
  token: string,
  projectId: number | string,
  branch = "main"
): Promise<GitLabFile[]> {
  const encoded = encodeURIComponent(String(projectId));

  // Get full recursive tree
  const tree: any[] = await gl(
    "GET",
    `/projects/${encoded}/repository/tree?recursive=true&ref=${encodeURIComponent(branch)}&per_page=100`,
    token
  );

  const BINARY_EXTS = new Set(["png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "eot", "otf", "svg", "webp"]);
  const blobs = tree.filter((t) => t.type === "blob");

  const results: GitLabFile[] = [];
  for (const blob of blobs) {
    const ext = blob.path.split(".").pop()?.toLowerCase() ?? "";
    if (BINARY_EXTS.has(ext)) continue;

    try {
      const filePath = encodeURIComponent(blob.path);
      const content: string = await gl(
        "GET",
        `/projects/${encoded}/repository/files/${filePath}/raw?ref=${encodeURIComponent(branch)}`,
        token
      );
      results.push({ path: blob.path, content: typeof content === "string" ? content : JSON.stringify(content) });
    } catch {
      // Skip unreadable files
    }
  }
  return results;
}

// ── Commit history ────────────────────────────────────────────────────────────

export async function getCommitHistory(
  token: string,
  projectId: number | string,
  branch = "main",
  limit = 20
): Promise<Array<{ sha: string; message: string; author: string; date: string }>> {
  const encoded = encodeURIComponent(String(projectId));
  const data = await gl(
    "GET",
    `/projects/${encoded}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=${limit}`,
    token
  );
  return data.map((c: any) => ({
    sha: c.id,
    message: c.title,
    author: c.author_name ?? "Unknown",
    date: c.authored_date ?? c.created_at ?? "",
  }));
}

// ── Merge Request ─────────────────────────────────────────────────────────────

export interface MergeRequest {
  iid: number;
  title: string;
  web_url: string;
  state: "opened" | "closed" | "merged" | "locked";
  created_at: string;
}

export async function createOrGetMR(
  token: string,
  projectId: number | string,
  sourceBranch: string,
  targetBranch = "main",
  title = "Changes from LifemarkAI",
  description = "This merge request was generated by [LifemarkAI](https://lifemarkai.app)."
): Promise<MergeRequest> {
  const encoded = encodeURIComponent(String(projectId));

  // Check for existing open MR from same source → target
  const existing: any[] = await gl(
    "GET",
    `/projects/${encoded}/merge_requests?state=opened&source_branch=${encodeURIComponent(sourceBranch)}&target_branch=${encodeURIComponent(targetBranch)}`,
    token
  );
  if (existing.length > 0) {
    const mr = existing[0];
    return { iid: mr.iid, title: mr.title, web_url: mr.web_url, state: mr.state, created_at: mr.created_at };
  }

  const mr = await gl("POST", `/projects/${encoded}/merge_requests`, token, {
    source_branch: sourceBranch,
    target_branch: targetBranch,
    title,
    description,
    remove_source_branch: false,
  });

  return { iid: mr.iid, title: mr.title, web_url: mr.web_url, state: mr.state, created_at: mr.created_at };
}

// ── User ──────────────────────────────────────────────────────────────────────

export async function getAuthenticatedUser(token: string): Promise<{ username: string; name: string }> {
  const data = await gl("GET", "/user", token);
  return { username: data.username, name: data.name };
}
