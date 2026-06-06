import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

const CONFIG_VERSION = "1.0";

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, name, framework, description, knowledge, is_public, metadata")
    .eq("id", id)
    .single();

  if (!project || (project as any).user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const sections = url.searchParams.getAll("sections");
  const includeAll = sections.length === 0;
  const include = (key: string) => includeAll || sections.includes(key);

  const config: Record<string, unknown> = {
    version: CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
  };

  // Project core settings
  if (include("project")) {
    config.project = {
      name: (project as any).name,
      framework: (project as any).framework,
      description: (project as any).description ?? undefined,
      knowledge: (project as any).knowledge ?? undefined,
      is_public: (project as any).is_public ?? false,
      metadata: (project as any).metadata ?? undefined,
    };
  }

  // Environment variables (keys only by default for security)
  if (include("envVars")) {
    const { data: envFiles } = await (supabase as any)
      .from("project_files")
      .select("content")
      .eq("project_id", id)
      .eq("path", ".env.local")
      .maybeSingle();

    if (envFiles?.content) {
      const envRecord: Record<string, string> = {};
      for (const line of (envFiles.content as string).split("\n")) {
        const [key] = line.split("=");
        if (key?.trim() && !key.trim().startsWith("#")) {
          // Include key name, mask value with placeholder
          envRecord[key.trim()] = "***";
        }
      }
      config.envVars = envRecord;
    }
  }

  // AI Persona
  if (include("persona")) {
    const persona = (project as any).metadata?.persona;
    if (persona) config.persona = persona;
  }

  // Feature flags
  if (include("featureFlags")) {
    const { data: flags } = await (supabase as any)
      .from("feature_flags")
      .select("key, enabled, description")
      .eq("project_id", id)
      .order("key");
    if (flags?.length) config.featureFlags = flags;
  }

  // Secrets metadata (no values)
  if (include("secrets")) {
    const { data: secrets } = await (supabase as any)
      .from("project_secrets")
      .select("key, description, rotate_after_days, days_old: created_at")
      .eq("project_id", id)
      .order("key");
    if (secrets?.length) {
      config.secrets = (secrets as { key: string; description: string | null; rotate_after_days: number }[]).map((s) => ({
        key: s.key,
        description: s.description ?? undefined,
        rotate_after_days: s.rotate_after_days,
      }));
    }
  }

  return NextResponse.json(config);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, metadata")
    .eq("id", id)
    .single();

  if (!project || (project as any).user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as {
    version?: string;
    project?: { name?: string; framework?: string; description?: string; knowledge?: string; is_public?: boolean; metadata?: Record<string, unknown> };
    persona?: Record<string, unknown>;
    featureFlags?: { key: string; enabled: boolean; description?: string }[];
  };

  if (!body.version) {
    return NextResponse.json({ error: "Invalid config: missing version" }, { status: 400 });
  }

  const results: string[] = [];

  // Apply project settings
  if (body.project) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.project.name) patch.name = body.project.name;
    if (body.project.framework) patch.framework = body.project.framework;
    if (body.project.description !== undefined) patch.description = body.project.description;
    if (body.project.knowledge !== undefined) patch.knowledge = body.project.knowledge;
    if (body.project.is_public !== undefined) patch.is_public = body.project.is_public;

    // Merge metadata if present
    if (body.project.metadata) {
      const existingMeta = (project as any).metadata ?? {};
      patch.metadata = { ...existingMeta, ...body.project.metadata };
    }

    await (supabase as any).from("projects").update(patch).eq("id", id);
    results.push("project");
  }

  // Apply persona (stored in metadata)
  if (body.persona) {
    const existingMeta = (project as any).metadata ?? {};
    await (supabase as any).from("projects")
      .update({ metadata: { ...existingMeta, persona: body.persona }, updated_at: new Date().toISOString() })
      .eq("id", id);
    results.push("persona");
  }

  // Apply feature flags (upsert)
  if (body.featureFlags?.length) {
    for (const flag of body.featureFlags) {
      await (supabase as any).from("feature_flags").upsert({
        project_id: id,
        key: flag.key,
        enabled: flag.enabled,
        description: flag.description ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,key" });
    }
    results.push("featureFlags");
  }

  return NextResponse.json({ ok: true, applied: results });
}
