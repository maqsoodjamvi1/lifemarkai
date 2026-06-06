import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const VALID_CATEGORIES = [
  "landing", "dashboard", "ecommerce", "saas", "portfolio",
  "blog", "tool", "ai", "social", "other",
];

// POST /api/projects/[id]/publish-template
// Body: { name?, description?, category?, preview_url? }
// Creates a community template entry from the project's current files.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, name, description, framework, preview_url, is_public")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load all project files
  const { data: files } = await (supabase as any)
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", id)
    .order("path");

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "Project has no files to publish." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  const name: string = (body.name ?? project.name ?? "Untitled").trim().slice(0, 80);
  const description: string = (body.description ?? project.description ?? "").trim().slice(0, 500);
  const category: string = VALID_CATEGORIES.includes(body.category) ? body.category : "other";
  const preview_url: string | null = body.preview_url ?? project.preview_url ?? null;

  if (!name) {
    return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  }

  // Serialize files as the JSON structure templates use
  const templateFiles = (files as Array<{ path: string; content: string; language: string }>).map((f) => ({
    path: f.path,
    content: f.content ?? "",
    language: f.language ?? "plaintext",
  }));

  // Re-publishing the same project updates its existing template in place
  // (keyed by source_project_id) rather than creating a duplicate.
  const { data: existing } = await (supabase as any)
    .from("templates")
    .select("id")
    .eq("created_by", user.id)
    .eq("source_project_id", id)
    .maybeSingle();

  const payload = {
    name,
    description,
    category,
    preview_url,
    files: templateFiles,
    is_public: true,
  };

  const { data: template, error } = existing
    ? await (supabase as any)
        .from("templates")
        .update(payload)
        .eq("id", existing.id)
        .select("id, name, category, is_public, fork_count, created_at")
        .single()
    : await (supabase as any)
        .from("templates")
        .insert({ ...payload, is_featured: false, created_by: user.id, source_project_id: id })
        .select("id, name, category, is_public, fork_count, created_at")
        .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(template, { status: existing ? 200 : 201 });
}

// GET /api/projects/[id]/publish-template — check if already published
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership, then look up the template by its source_project_id link.
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("user_id")
    .eq("id", id)
    .single();

  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ published: false });
  }

  const { data: existing } = await (supabase as any)
    .from("templates")
    .select("id, name, fork_count, created_at")
    .eq("created_by", user.id)
    .eq("source_project_id", id)
    .maybeSingle();

  return NextResponse.json({ published: !!existing, template: existing ?? null });
}
