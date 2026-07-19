import { NextResponse } from "next/server";
import {
  canWriteProjectFiles,
  getProjectAccess,
  type ProjectAccess,
} from "@/lib/project/access";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Read access for chat history / search (owner, editor, viewer). */
export function canReadChat(access: ProjectAccess | null): boolean {
  return access === "owner" || access === "editor" || access === "viewer";
}

/** Write/delete/restore/truncate chat (owner, editor). */
export function canWriteChat(access: ProjectAccess | null): boolean {
  return canWriteProjectFiles(access);
}

export async function assertChatAccess(
  supabase: Supabase,
  projectId: string,
  userId: string,
  mode: "read" | "write",
): Promise<{ access: ProjectAccess } | { error: NextResponse }> {
  let access: ProjectAccess | null;
  try {
    access = await getProjectAccess(supabase, projectId, userId);
  } catch {
    return { error: NextResponse.json({ error: "Could not load project" }, { status: 503 }) };
  }

  if (!access || access === "public") {
    // Distinguish missing project vs no access when possible
    const { data: project } = await (supabase as any)
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) {
      return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
    }
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (mode === "read" && !canReadChat(access)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (mode === "write" && !canWriteChat(access)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { access };
}
