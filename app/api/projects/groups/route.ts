import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";

const MAX_FOLDER_DEPTH = 2; // 0=root, 1=child, 2=grandchild (3 levels total)

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

// GET  /api/projects/groups  — list all groups for the current user
export async function GET() {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await (supabase as any)
    .from("project_groups")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/projects/groups  — create a new group
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, color, parent_id: parentId } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (parentId != null) {
    if (typeof parentId !== "string") {
      return NextResponse.json({ error: "parent_id must be a string" }, { status: 400 });
    }
    const { data: parent } = await (supabase as any)
      .from("project_groups")
      .select("id")
      .eq("id", parentId)
      .eq("user_id", user.id)
      .single();
    if (!parent) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
    const parentDepth = await folderDepth(supabase, parentId);
    if (parentDepth >= MAX_FOLDER_DEPTH) {
      return NextResponse.json({ error: "Maximum folder depth (3 levels) reached" }, { status: 400 });
    }
  }

  // Get current max position
  const { data: existing } = await (supabase as any)
    .from("project_groups")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1);

  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await (supabase as any)
    .from("project_groups")
    .insert({
      user_id: user.id,
      name: name.trim(),
      color: color ?? "#6366f1",
      position,
      ...(parentId ? { parent_id: parentId } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
