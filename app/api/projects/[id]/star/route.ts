import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/projects/[id]/star  — toggles a community star on a public project
// Uses a separate community_stars table (not the owner's is_starred column)
// Returns { starred: boolean, count: number }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure project is public
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, is_public, star_count")
    .eq("id", projectId)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.is_public) return NextResponse.json({ error: "Project is not public" }, { status: 403 });

  // Check if already starred by this user
  const { data: existing } = await (supabase as any)
    .from("community_stars")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  let starred: boolean;
  let newCount: number = project.star_count ?? 0;

  if (existing) {
    // Unstar
    await (supabase as any)
      .from("community_stars")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", user.id);
    newCount = Math.max(0, newCount - 1);
    starred = false;
  } else {
    // Star
    await (supabase as any)
      .from("community_stars")
      .insert({ project_id: projectId, user_id: user.id });
    newCount = newCount + 1;
    starred = true;
  }

  // Update denormalized count on project
  await (supabase as any)
    .from("projects")
    .update({ star_count: newCount } as Record<string, unknown>)
    .eq("id", projectId);

  return NextResponse.json({ starred, count: newCount });
}

// GET /api/projects/[id]/star  — check if current user starred this project
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("star_count")
    .eq("id", projectId)
    .single();

  if (!user) return NextResponse.json({ starred: false, count: project?.star_count ?? 0 });

  const { data: existing } = await (supabase as any)
    .from("community_stars")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({ starred: !!existing, count: project?.star_count ?? 0 });
}
