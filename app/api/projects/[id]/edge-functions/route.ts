import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";
import {
  deployManagedEdgeFunction,
  isManagementTokenConfigured,
  listManagedEdgeFunctions,
} from "@/lib/cloud/management";

interface Params {
  params: Promise<{ id: string }>;
}

interface ProjectCloudRecord {
  id: string;
  cloud_enabled: boolean | null;
  cloud_project_ref: string | null;
}

async function loadProjectCloud(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<ProjectCloudRecord | null> {
  const { data } = await (supabase as any)
    .from("projects")
    .select("id, cloud_enabled, cloud_project_ref")
    .eq("id", projectId)
    .maybeSingle();
  return data as ProjectCloudRecord | null;
}

async function listLocalFunctions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const { data: files } = await (supabase as any)
    .from("project_files")
    .select("path, updated_at")
    .eq("project_id", projectId)
    .like("path", "supabase/functions/%/index.ts");

  return (files ?? []).map((file: { path: string; updated_at: string }) => {
    const slug = file.path.split("/")[2] ?? "unknown";
    return {
      id: slug,
      name: slug,
      slug,
      status: "INACTIVE" as const,
      created_at: file.updated_at,
      updated_at: file.updated_at,
    };
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = await loadProjectCloud(supabase, projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.cloud_project_ref && isManagementTokenConfigured()) {
    const result = await listManagedEdgeFunctions(project.cloud_project_ref);
    if (result.ok) {
      return NextResponse.json({ functions: result.functions, managed: true });
    }
    return NextResponse.json({ error: result.error ?? "Could not list managed functions" }, { status: 502 });
  }

  return NextResponse.json({
    functions: await listLocalFunctions(supabase, projectId),
    managed: false,
    message: "Cloud function deployment needs a managed Cloud project and management token.",
  });
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

  const body = await req.json().catch(() => null) as {
    name?: string;
    code?: string;
    verifyJwt?: boolean;
  } | null;
  const slug = body?.name?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  const code = body?.code?.trim();
  if (!slug || !code || slug.length > 63 || code.length > 1_000_000) {
    return NextResponse.json({ error: "Provide a valid function name and up to 1 MB of TypeScript source." }, { status: 400 });
  }

  const project = await loadProjectCloud(supabase, projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const path = `supabase/functions/${slug}/index.ts`;
  const { error: saveError } = await (supabase as any).from("project_files").upsert({
    project_id: projectId,
    path,
    content: code,
    language: "typescript",
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id,path" });
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  if (!project.cloud_project_ref || !isManagementTokenConfigured()) {
    return NextResponse.json({
      ok: true,
      deployed: false,
      slug,
      message: "Function source saved. Enable managed Lifemark Cloud to deploy it.",
    });
  }

  const deployment = await deployManagedEdgeFunction(project.cloud_project_ref, {
    slug,
    name: body?.name?.trim() || slug,
    code,
    verifyJwt: body?.verifyJwt,
  });
  if (!deployment.ok) {
    return NextResponse.json({
      error: deployment.error ?? "Supabase rejected the function deployment",
      sourceSaved: true,
    }, { status: 502 });
  }

  return NextResponse.json({ ok: true, deployed: true, function: deployment.function });
}
