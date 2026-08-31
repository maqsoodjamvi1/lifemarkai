/**
 * Native project drafts — list / create.
 *
 * Lovable parity: "multiple independent drafts/branches per project each
 * with its own chat history." A draft is a first-class project row of its
 * own (own files, own messages, own preview/deploy/snapshot history) linked
 * back to where it came from via projects.draft_of/draft_root_id — see
 * migration 180 for why this reuses the whole existing project pipeline
 * instead of retrofitting draft scoping into every files/messages call site.
 */
import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import {
canReadProjectFiles,
canWriteProjectFiles,
getProjectAccess,
} from "@/lib/project/access";

const DRAFT_SELECT = "id, name, draft_of, draft_root_id, draft_label, created_at, updated_at" as const;

export interface ProjectDraftSummary {
  id: string;
  name: string;
  label: string;
  isRoot: boolean;
  isCurrent: boolean;
  createdAt: string;
}

export async function listProjectDrafts(data: { projectId?: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };
  if (!data.projectId) return { status: "not_found" as const };

  const access = await getProjectAccess(supabase, data.projectId, user.id);
  if (!canReadProjectFiles(access)) return { status: "not_found" as const };

  const { data: source, error: srcErr } = await supabase
    .from("projects")
    .select("id, draft_root_id")
    .eq("id", data.projectId)
    .maybeSingle();
  if (srcErr || !source) return { status: "not_found" as const };

  const rootId = source.draft_root_id ?? source.id;

  const { data: rows, error } = await supabase
    .from("projects")
    .select(DRAFT_SELECT)
    .or(`id.eq.${rootId},draft_root_id.eq.${rootId}`)
    .order("created_at", { ascending: true });

  if (error) return { status: "error" as const, message: error.message };

  const drafts: ProjectDraftSummary[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    label: r.id === rootId ? "Original" : ((r.draft_label as string | null) ?? "Draft"),
    isRoot: r.id === rootId,
    isCurrent: r.id === data.projectId,
    createdAt: r.created_at as string,
  }));

  return { status: "ok" as const, rootId, drafts };
}

export async function createProjectDraft(data: { projectId?: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };
  if (!data.projectId) return { status: "not_found" as const };

  const access = await getProjectAccess(supabase, data.projectId, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

  const { data: source, error: srcErr } = await supabase
    .from("projects")
    .select("*, project_files(path, content, language)")
    .eq("id", data.projectId)
    .single();
  if (srcErr || !source) return { status: "not_found" as const };

  const rootId = (source.draft_root_id as string | null) ?? source.id;

  // Best-effort sequential numbering for the label ("Draft 2", "Draft 3", …).
  // Two drafts created at almost the same instant could in principle collide
  // on the same number — a cosmetic label clash, not a correctness bug, since
  // each draft is still its own distinct project row. Not worth a
  // transaction/lock for a display label.
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .or(`id.eq.${rootId},draft_root_id.eq.${rootId}`);
  const draftNumber = (count ?? 1) + 1;

  const { data: rootRow } = await supabase
    .from("projects")
    .select("name")
    .eq("id", rootId)
    .maybeSingle();
  const baseName = rootRow?.name ?? source.name;

  const { data: newProject, error: createErr } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: `${baseName} (Draft ${draftNumber})`,
      description: source.description,
      framework: source.framework,
      runtime: source.runtime,
      status: "active",
      is_public: false,
      draft_of: source.id,
      draft_root_id: rootId,
      draft_label: `Draft ${draftNumber}`,
      knowledge: source.knowledge,
    })
    .select("id, name, draft_label")
    .single();

  if (createErr || !newProject) {
    return { status: "error" as const, message: createErr?.message ?? "Failed to create draft" };
  }

  const sourceFiles = (source.project_files ?? []) as Array<{
    path: string;
    content: string;
    language: string;
  }>;

  if (sourceFiles.length > 0) {
    const { error: filesErr } = await supabase.from("project_files").insert(
      sourceFiles.map((f) => ({
        project_id: newProject.id,
        path: f.path,
        content: f.content,
        language: f.language,
      })),
    );
    // A draft with no files is a dead end, same reasoning as createProject's
    // seedFiles() cleanup — don't leave a half-created draft the user can see
    // but not use.
    if (filesErr) {
      await supabase.from("projects").delete().eq("id", newProject.id);
      return { status: "error" as const, message: `Could not copy files to the new draft: ${filesErr.message}` };
    }
  }

  return {
    status: "ok" as const,
    draft: { id: newProject.id, name: newProject.name, label: newProject.draft_label as string },
  };
}
