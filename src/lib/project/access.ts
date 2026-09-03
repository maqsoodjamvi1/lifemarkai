import { createAdminClient,createClient } from "../supabase/server.ts";
import {
describeSupabaseError,
isTransientSupabaseError,
withSupabaseRetry,
} from "../supabase/transient-error.ts";

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
    supabase
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
      supabase
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

/** Cloud DB/storage/jobs — teammates only, never a public-link visitor. */
export function canAccessProjectBackend(access: ProjectAccess | null): boolean {
  return access === "owner" || access === "editor" || access === "viewer";
}

/** Owner or accepted collaborator — same gate Lovable uses for Cloud/DB/Storage. */
export async function denyUnlessProjectAccess(
  supabase:
    | Awaited<ReturnType<typeof createClient>>
    | Awaited<ReturnType<typeof createAdminClient>>,
  projectId: string,
  userId: string,
  need: "read" | "write",
): Promise<{ access: ProjectAccess } | { error: Response }> {
  const access = await getProjectAccess(supabase, projectId, userId);
  if (need === "read" && !canAccessProjectBackend(access)) {
    return { error: Response.json({ error: "Project not found" }, { status: 404 }) };
  }
  if (need === "write" && !canWriteProjectFiles(access)) {
    return {
      error: Response.json(
        { error: canAccessProjectBackend(access) ? "Forbidden" : "Project not found" },
        { status: canAccessProjectBackend(access) ? 403 : 404 },
      ),
    };
  }
  return { access: access as ProjectAccess };
}
