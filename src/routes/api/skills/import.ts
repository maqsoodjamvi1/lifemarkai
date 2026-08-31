import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { parseSkillMd, resolveGithubSkillLocation } from "@/lib/skills/parse-skill-md";

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
 * The URL resolution and SKILL.md front-matter parsing live in
 * src/lib/skills/parse-skill-md.ts (unit tested) — this route is now
 * reachable from the UI (workspace-skills-page.tsx's Import button), where
 * before it had no entry point and this logic had never actually run
 * against a real skill.
 */

async function fetchSkillFromGithub(url: string): Promise<string | null> {
  const location = resolveGithubSkillLocation(url);
  if (!location) return null;

  const res = await fetch(location.rawUrl);
  if (!res.ok) {
    if (location.fallbackRawUrl) {
      const fallback = await fetch(location.fallbackRawUrl);
      if (fallback.ok) return await fallback.text();
    }
    return null;
  }
  return await res.text();
}

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";

  let skillMd: string | null = null;
  let sourceLabel = "";

  if (contentType.includes("application/json")) {
    // GitHub import
    const { source, url } = await req.json() as { source?: string; url?: string };
    if (source !== "github" || !url) {
      return Response.json({ error: "source must be 'github' and url is required" }, { status: 400 });
    }
    skillMd = await fetchSkillFromGithub(url);
    if (!skillMd) {
      return Response.json({ error: "Could not locate SKILL.md at the given GitHub URL" }, { status: 404 });
    }
    sourceLabel = url;
  } else if (contentType.includes("multipart/form-data")) {
    // ZIP / .skill upload
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return Response.json({ error: "file is required" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) {
      return Response.json({ error: "Archive too large (max 50MB)" }, { status: 413 });
    }
    // Dynamic import jszip — keep route lightweight if not used
    let JSZip: any;
    try {
      JSZip = (await import("jszip")).default;
    } catch {
      return Response.json({
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
    if (!skillFile) return Response.json({ error: "Archive does not contain SKILL.md" }, { status: 400 });
    skillMd = await skillFile.async("string");
    sourceLabel = file.name;
  } else {
    return Response.json({ error: "Expected application/json or multipart/form-data" }, { status: 415 });
  }

  // Parse + insert
  const parsed = parseSkillMd(skillMd!);
  if (!parsed) {
    return Response.json({ error: "Could not parse SKILL.md — missing name front-matter and no H1 heading found" }, { status: 400 });
  }

  // Name uniqueness
  const { data: existing } = await supabase
    .from("workspace_skills")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", parsed.name)
    .maybeSingle();
  if (existing) {
    return Response.json({ error: `A skill named "${parsed.name}" already exists` }, { status: 409 });
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

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, skill, source: sourceLabel }, { status: 201 });
}


export const Route = createFileRoute("/api/skills/import")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
