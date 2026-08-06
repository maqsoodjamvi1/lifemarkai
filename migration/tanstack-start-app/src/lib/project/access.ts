import { createAdminClient, createClient } from "../supabase/server.ts";
import {
  describeSupabaseError,
  isTransientSupabaseError,
  withSupabaseRetry,
} from "@/lib/supabase/transient-error";

export type ProjectAccess = "owner" | "editor" | "viewer" | "public";

interface ProjectAccessRow {
  user_id: string | null;
  is_public: boolean | null;
}

interface CollaboratorAccessRow {
  role: ProjectAccess | null;
}

/** Resolve whether the user may read or write a project (owner, collaborator, or public). */
export async function getProjectAccess(
  supabase:
    | Awaited<ReturnType<typeof createClient>>
    | Awaited<ReturnType<typeof createAdminClient>>,
  projectId: string,
  userId: string | undefined,
): Promise<ProjectAccess | null> {
  const { data: project, error } = await withSupabaseRetry(() =>
    (supabase as any)
      .from("projects")
      .select("user_id, is_public")
      .eq("id", projectId)
      .maybeSingle(),
  );
  const projectRow = project as ProjectAccessRow | null;

  if (error) {
    if (isTransientSupabaseError(error)) {
      const described = describeSupabaseError(error);
      const err = new Error(`Could not load project: ${described.message}`);
      (err as { cause?: unknown }).cause = error;
      throw err;
    }
    return null;
  }

  if (!projectRow) return null;
  if (userId && projectRow.user_id === userId) return "owner";

  if (userId) {
    const { data: collab, error: collabError } = await withSupabaseRetry(() =>
      (supabase as any)
        .from("collaborators")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .not("accepted_at", "is", null)
        .maybeSingle(),
    );
    const collabRow = collab as CollaboratorAccessRow | null;

    if (collabError && isTransientSupabaseError(collabError)) {
      const described = describeSupabaseError(collabError);
      const err = new Error(`Could not load project: ${described.message}`);
      (err as { cause?: unknown }).cause = collabError;
      throw err;
    }

    if (collabRow?.role === "editor") return "editor";
    if (collabRow?.role === "viewer") return "viewer";
    if (collabRow?.role === "owner") return "owner";
  }

  if (projectRow.is_public) return "public";
  return null;
}

export function canReadProjectFiles(access: ProjectAccess | null): boolean {
  return access !== null;
}

export function canWriteProjectFiles(access: ProjectAccess | null): boolean {
  return access === "owner" || access === "editor";
}
