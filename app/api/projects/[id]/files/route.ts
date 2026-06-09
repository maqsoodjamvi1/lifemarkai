import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";

interface Params { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data, error } = await (supabase as any)
    .from("project_files")
    .select("*")
    .eq("project_id", id)
    .order("path");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json();
  const { fileId, content, path: newPath } = body;

  const updatePayload: Record<string, string> = { updated_at: new Date().toISOString() };
  if (content !== undefined) updatePayload.content = content;
  if (newPath !== undefined) updatePayload.path = newPath;

  const { data, error } = await (supabase as any)
    .from("project_files")
    .update(updatePayload)
    .eq("id", fileId)
    .eq("project_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { path, content = "", language = "plaintext" } = await req.json();

  const { data, error } = await (supabase as any)
    .from("project_files")
    .insert({ project_id: id, path, content, language })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { fileId } = await req.json();

  const { error } = await (supabase as any)
    .from("project_files")
    .delete()
    .eq("id", fileId)
    .eq("project_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
