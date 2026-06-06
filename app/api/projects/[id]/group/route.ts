import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/projects/[id]/group  — assign or unassign a project to/from a group
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // groupId can be a string (assign) or null (remove from group)
  const groupId = body.groupId ?? null;

  // Verify project ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // If assigning to a group, verify the group belongs to this user
  if (groupId) {
    const { data: group } = await (supabase as any)
      .from("project_groups")
      .select("id")
      .eq("id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data, error } = await (supabase as any)
    .from("projects")
    .update({ group_id: groupId })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
