import { createClient } from "@/lib/supabase/server";

export type ProjectAccess = "owner" | "editor" | "viewer" | "public";

/** Resolve whether the user may read or write a project (owner, collaborator, or public). */
export async function getProjectAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  userId: string | undefined,
): Promise<ProjectAccess | null> {
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("user_id, is_public")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;
  if (userId && project.user_id === userId) return "owner";

  if (userId) {
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .not("accepted_at", "is", null)
      .maybeSingle();

    if (collab?.role === "editor") return "editor";
    if (collab?.role === "viewer") return "viewer";
    if (collab?.role === "owner") return "owner";
  }

  if (project.is_public) return "public";
  return null;
}

export function canReadProjectFiles(access: ProjectAccess | null): boolean {
  return access !== null;
}

export function canWriteProjectFiles(access: ProjectAccess | null): boolean {
  return access === "owner" || access === "editor";
}
