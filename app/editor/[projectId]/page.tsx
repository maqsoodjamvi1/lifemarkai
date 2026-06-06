import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { EditorLayout } from "@/components/editor/editor-layout";

interface EditorPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ prompt?: string; deploy?: string }>;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.app";

export async function generateMetadata({ params }: EditorPageProps) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("name, description, framework, is_public")
    .eq("id", projectId)
    .single();

  if (!project) return { title: "Editor | LifemarkAI" };

  const title = `${project.name} — Editor | LifemarkAI`;
  const description = project.description
    ? project.description
    : `${project.framework ?? "React"} app built with LifemarkAI`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/editor/${projectId}`,
      type: "website",
      images: project.is_public
        ? [{ url: `${APP_URL}/preview/${projectId}/og`, width: 1200, height: 630 }]
        : [{ url: `${APP_URL}/og-image.png`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: project.is_public ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function EditorPage({ params, searchParams }: EditorPageProps) {
  try {
    const { projectId } = await params;
    const { prompt, deploy } = await searchParams;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Allow collaborators to open the editor too
    const { data: project, error: projectError } = await (supabase as any)
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error("Project fetch error:", projectError);
      notFound();
    }

    // Verify access: owner or collaborator
    const isOwner = project.user_id === user.id;
    if (!isOwner) {
      const { data: collab } = await (supabase as any)
        .from("collaborators")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .single();
      if (!collab && !project.is_public) notFound();
    }

    const [filesResult, messagesResult, profileResult] = await Promise.all([
      (supabase as any)
        .from("project_files")
        .select("*")
        .eq("project_id", projectId)
        .order("path"),
      (supabase as any)
        .from("messages")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at")
        .limit(100),
      (supabase as any)
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single(),
    ]);

    return (
      <EditorLayout
        project={project}
        initialFiles={filesResult.data ?? []}
        initialMessages={messagesResult.data ?? []}
        profile={profileResult.data}
        starterPrompt={prompt}
        autoDeploy={deploy === "true"}
      />
    );
  } catch (error) {
    console.error("Editor page error:", error);
    notFound();
  }
}
