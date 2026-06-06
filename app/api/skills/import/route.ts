// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/skills/import
 *
 * Two modes, matching Lovable's "Import from GitHub" and "Upload ZIP":
 *   1. JSON body { source: "github", url: "https://github.com/owner/repo[/tree/branch/path]" }
 *      → Lovable accepts whole-repo OR subdirectory URLs. We fetch the raw
 *        SKILL.md and create a workspace_skills row.
 *   2. multipart/form-data with field `file` (a .zip or .skill archive)
 *      → Extract SKILL.md from the archive, parse front-matter, create skill.
 *
 * The skill_creator front-matter format (mirrors Anthropic Skills spec):
 *     ---
 *     name: my-skill-id
 *     description: Use when...
 *     ---
 *     # Markdown body...
 */
interface SkillFrontMatter {
  name: string;
  description?: string;
  prompt: string;
  icon?: string;
  tags?: string[];
}

function parseSkillMd(content: string): SkillFrontMatter | null {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  let frontmatter: Record<string, string> = {};
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

async function fetchSkillFromGithub(url: string): Promise<string | null> {
  // Match either:
  //   https://github.com/owner/repo
  //   https://github.com/owner/repo/tree/<branch>/<path>
  //   https://github.com/owner/repo/blob/<branch>/<path>/SKILL.md
  const m = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/(tree|blob)\/([^\/]+)(?:\/(.+))?)?\/?$/);
  if (!m) return null;
  const [, owner, repo, kind, branch = "main", path = ""] = m;
  const cleanPath = path.replace(/\/SKILL\.md$/i, "");
  const skillPath = cleanPath ? `${cleanPath}/SKILL.md` : "SKILL.md";
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo.replace(/\.git$/, "")}/${branch}/${skillPath}`;

  const res = await fetch(rawUrl);
  if (!res.ok) {
    // Try `master` as a fallback if `main` was assumed
    if (branch === "main") {
      const fallback = await fetch(rawUrl.replace("/main/", "/master/"));
      if (fallback.ok) return await fallback.text();
    }
    return null;
  }
  return await res.text();
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";

  let skillMd: string | null = null;
  let sourceLabel = "";

  if (contentType.includes("application/json")) {
    // GitHub import
    const { source, url } = await req.json() as { source?: string; url?: string };
    if (source !== "github" || !url) {
      return NextResponse.json({ error: "source must be 'github' and url is required" }, { status: 400 });
    }
    skillMd = await fetchSkillFromGithub(url);
    if (!skillMd) {
      return NextResponse.json({ error: "Could not locate SKILL.md at the given GitHub URL" }, { status: 404 });
    }
    sourceLabel = url;
  } else if (contentType.includes("multipart/form-data")) {
    // ZIP / .skill upload
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Archive too large (max 50MB)" }, { status: 413 });
    }
    // Dynamic import jszip — keep route lightweight if not used
    let JSZip: any;
    try {
      JSZip = (await import("jszip")).default;
    } catch {
      return NextResponse.json({
        error: "jszip not installed — run `npm install jszip` to enable ZIP uploads",
      }, { status: 501 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    // Look for SKILL.md at root or inside one wrapping folder
    let skillFile: any = null;
    zip.forEach((relPath: string, entry: any) => {
      if (entry.dir) return;
      if (relPath.startsWith("__MACOSX/") || relPath.endsWith("/.DS_Store")) return;
      if (relPath === "SKILL.md" || /^[^/]+\/SKILL\.md$/.test(relPath)) {
        skillFile = entry;
      }
    });
    if (!skillFile) return NextResponse.json({ error: "Archive does not contain SKILL.md" }, { status: 400 });
    skillMd = await skillFile.async("string");
    sourceLabel = file.name;
  } else {
    return NextResponse.json({ error: "Expected application/json or multipart/form-data" }, { status: 415 });
  }

  // Parse + insert
  const parsed = parseSkillMd(skillMd!);
  if (!parsed) {
    return NextResponse.json({ error: "Could not parse SKILL.md — missing name front-matter and no H1 heading found" }, { status: 400 });
  }

  // Name uniqueness
  const { data: existing } = await supabase
    .from("workspace_skills")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", parsed.name)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `A skill named "${parsed.name}" already exists` }, { status: 409 });
  }

  const { data: skill, error } = await supabase
    .from("workspace_skills")
    .insert({
      user_id: user.id,
      name: parsed.name,
      description: parsed.description ?? `Imported from ${sourceLabel}`,
      prompt: parsed.prompt,
      icon: parsed.icon ?? "📥",
      tags: parsed.tags ?? ["imported"],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, skill, source: sourceLabel }, { status: 201 });
}
