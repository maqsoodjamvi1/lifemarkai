import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import {
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import { ENV_FILE_PATH, parseEnvFile, serializeEnvFile } from "@/lib/project/env-file";

interface Params { params: Promise<{ id: string; key: string }> }

/** DELETE — remove one env var key from `.env.local`. */
export async function DELETE(_: NextRequest, { params }: Params) {
  const { id: projectId, key } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: row } = await (supabase as any)
    .from("project_files")
    .select("id, content")
    .eq("project_id", projectId)
    .eq("path", ENV_FILE_PATH)
    .maybeSingle();

  if (!row) return NextResponse.json({ ok: true });

  const vars = parseEnvFile(row.content ?? "");
  delete vars[decodeURIComponent(key)];
  const content = serializeEnvFile(vars);

  await (supabase as any)
    .from("project_files")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", row.id);

  return NextResponse.json({ ok: true });
}
