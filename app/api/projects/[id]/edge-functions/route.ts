import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

// GET — list edge functions (stubs — real impl calls Supabase Management API)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // In production: call https://api.supabase.com/v1/projects/{ref}/functions
  // For now return functions stored in project_files with path starting with supabase/functions/
  const { data: files } = await (supabase as any)
    .from("project_files")
    .select("path, updated_at")
    .eq("project_id", id)
    .like("path", "supabase/functions/%/index.ts");

  const functions = (files ?? []).map((f: { path: string; updated_at: string }) => {
    const slug = f.path.split("/")[2] ?? "unknown";
    return {
      id:         slug,
      name:       slug,
      slug,
      status:     "ACTIVE",
      created_at: f.updated_at,
      updated_at: f.updated_at,
    };
  });

  return NextResponse.json({ functions });
}

// POST — save + "deploy" a function (saves to project_files)
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, code } = await req.json() as { name: string; code: string };
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const path = `supabase/functions/${slug}/index.ts`;

  await (supabase as any).from("project_files").upsert({
    project_id: id,
    path,
    content:    code,
    language:   "typescript",
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id,path" });

  return NextResponse.json({ ok: true, slug });
}
