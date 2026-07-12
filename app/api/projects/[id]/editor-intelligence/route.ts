import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import {
  ensureEditorLensRoster,
  insertEditorLensDecision,
  insertEditorLensMessage,
  loadEditorIntelligenceState,
} from "@/lib/ai/editor-lenses/persistence";
import {
  describeSupabaseError,
  isTransientSupabaseError,
  withSupabaseRetry,
} from "@/lib/supabase/transient-error";

interface Params {
  params: Promise<{ id: string }>;
}

interface ProjectRow {
  id: string;
  name: string | null;
  description: string | null;
  framework: string | null;
  status: string | null;
  user_id: string | null;
}

async function loadProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<ProjectRow | null> {
  const { data, error } = await withSupabaseRetry(() =>
    (supabase as any)
      .from("projects")
      .select("id, name, description, framework, status, user_id")
      .eq("id", projectId)
      .maybeSingle(),
  );
  if (error) {
    const described = describeSupabaseError(error);
    const err = new Error(`Could not load project: ${described.message}`);
    (err as { cause?: unknown; code?: string }).cause = error;
    (err as { code?: string }).code = described.code;
    throw err;
  }
  return data as ProjectRow | null;
}

function errorResponse(error: unknown, fallback = "Editor intelligence request failed") {
  const described = describeSupabaseError(error);
  const message = described.message || (error instanceof Error ? error.message : fallback);
  const status = isTransientSupabaseError(error) ? 503 : 500;
  return NextResponse.json(
    {
      error: message,
      transient: status === 503,
      retryable: status === 503,
    },
    {
      status,
      headers: status === 503 ? { "Retry-After": "3" } : undefined,
    },
  );
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getProjectAccess(supabase, id, user.id);
    if (!canReadProjectFiles(access)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const project = await loadProject(supabase, id);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const state = await loadEditorIntelligenceState(supabase, id);
    return NextResponse.json({ project, ...state });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getProjectAccess(supabase, id, user.id);
    if (!canWriteProjectFiles(access)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const project = await loadProject(supabase, id);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({})) as {
      action?: "bootstrap" | "message" | "decision";
      role?: string;
      content?: string;
      title?: string;
      summary?: string;
    };

    if (body.action === "bootstrap") {
      await ensureEditorLensRoster(supabase, id, project.name ?? "Untitled project");
    } else if (body.action === "message") {
      if (!body.role || !body.content?.trim()) {
        return NextResponse.json({ error: "role and content are required" }, { status: 400 });
      }
      await ensureEditorLensRoster(supabase, id, project.name ?? "Untitled project");
      await insertEditorLensMessage({
        supabase,
        projectId: id,
        role: body.role,
        phase: "manual",
        content: body.content.trim(),
        metadata: { source: "user", user_id: user.id },
      });
    } else if (body.action === "decision") {
      if (!body.title?.trim() || !body.summary?.trim()) {
        return NextResponse.json({ error: "title and summary are required" }, { status: 400 });
      }
      await ensureEditorLensRoster(supabase, id, project.name ?? "Untitled project");
      await insertEditorLensDecision({
        supabase,
        projectId: id,
        title: body.title.trim(),
        summary: body.summary.trim(),
        status: "proposed",
        metadata: { source: "user", user_id: user.id },
      });
    } else {
      return NextResponse.json({ error: "Unknown action. Use bootstrap, message, or decision." }, { status: 400 });
    }

    const state = await loadEditorIntelligenceState(supabase, id);
    return NextResponse.json({ project, ...state });
  } catch (error) {
    return errorResponse(error);
  }
}
