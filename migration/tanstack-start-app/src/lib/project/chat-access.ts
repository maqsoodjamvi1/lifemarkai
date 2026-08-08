/**
 * Chat ACL for Start — same rules as lib/project/chat-access.ts,
 * but returns status codes instead of NextResponse.
 */
import {
canWriteProjectFiles,
getProjectAccess,
type ProjectAccess,
} from "@/lib/project/access";
import type { createClient } from "../supabase/server.ts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export function canReadChat(access: ProjectAccess | null): boolean {
  return access === "owner" || access === "editor" || access === "viewer";
}

export function canWriteChat(access: ProjectAccess | null): boolean {
  return canWriteProjectFiles(access);
}

export type ChatAccessResult =
  | { ok: true; access: ProjectAccess }
  | { ok: false; status: number; error: string };

export async function assertChatAccess(
  supabase: Supabase,
  projectId: string,
  userId: string,
  mode: "read" | "write",
): Promise<ChatAccessResult> {
  let access: ProjectAccess | null;
  try {
    access = await getProjectAccess(supabase, projectId, userId);
  } catch {
    return { ok: false, status: 503, error: "Could not load project" };
  }

  if (!access || access === "public") {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return { ok: false, status: 404, error: "Not found" };
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (mode === "read" && !canReadChat(access)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (mode === "write" && !canWriteChat(access)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, access };
}
