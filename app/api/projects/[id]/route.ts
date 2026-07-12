import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logAuditFromRequest } from "@/lib/audit/log";

interface Params { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await (supabase as any)
    .from("projects")
    .select("*, project_files(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Handle generate_slug flag — call the DB function, don't pass it to update()
  const { generate_slug, ...updateFields } = body;
  if (generate_slug) {
    // generate_project_slug(p_name, p_user_id) slugifies + dedupes the `slug`
    // column. Use the incoming rename or the project's current name.
    let slugName: string | undefined =
      typeof updateFields.name === "string" ? updateFields.name : undefined;
    if (!slugName) {
      const { data: existing } = await (supabase as any)
        .from("projects")
        .select("name")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      slugName = (existing as { name?: string } | null)?.name;
    }
    const { data: slugData } = await (supabase as any).rpc("generate_project_slug", {
      p_name: slugName ?? "project",
      p_user_id: user.id,
    });
    if (slugData) {
      updateFields.slug = slugData as string;
    }
  }

  const { data, error } = await (supabase as any)
    .from("projects")
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await (supabase as any)
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAuditFromRequest(req, {
    userId: user.id,
    action: "project.delete",
    resourceType: "project",
    resourceId: id,
  });
  return NextResponse.json({ success: true });
}
