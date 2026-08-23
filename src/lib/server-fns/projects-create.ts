import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import { classifyBuildIntent } from "../ai/build-intent.ts";
import {
  controlledTemplateMetadata,
  resolveControlledTemplate,
  stampControlledTemplateFiles,
} from "../templates/controlled-registry.ts";
import { getTemplateById, type TemplateFile } from "../templates/built-in.ts";
import {
  ALLOWED_FRAMEWORKS,
  PROJECT_SAFE_SELECT,
  getStarterFiles,
  isTemplateFile,
  withKnowledgeFile,
} from "./projects-shared.ts";
import type { Database } from "../../types/database.ts";

type ProjectFileInsert = Database["public"]["Tables"]["project_files"]["Insert"];

export async function listProjects() {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SAFE_SELECT)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return { status: "error" as const, message: error.message };
  return { status: "ok" as const, projects: data ?? [] };
}

export async function createProject(data: any) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  let preferred: string | undefined;
  if (!data.framework) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("preferred_framework")
        .eq("id", user.id)
        .maybeSingle();
      const p = profile?.preferred_framework;
      if (p === "static" || p === "tanstack-start" || p === "tanstack") preferred = p;
    } catch {
      /* preference optional */
    }
  }

  const intentText = `${data.name ?? ""} ${data.description ?? ""}`;
  const staticDefault =
    classifyBuildIntent(intentText).appType === "marketing-website" ? "static" : undefined;
  const requested =
    data.framework ??
    preferred ??
    (typeof process !== "undefined" ? process.env.DEFAULT_NEW_PROJECT_FRAMEWORK : undefined) ??
    staticDefault ??
    "tanstack-start";

  const framework = ALLOWED_FRAMEWORKS.has(requested) ? requested : "tanstack-start";
  const controlledTemplate = resolveControlledTemplate(
    `${data.name ?? ""} ${data.description ?? ""}`,
    framework,
  );

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: data.name,
      description: data.description ?? null,
      framework,
      runtime: framework === "static" ? "static" : "framework",
      status: "active",
      is_public: false,
      template_id: data.templateId ?? null,
      metadata: controlledTemplateMetadata(controlledTemplate),
    })
    .select(PROJECT_SAFE_SELECT)
    .single();

  if (error || !project) {
    return { status: "error" as const, message: error?.message ?? "Create failed" };
  }

  try {
    const { data: gen } = await supabase.rpc("generate_app_slug", { p_name: project.name });
    if (typeof gen === "string" && gen) {
      await supabase.from("projects").update({ app_slug: gen }).eq("id", project.id).is("app_slug", null);
    }
  } catch {
    /* non-critical */
  }

  const seedFiles = async (
    rows: ProjectFileInsert[],
    what: string,
  ): Promise<{ status: "error"; message: string } | null> => {
    if (rows.length === 0) return null;
    const { error: seedError } = await supabase.from("project_files").insert(rows);
    if (!seedError) return null;
    await supabase.from("projects").delete().eq("id", project.id);
    return {
      status: "error" as const,
      message: `Could not create the project's ${what}: ${seedError.message}`,
    };
  };

  if (data.forkFiles && data.forkFiles.length > 0) {
    const failed = await seedFiles(
      data.forkFiles.map((f: any) => ({
        project_id: project.id,
        path: f.path,
        content: f.content,
        language: f.language ?? "plaintext",
      })),
      "copied files",
    );
    if (failed) return failed;
    return { status: "ok" as const, project };
  }

  if (data.templateId) {
    const builtin = getTemplateById(data.templateId);
    let templateFiles = builtin?.files ?? null;
    if (!templateFiles) {
      const { data: dbTemplate } = await supabase
        .from("templates")
        .select("files")
        .eq("id", data.templateId)
        .maybeSingle();
      if (dbTemplate?.files && Array.isArray(dbTemplate.files)) {
        templateFiles = dbTemplate.files.filter(isTemplateFile);
      }
    }
    if (templateFiles && templateFiles.length > 0) {
      const filesWithKnowledge = withKnowledgeFile(
        templateFiles as TemplateFile[],
        data.name || "App",
      );
      const failed = await seedFiles(
        filesWithKnowledge.map((f) => ({
          project_id: project.id,
          path: f.path,
          content: f.content,
          language: f.language,
        })),
        "template files",
      );
      if (failed) return failed;
    }
  } else {
    const starterFiles = withKnowledgeFile(
      stampControlledTemplateFiles(getStarterFiles(data.name, framework), controlledTemplate),
      data.name || "App",
    );
    const failed = await seedFiles(
      starterFiles.map((f) => ({ project_id: project.id, ...f })),
      "starter files",
    );
    if (failed) return failed;
  }

  return { status: "ok" as const, project };
}
