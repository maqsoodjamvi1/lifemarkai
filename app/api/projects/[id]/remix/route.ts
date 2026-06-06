// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface Params { params: Promise<{ id: string }> }

/** Detect whether a project's files reference Supabase. */
function hasSupabaseWired(files: Array<{ path: string; content: string }>): {
  hasSupabase: boolean;
  evidence: string[];
} {
  const evidence: string[] = [];
  for (const f of files) {
    const lower = f.path.toLowerCase();
    if (/supabase\/(migrations|functions)\//.test(lower)) {
      evidence.push(f.path);
      continue;
    }
    const c = f.content ?? "";
    if (/@supabase\/(supabase-js|ssr|auth-helpers)/.test(c)) {
      evidence.push(`${f.path} (import)`);
    } else if (/NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(c)) {
      evidence.push(`${f.path} (env)`);
    } else if (/createClient\s*\(.*supabase/i.test(c)) {
      evidence.push(`${f.path} (client)`);
    }
    if (evidence.length >= 6) break;
  }
  // De-dupe while preserving order
  const uniq = [...new Set(evidence)];
  return { hasSupabase: uniq.length > 0, evidence: uniq };
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Parse the optional body — used for the dry-run guardrail
  let body: { dryRun?: boolean; disconnectSupabase?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  // Fetch the source project — must be public and remix-enabled
  const { data: source, error: srcErr } = await (supabase as any)
    .from("projects")
    .select("*, project_files(*)")
    .eq("id", id)
    .eq("is_public", true)
    .eq("remix_enabled", true)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: "Project not found or remixing disabled" }, { status: 404 });
  }

  // ── Supabase-aware guardrail (Lovable best-practice #7) ────────────────────
  const sourceFiles = (source.project_files ?? []) as Array<{
    path: string;
    content: string;
    language: string;
  }>;
  const supabaseCheck = hasSupabaseWired(sourceFiles);

  if (body.dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      hasSupabase: supabaseCheck.hasSupabase,
      supabaseEvidence: supabaseCheck.evidence,
      sourceName: source.name,
      fileCount: sourceFiles.length,
    });
  }

  // Create the remixed project
  const { data: newProject, error: createErr } = await (supabase as any)
    .from("projects")
    .insert({
      user_id: user.id,
      name: `${source.name} (Remix)`,
      description: source.description,
      framework: source.framework,
      status: "active",
      is_public: false,
      remix_of: source.id,
      remix_enabled: false,
      remix_count: 0,
      badge_hidden: false,
      knowledge: source.knowledge,
    })
    .select()
    .single();

  if (createErr || !newProject) {
    return NextResponse.json({ error: createErr?.message ?? "Failed to create project" }, { status: 500 });
  }

  // Copy all files
  let files = sourceFiles;

  // If the user opted to disconnect Supabase, strip Supabase-related files
  // and replace imports/env references in remaining files with TODO markers.
  if (body.disconnectSupabase && supabaseCheck.hasSupabase) {
    files = files
      .filter((f) => !/supabase\/(migrations|functions)\//.test(f.path.toLowerCase()))
      .map((f) => ({
        ...f,
        content: (f.content ?? "")
          .replace(/^.*@supabase\/(supabase-js|ssr|auth-helpers).*$/gm,
            "// TODO: re-wire data layer (Supabase imports removed during remix)")
          .replace(/process\.env\.NEXT_PUBLIC_SUPABASE_URL/g, '/* TODO: SUPABASE_URL */""')
          .replace(/process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/g, '/* TODO: SUPABASE_ANON_KEY */""'),
      }));
  }

  if (files.length > 0) {
    const { error: filesErr } = await (supabase as any).from("project_files").insert(
      files.map((f) => ({
        project_id: newProject.id,
        path: f.path,
        content: f.content,
        language: f.language,
      }))
    );
    if (filesErr) {
      // Best effort — don't fail the whole request
      console.error("Failed to copy files:", filesErr.message);
    }
  }

  // Increment remix count on source (fire-and-forget)
  (supabase as any).rpc("increment_remix_count", { project_id: source.id }).then(() => {});

  return NextResponse.json({
    id: newProject.id,
    disconnectedSupabase: !!body.disconnectSupabase && supabaseCheck.hasSupabase,
  });
}
