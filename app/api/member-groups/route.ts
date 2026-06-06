// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Member groups — people-grouping for access control.
 *
 *  GET                              → list groups + member counts
 *  GET ?groupId=...                 → list members of one group
 *  POST                             → create group
 *  PATCH                            → rename/recolor group
 *  PUT  body { groupId, memberId, action: "add" | "remove" }   → membership
 *  DELETE ?groupId=...              → delete group
 */

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groupId = req.nextUrl.searchParams.get("groupId");
  if (groupId) {
    const { data: members } = await supabase
      .from("member_group_members")
      .select(`
        id, member_id, added_at,
        member:profiles!member_group_members_member_id_fkey ( id, full_name, avatar_url, email )
      `)
      .eq("group_id", groupId);
    return NextResponse.json({ members: members ?? [] });
  }

  const { data: groups } = await supabase
    .from("member_groups")
    .select(`
      id, name, description, color, created_at,
      members:member_group_members ( count )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ groups: groups ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, color } = await req.json() as {
    name: string; description?: string; color?: string;
  };
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("member_groups")
    .insert({
      user_id: user.id,
      name: name.trim(),
      description: description ?? null,
      color: color ?? "violet",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId, name, description, color } = await req.json();
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (color !== undefined) updates.color = color;

  const { error } = await supabase
    .from("member_groups")
    .update(updates)
    .eq("id", groupId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId, memberId, action } = await req.json() as {
    groupId: string; memberId: string; action: "add" | "remove";
  };
  if (!groupId || !memberId) return NextResponse.json({ error: "groupId and memberId required" }, { status: 400 });

  // Verify group ownership
  const { data: group } = await supabase
    .from("member_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (action === "remove") {
    await supabase
      .from("member_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("member_id", memberId);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("member_group_members")
    .insert({ group_id: groupId, member_id: memberId });
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  await supabase.from("member_groups").delete().eq("id", groupId).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
