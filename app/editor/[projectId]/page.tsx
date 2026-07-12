import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { ensureDevCredits, getDevProfile } from "@/lib/dev-credits";
import { redirect, notFound } from "next/navigation";
import { EditorLayout } from "@/components/editor/editor-layout";
import { EditorConnectivityError } from "@/components/editor/editor-connectivity-error";
import { isTransientSupabaseError, describeSupabaseError, withSupabaseRetry } from "@/lib/supabase/transient-error";
import type { Project } from "@/types/database";

export const dynamic = "force-dynamic";

interface EditorPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ prompt?: string; deploy?: string; mode?: string }>;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.app";
const PROJECT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchProjectForEditor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<{ project: Project | null; error: unknown | null }> {
  const result = await withSupabaseRetry(
    () =>
      (supabase as any)
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle(),
    { attempts: 4, baseDelayMs: 1000 },
  );
  return {
    project: (result.data as Project | null) ?? null,
    error: result.error,
  };
}

export async function generateMetadata({ params }: EditorPageProps) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("name, description, framework, is_public")
    .eq("id", projectId)
    .maybeSingle();

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
    const { prompt, deploy, mode } = await searchParams;
    if (!PROJECT_ID_RE.test(projectId)) notFound();
    const starterMode =
      mode === "plan" || mode === "build" || mode === "agent" || mode === "chat"
        ? mode
        : undefined;

    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) {
      redirect("/login");
    }

    // Allow collaborators to open the editor too — retry transient Supabase timeouts.
    let { project, error: projectError } = await fetchProjectForEditor(supabase, projectId);

    // Stale JWT can make RLS return 0 rows — refresh session and retry with a fresh client.
    if (!project && user) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) {
        const supabaseFresh = await createClient();
        const retry = await fetchProjectForEditor(supabaseFresh, projectId);
        project = retry.project;
        projectError = retry.error;
      }
    }

    if (projectError) {
      const described = describeSupabaseError(projectError);
      console.error("Project fetch error:", described.code ?? "?", described.message);
      if (isTransientSupabaseError(projectError)) {
        return <EditorConnectivityError detail={described.message} />;
      }
      notFound();
    }

    if (!project) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `Editor: project not found or access denied (id=${projectId}, user=${user.id})`,
        );
      }
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

    await ensureDevCredits(user.id);

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

    let profile = profileResult.data;
    if ((!profile || (profile.credits ?? 0) <= 0) && process.env.NODE_ENV === "development") {
      profile = (await getDevProfile(user.id)) ?? profile;
    }

    return (
      <EditorLayout
        project={project}
        initialFiles={filesResult.data ?? []}
        initialMessages={messagesResult.data ?? []}
        profile={profile}
        starterPrompt={prompt}
        starterMode={starterMode as import("@/components/editor/editor-layout").EditorMode | undefined}
        autoDeploy={deploy === "true"}
      />
    );
  } catch (error) {
    const described = describeSupabaseError(error);
    console.error("Editor page error:", described.code ?? "?", described.message);
    if (isTransientSupabaseError(error)) {
      return <EditorConnectivityError detail={described.message} />;
    }
    notFound();
  }
}
