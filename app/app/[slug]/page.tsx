import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createClient();
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("name, description, seo_title, seo_description, og_image_url")
    .eq("app_slug", params.slug)
    .maybeSingle();

  if (!project) return { title: "App not found" };

  return {
    title: project.seo_title || project.name,
    description: project.seo_description || project.description || `${project.name} — built with LifemarkAI`,
    openGraph: {
      title: project.seo_title || project.name,
      description: project.seo_description || project.description || "",
      images: project.og_image_url ? [{ url: project.og_image_url }] : [],
    },
  };
}

export default async function AppSlugPage({ params }: Props) {
  const supabase = await createClient();
  const { slug } = params;

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, name, user_id, is_public, visibility, deploy_url, preview_url")
    .eq("app_slug", slug)
    .maybeSingle();

  if (!project) notFound();

  // Resolve effective visibility:
  // New "visibility" field takes precedence; fall back to is_public boolean
  const visibility: "public" | "workspace" | "private" =
    project.visibility ?? (project.is_public ? "public" : "workspace");

  if (visibility !== "public") {
    // Require auth for workspace-only or private apps
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      redirect(`/login?next=/app/${slug}`);
    }

    if (visibility === "private") {
      // Only the owner can access
      if (user.id !== project.user_id) {
        // Return 403-like: redirect to a not-found page
        notFound();
      }
    } else if (visibility === "workspace") {
      // User must be the owner OR a collaborator on this project
      const { data: collab } = await (supabase as any)
        .from("collaborators")
        .select("id")
        .eq("project_id", project.id)
        .eq("user_id", user.id)
        .maybeSingle();

      const isOwner = user.id === project.user_id;
      const isCollaborator = Boolean(collab);

      if (!isOwner && !isCollaborator) {
        notFound();
      }
    }
  }

  const destination =
    project.deploy_url ||
    project.preview_url ||
    `/preview/${project.id}`;

  redirect(destination);
}
