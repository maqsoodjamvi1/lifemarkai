import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import { ENV_FILE_PATH, parseEnvFile, serializeEnvFile } from "@/lib/project/env-file";

interface Params { params: Promise<{ id: string }> }

async function loadEnvRecord(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string) {
  const { data } = await (supabase as any)
    .from("project_files")
    .select("id, content")
    .eq("project_id", projectId)
    .eq("path", ENV_FILE_PATH)
    .maybeSingle();
  return data as { id: string; content: string } | null;
}

/** GET — list env var keys (values masked). POST — upsert one key. */
export async function GET(_: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const row = await loadEnvRecord(supabase, projectId);
  const vars = parseEnvFile(row?.content ?? "");
  const envVars = Object.keys(vars).map((key) => ({ key, value: "***" }));
  return NextResponse.json({ envVars });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { key, value } = await req.json() as { key?: string; value?: string };
  if (!key?.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 });
  if (value === undefined) return NextResponse.json({ error: "value is required" }, { status: 400 });

  const row = await loadEnvRecord(supabase, projectId);
  const vars = parseEnvFile(row?.content ?? "");
  vars[key.trim()] = value;
  const content = serializeEnvFile(vars);

  if (row) {
    await (supabase as any)
      .from("project_files")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  } else {
    await (supabase as any)
      .from("project_files")
      .insert({ project_id: projectId, path: ENV_FILE_PATH, content, language: "plaintext" });
  }

  return NextResponse.json({ ok: true, key: key.trim() });
}
