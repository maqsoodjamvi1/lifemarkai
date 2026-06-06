import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, metadata")
    .eq("id", id)
    .single();

  if (!project || (project as any).user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const persona = (project as any).metadata?.persona ?? null;
  return NextResponse.json({ persona });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, metadata")
    .eq("id", id)
    .single();

  if (!project || (project as any).user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as { persona: unknown };
  const existingMeta = (project as any).metadata ?? {};
  const updatedMeta = { ...existingMeta, persona: body.persona };

  await (supabase as any)
    .from("projects")
    .update({ metadata: updatedMeta, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
