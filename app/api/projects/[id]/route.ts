import { createAdminClient, createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logAuditFromRequest } from "@/lib/audit/log";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";

interface Params { params: Promise<{ id: string }> }

const PUBLIC_PROJECT_SELECT = [
  "id", "user_id", "name", "description", "framework", "status", "is_public",
  "preview_url", "deployed_url", "template_id", "slug", "app_slug",
  "seo_title", "seo_description", "og_image_url", "favicon_url", "remix_enabled",
  "remix_count", "remix_of", "badge_hidden", "total_views", "created_at", "updated_at",
].join(", ");

const PROJECT_UPDATE_FIELDS = new Set([
  "name",
  "description",
  "framework",
  "status",
  "is_public",
  "visibility",
  "knowledge",
  "metadata",
  "is_starred",
  "disabled_skill_ids",
  "seo_title",
  "seo_description",
  "og_image_url",
  "favicon_url",
  "remix_enabled",
  "badge_hidden",
]);

const OWNER_ONLY_PROJECT_FIELDS = new Set([
  "status",
  "is_public",
  "visibility",
  "is_starred",
  "remix_enabled",
  "badge_hidden",
]);

function safeProjectResponse(data: Record<string, unknown>) {
  const response = { ...data };
  // These credentials are server-only, even for owners and collaborators.
  delete response.cloud_service_key;
  delete response.cloud_db_password;
  return response;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  const access = await getProjectAccess(supabase, id, user?.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await (supabase as any)
    .from("projects")
    .select(access === "public" ? PUBLIC_PROJECT_SELECT : "*, project_files(*)")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(safeProjectResponse(data as Record<string, unknown>));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsedBody = await req.json() as unknown;
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json({ error: "Project update must be an object" }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;
  const rejectedFields = Object.keys(body).filter(
    (key) => key !== "generate_slug" && !PROJECT_UPDATE_FIELDS.has(key),
  );
  if (rejectedFields.length > 0) {
    return NextResponse.json(
      { error: `Unsupported project field: ${rejectedFields[0]}` },
      { status: 400 },
    );
  }
  if (access !== "owner") {
    const ownerOnlyField = Object.keys(body).find(
      (key) => key === "generate_slug" || OWNER_ONLY_PROJECT_FIELDS.has(key),
    );
    if (ownerOnlyField) {
      return NextResponse.json(
        { error: `Only the project owner can update ${ownerOnlyField}` },
        { status: 403 },
      );
    }
  }

  // Handle generate_slug flag — call the DB function, don't pass it to update()
  const { generate_slug, ...requestedFields } = body;
  const updateFields = Object.fromEntries(
    Object.entries(requestedFields).filter(([key]) => PROJECT_UPDATE_FIELDS.has(key)),
  );
  if (generate_slug) {
    // generate_project_slug(p_name, p_user_id) slugifies + dedupes the `slug`
    // column. Use the incoming rename or the project's current name.
    let slugName: string | undefined =
      typeof updateFields.name === "string" ? updateFields.name : undefined;
    const { data: existing } = await (supabase as any)
      .from("projects")
      .select("name, user_id")
      .eq("id", id)
      .single();
    if (!slugName) slugName = (existing as { name?: string } | null)?.name;
    const { data: slugData } = await (supabase as any).rpc("generate_project_slug", {
      p_name: slugName ?? "project",
      p_user_id: (existing as { user_id?: string } | null)?.user_id ?? user.id,
    });
    if (slugData) {
      updateFields.slug = slugData as string;
    }
  }

  const writeClient = access === "owner" ? supabase : await createAdminClient();
  const { data, error } = await (writeClient as any)
    .from("projects")
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(safeProjectResponse(data as Record<string, unknown>));
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (access !== "owner") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
