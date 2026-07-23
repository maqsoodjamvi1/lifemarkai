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
  if (content !== undefined) {
    // Resolve the file's actual path so HTML de-duplication only ever touches
    // HTML documents (a default would mis-sanitize .tsx saves).
    let effectivePath = typeof newPath === "string" ? newPath : "";
    if (!effectivePath) {
      const { data: row } = await (supabase as any)
        .from("project_files")
        .select("path")
        .eq("id", fileId)
        .eq("project_id", id)
        .maybeSingle();
      effectivePath = (row as { path?: string } | null)?.path ?? "";
    }
    const { sanitizeGeneratedFile } = await import("@/lib/ai/html-sanity");
    updatePayload.content = sanitizeGeneratedFile(effectivePath, String(content));
  }
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
  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  // Upsert, not insert: "save this file" must succeed whether or not the path
  // exists. The old bare insert 500'd with a raw Postgres duplicate-key error
  // the second time a user saved the same generated file.
  const { sanitizeGeneratedFile } = await import("@/lib/ai/html-sanity");
  const { data, error } = await (supabase as any)
    .from("project_files")
    .upsert(
      {
        project_id: id,
        path,
        content: sanitizeGeneratedFile(path, String(content)),
        language,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,path" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save the file. Try again." }, { status: 500 });
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
