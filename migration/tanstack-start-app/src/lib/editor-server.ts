/**
 * Editor server functions — TanStack Start port of the async
 * app/editor/[projectId]/page.tsx Server Component.
 *
 * The Next page did everything inline in an async RSC and used framework
 * control-flow (`redirect()`, `notFound()`, returning JSX on transient
 * errors). A `createServerFn` can't return JSX or throw framework redirects
 * that the client understands, so instead it returns a discriminated status
 * and the route `loader` translates it into TanStack `redirect()` / `notFound()`
 * or renders the connectivity-error UI.
 *
 * Preserved faithfully from the original:
 *   - project fetch with retry (withSupabaseRetry, 4 attempts)
 *   - stale-JWT recovery: refresh the session and retry with a fresh client
 *   - access control (getProjectAccess / canReadProjectFiles)
 *   - dev credit top-up (ensureDevCredits / getDevProfile)
 *   - parallel files/messages/profile load
 *   - message pagination (limit 501 → hasMore + first 500 reversed)
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { ensureDevCredits, getDevProfile } from "@/lib/dev-credits";
import {
  isTransientSupabaseError,
  describeSupabaseError,
  withSupabaseRetry,
} from "@/lib/supabase/transient-error";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import type { Project, ProjectFile, Message, Profile } from "@/types/database";

export const PROJECT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EditorData =
  | {
      status: "ok";
      project: Project;
      files: ProjectFile[];
      messages: Message[];
      hasMore: boolean;
      profile: Profile | null;
    }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "transient"; detail: string };

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
  return { project: (result.data as Project | null) ?? null, error: result.error };
}

export const fetchEditorData = createServerFn({ method: "GET" })
  .validator((input: { projectId: string }) => input)
  .handler(async ({ data }): Promise<EditorData> => {
    const { projectId } = data;
    if (!PROJECT_ID_RE.test(projectId)) return { status: "not_found" };

    try {
      const supabase = await createClient();
      const { user } = await getServerUser(supabase);
      if (!user) return { status: "unauthenticated" };

      // Fetch project (with retry); recover from stale-JWT RLS misses.
      let { project, error: projectError } = await fetchProjectForEditor(supabase, projectId);
      let accessClient = supabase;

      if (!project) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session) {
          const supabaseFresh = await createClient();
          const retry = await fetchProjectForEditor(supabaseFresh, projectId);
          project = retry.project;
          projectError = retry.error;
          accessClient = supabaseFresh;
        }
      }

      if (projectError) {
        const described = describeSupabaseError(projectError);
        if (isTransientSupabaseError(projectError)) {
          return { status: "transient", detail: described.message };
        }
        return { status: "not_found" };
      }
      if (!project) return { status: "not_found" };

      const access = await getProjectAccess(accessClient, projectId, user.id);
      if (!canReadProjectFiles(access)) return { status: "not_found" };

      await ensureDevCredits(user.id);

      const [filesResult, messagesResult, profileResult] = await Promise.all([
        (accessClient as any)
          .from("project_files")
          .select("*")
          .eq("project_id", projectId)
          .order("path"),
        (accessClient as any)
          .from("messages")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(501),
        (accessClient as any).from("profiles").select("*").eq("id", user.id).single(),
      ]);

      let profile = profileResult.data as Profile | null;
      if ((!profile || ((profile as any).credits ?? 0) <= 0) && process.env.NODE_ENV === "development") {
        profile = ((await getDevProfile(user.id)) as Profile | null) ?? profile;
      }

      const rawMessages = (messagesResult.data ?? []) as Message[];
      const hasMore = rawMessages.length > 500;
      const messages = (hasMore ? rawMessages.slice(0, 500) : rawMessages).slice().reverse();

      return {
        status: "ok",
        project,
        files: (filesResult.data ?? []) as ProjectFile[],
        messages,
        hasMore,
        profile: profile ?? null,
      };
    } catch (error) {
      const described = describeSupabaseError(error);
      if (isTransientSupabaseError(error)) {
        return { status: "transient", detail: described.message };
      }
      return { status: "not_found" };
    }
  });
