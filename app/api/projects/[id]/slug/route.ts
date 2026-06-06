import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// GET /api/projects/[id]/slug?check=my-slug  — check availability
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("check");
  if (!slug) return NextResponse.json({ error: "check param required" }, { status: 400 });

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ available: false, reason: "Invalid format. Use 3-40 lowercase letters, numbers, or hyphens." });
  }

  // Check if taken by another project
  const { data: existing } = await (supabase as any)
    .from("projects")
    .select("id")
    .eq("app_slug", slug)
    .neq("id", id)
    .maybeSingle();

  return NextResponse.json({ available: !existing });
}

// PATCH /api/projects/[id]/slug  — set or clear the vanity slug
export async function PATCH(
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
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const slug: string | null = body.app_slug ?? null;

  if (slug !== null && !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "Invalid format. Use 3-40 lowercase letters, numbers, or hyphens." },
      { status: 400 }
    );
  }

  const { data, error } = await (supabase as any)
    .from("projects")
    .update({ app_slug: slug })
    .eq("id", id)
    .select("id, name, app_slug")
    .single();

  if (error) {
    // Unique constraint violation
    if (error.code === "23505") {
      return NextResponse.json({ error: "This URL is already taken." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
