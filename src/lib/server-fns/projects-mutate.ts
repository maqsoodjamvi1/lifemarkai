import { createAdminClient, createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import { PROJECT_SAFE_SELECT } from "./projects-shared.ts";
import { z } from "zod";

const PUBLIC_PROJECT_SELECT =
  "id, user_id, name, description, framework, status, is_public, preview_url, deployed_url, template_id, slug, app_slug, seo_title, seo_description, og_image_url, favicon_url, remix_enabled, remix_count, remix_of, badge_hidden, total_views, created_at, updated_at" as const;

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

function safeProjectResponse(data: Record<string, unknown>): any {
  const response = { ...data };
  delete response.cloud_service_key;
  delete response.cloud_db_password;
  return response;
}

export async function getProject(data: any) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  const access = await getProjectAccess(supabase, data.id, user?.id);
  if (!canReadProjectFiles(access)) return { status: "not_found" as const };

  const { data: project, error } =
    access === "public"
      ? await supabase.from("projects").select(PUBLIC_PROJECT_SELECT).eq("id", data.id).maybeSingle()
      : await supabase.from("projects").select(PROJECT_SAFE_SELECT).eq("id", data.id).maybeSingle();

  if (error || !project) return { status: "not_found" as const };
  return {
    status: "ok" as const,
    project: safeProjectResponse(project as Record<string, unknown>),
  };
}

export async function updateProject(data: any) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, data.id, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

  const body = data.patch;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: "error" as const, message: "Project update must be an object" };
  }

  const rejectedFields = Object.keys(body).filter(
    (key) => key !== "generate_slug" && !PROJECT_UPDATE_FIELDS.has(key),
  );
  if (rejectedFields.length > 0) {
    return {
      status: "error" as const,
      message: `Unsupported project field: ${rejectedFields[0]}`,
    };
  }
  if (access !== "owner") {
    const ownerOnlyField = Object.keys(body).find(
      (key) => key === "generate_slug" || OWNER_ONLY_PROJECT_FIELDS.has(key),
    );
    if (ownerOnlyField) {
      return {
        status: "forbidden" as const,
        message: `Only the project owner can update ${ownerOnlyField}`,
      };
    }
  }

  const { generate_slug, ...requestedFields } = body as Record<string, unknown>;
  const updateFields = Object.fromEntries(
    Object.entries(requestedFields).filter(([key]) => PROJECT_UPDATE_FIELDS.has(key)),
  );

  if ("visibility" in updateFields || "is_public" in updateFields) {
    const nextVisibility =
      typeof updateFields.visibility === "string"
        ? updateFields.visibility
        : updateFields.is_public === true
          ? "public"
          : "private";
    updateFields.visibility = nextVisibility;
    updateFields.is_public = nextVisibility === "public";
  }

  if (generate_slug) {
    let slugName =
      typeof updateFields.name === "string" ? (updateFields.name as string) : undefined;
    const { data: existing } = await supabase
      .from("projects")
      .select("name, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!slugName) slugName = existing?.name;
    const { data: slugData } = await supabase.rpc("generate_project_slug", {
      p_name: slugName ?? "project",
      p_user_id: existing?.user_id ?? user.id,
    });
    if (slugData) updateFields.slug = slugData as string;
  }

  const writeClient = access === "owner" ? supabase : createAdminClient();
  const { data: project, error } = await (writeClient as any)
    .from("projects")
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq("id", data.id)
    .select(PROJECT_SAFE_SELECT)
    .single();

  if (error || !project) {
    return { status: "error" as const, message: error?.message ?? "Update failed" };
  }
  return {
    status: "ok" as const,
    project: safeProjectResponse(project as Record<string, unknown>),
  };
}

export async function deleteProject(data: any) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, data.id, user.id);
  if (access !== "owner") return { status: "not_found" as const };

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", data.id)
    .eq("user_id", user.id);

  if (error) return { status: "error" as const, message: error.message };
  return { status: "ok" as const, success: true };
}
