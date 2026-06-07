import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";

const MAX_FOLDER_DEPTH = 2;

async function folderDepth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
): Promise<number> {
  let depth = 0;
  let currentId: string | null = groupId;
  while (currentId && depth <= MAX_FOLDER_DEPTH + 1) {
    const { data } = await (supabase as any)
      .from("project_groups")
      .select("parent_id")
      .eq("id", currentId)
      .single();
    if (!data?.parent_id) break;
    currentId = data.parent_id as string;
    depth++;
  }
  return depth;
}

// PATCH /api/projects/groups/[groupId]  — rename / recolor a group
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.color === "string") updates.color = body.color;
  if (typeof body.position === "number") updates.position = body.position;
  if (body.parent_id === null) updates.parent_id = null;
  if (typeof body.parent_id === "string") {
    if (body.parent_id === groupId) {
      return NextResponse.json({ error: "A folder cannot be its own parent" }, { status: 400 });
    }
    const { data: parent } = await (supabase as any)
      .from("project_groups")
      .select("id")
      .eq("id", body.parent_id)
      .eq("user_id", user.id)
      .single();
    if (!parent) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
    const parentDepth = await folderDepth(supabase, body.parent_id);
    if (parentDepth >= MAX_FOLDER_DEPTH) {
      return NextResponse.json({ error: "Maximum folder depth (3 levels) reached" }, { status: 400 });
    }
    updates.parent_id = body.parent_id;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("project_groups")
    .update(updates)
    .eq("id", groupId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/projects/groups/[groupId]  — delete group (projects become ungrouped)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await (supabase as any)
    .from("project_groups")
    .delete()
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
