/**
 * Pure SKILL.md parsing + GitHub source-URL resolution behind
 * src/routes/api/skills/import.ts — pulled out so this logic (previously
 * unreachable from the UI, see workspace-skills-page.tsx's new Import
 * button) is unit tested rather than exercised for the first time by a
 * real import.
 *
 * Front-matter format mirrors the Anthropic Skills spec:
 *   ---
 *   name: my-skill-id
 *   description: Use when...
 *   ---
 *   # Markdown body...
 */

export interface SkillFrontMatter {
  name: string;
  description?: string;
  prompt: string;
  icon?: string;
  tags?: string[];
}

export function parseSkillMd(content: string): SkillFrontMatter | null {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  const frontmatter: Record<string, string> = {};
  let body = content;
  if (fmMatch) {
    body = fmMatch[2];
    for (const line of fmMatch[1].split("\n")) {
      const m = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (m) frontmatter[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  // Fallback: derive name from first H1
  let name = frontmatter.name;
  if (!name) {
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1) {
      name = h1[1].toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    }
  }
  if (!name) return null;
  return {
    name,
    description: frontmatter.description ?? body.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "",
    prompt: body.trim(),
    icon: frontmatter.icon,
    tags: frontmatter.tags ? frontmatter.tags.split(",").map((t) => t.trim()) : undefined,
  };
}

export interface GithubSkillLocation {
  owner: string;
  repo: string;
  branch: string;
  rawUrl: string;
  fallbackRawUrl: string | null;
}

/**
 * Resolves a GitHub repo/subdirectory URL to the raw SKILL.md URL to fetch,
 * matching Lovable's accepted shapes:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/<branch>/<path>
 *   https://github.com/owner/repo/blob/<branch>/<path>/SKILL.md
 *
 * Returns null for a URL that doesn't look like a GitHub repo URL at all.
 * When no branch is given (bare repo URL), `branch` defaults to "main" and
 * `fallbackRawUrl` points at the same path on "master", for a caller that
 * wants to retry when the default-branch guess is wrong.
 */
export function resolveGithubSkillLocation(url: string): GithubSkillLocation | null {
  const m = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/(tree|blob)\/([^\/]+)(?:\/(.+))?)?\/?$/);
  if (!m) return null;
  const [, owner, repo, , branchFromUrl, path = ""] = m;
  const branch = branchFromUrl || "main";
  const cleanPath = path.replace(/\/SKILL\.md$/i, "");
  const skillPath = cleanPath ? `${cleanPath}/SKILL.md` : "SKILL.md";
  const cleanRepo = repo.replace(/\.git$/, "");
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/${skillPath}`;
  return {
    owner,
    repo: cleanRepo,
    branch,
    rawUrl,
    // Only offer a master fallback when the branch was assumed, not chosen.
    fallbackRawUrl: branchFromUrl ? null : rawUrl.replace("/main/", "/master/"),
  };
}
