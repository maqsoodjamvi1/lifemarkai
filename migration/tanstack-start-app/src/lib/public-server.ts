/**
 * Public marketing loaders — /u, /p, /app (no Next RSC).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { createClient } from "./supabase/server.ts";
import { getServerUser } from "./supabase/server-user.ts";

export const fetchPublicProfile = createServerFn({ method: "GET" })
  .validator(zodValidator(z.object({ username: z.string().min(1) })))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, github_username, created_at")
      .eq("username", data.username)
      .eq("is_public", true)
      .maybeSingle();

    if (!profile?.username) return { status: "not_found" as const };

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, description, preview_url, deployed_url, framework, created_at, slug")
      .eq("user_id", profile.id)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(24);

    return {
      status: "ok" as const,
      profile: { ...profile, username: profile.username },
      projects: projects ?? [],
    };
  });

export const fetchPublicProject = createServerFn({ method: "GET" })
  .validator(
    zodValidator(
      z.object({
        username: z.string().min(1),
        projectSlug: z.string().min(1),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, username")
      .eq("username", data.username)
      .maybeSingle();

    if (!profile) return { status: "not_found" as const };

    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", profile.id)
      .eq("is_public", true)
      .eq("slug", data.projectSlug)
      .maybeSingle();

    if (!project) return { status: "not_found" as const };

    const { data: files } = await supabase
      .from("project_files")
      .select("path, language")
      .eq("project_id", project.id)
      .limit(50);

    const technologies = [
      ...new Set((files || []).map((f: { language?: string }) => f.language).filter(Boolean)),
    ] as string[];

    return {
      status: "ok" as const,
      profile,
      project,
      files: files ?? [],
      technologies,
    };
  });

export const resolveAppSlug = createServerFn({ method: "GET" })
  .validator(zodValidator(z.object({ slug: z.string().min(1) })))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { data: project } = await supabase
      .from("projects")
      .select(
        // `deployed_url`, NOT `deploy_url`. The wrong name made PostgREST error on
        // the whole select, so `project` was null and EVERY public app page
        // returned not_found - the page never rendered at all. Public sharing has
        // been broken, silently, with nothing logged.
        "id, name, user_id, is_public, visibility, deployed_url, preview_url, description, seo_title, seo_description, og_image_url",
      )
      .eq("app_slug", data.slug)
      .maybeSingle();

    if (!project) return { status: "not_found" as const };

    const visibility: "public" | "workspace" | "private" =
      project.visibility === "public" ||
      project.visibility === "workspace" ||
      project.visibility === "private"
        ? project.visibility
        : project.is_public
          ? "public"
          : "workspace";

    if (visibility !== "public") {
      const { user } = await getServerUser(supabase);
      if (!user) return { status: "unauthenticated" as const, slug: data.slug };

      if (visibility === "private" && user.id !== project.user_id) {
        return { status: "not_found" as const };
      }

      if (visibility === "workspace") {
        const { data: collab } = await supabase
          .from("collaborators")
          .select("id")
          .eq("project_id", project.id)
          .eq("user_id", user.id)
          .maybeSingle();
        const allowed = user.id === project.user_id || Boolean(collab);
        if (!allowed) return { status: "not_found" as const };
      }
    }

    const destination =
      project.deployed_url || project.preview_url || `/preview/${project.id}`;

    return {
      status: "redirect" as const,
      destination: String(destination),
      title: project.seo_title || project.name,
      description: project.seo_description || project.description || "",
    };
  });
