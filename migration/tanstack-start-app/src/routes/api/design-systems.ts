// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Design Systems API
 *
 *  GET ?projectId=<consumer>   → list design systems connected to this project
 *  GET ?available=1            → list workspace projects marked is_design_system
 *  POST                         → mark a project as a Design System / unmark
 *  PUT                          → connect/disconnect a DS to/from a project
 *  PATCH                        → reorder connected systems (priority)
 */

async function handleGET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get("projectId");
  const available = new URL(req.url).searchParams.get("available") === "1";

  if (available) {
    const { data } = await supabase
      .from("projects")
      .select("id, name, description, design_system_meta")
      .eq("user_id", user.id)
      .eq("is_design_system", true)
      .order("name", { ascending: true });
    return Response.json({ systems: data ?? [] });
  }

  if (!projectId) return Response.json({ error: "projectId or available=1 required" }, { status: 400 });

  const { data } = await supabase
    .from("project_design_systems")
    .select(`
      id, priority, enabled, connected_at,
      source_project_id,
      source:projects!project_design_systems_source_project_id_fkey ( id, name, description, design_system_meta )
    `)
    .eq("consumer_project_id", projectId)
    .eq("user_id", user.id)
    .order("priority", { ascending: true });

  return Response.json({ connections: data ?? [] });
}

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, mark, meta } = await req.json() as {
    projectId: string;
    mark: boolean;
    meta?: Record<string, unknown>;
  };
  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

  // Ownership check
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  // If unmarking, also drop all connections that point to this project
  if (!mark) {
    await supabase.from("project_design_systems").delete().eq("source_project_id", projectId);
  }

  const updatePayload: Record<string, unknown> = { is_design_system: !!mark };
  if (meta !== undefined) updatePayload.design_system_meta = meta;

  const { error } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Seed the .lovable folder on first mark if it doesn't exist
  if (mark) {
    const { data: existing } = await supabase
      .from("project_files")
      .select("id")
      .eq("project_id", projectId)
      .eq("path", ".lovable/system.md")
      .maybeSingle();
    if (!existing) {
      await supabase.from("project_files").insert([
        {
          project_id: projectId,
          path: ".lovable/system.md",
          language: "markdown",
          content: `# Design System: ${(meta as any)?.name ?? "Untitled"}\n\n## Installation\n_Describe how to install this design system in connected projects._\n\n## High-level guidelines\n_Code patterns, design principles, decision trees._\n`,
        },
        {
          project_id: projectId,
          path: ".lovable/rules/components.md",
          language: "markdown",
          content: `# Components\n\n_Per-component specifications: Button, Input, Modal, etc._\n`,
        },
        {
          project_id: projectId,
          path: ".lovable/rules/styling.md",
          language: "markdown",
          content: `# Styling\n\n## Colors\n## Typography\n## Spacing\n`,
        },
      ]);
    }
  }

  return Response.json({ ok: true, isDesignSystem: mark });
}

async function handlePUT(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { consumerProjectId, sourceProjectId, action } = await req.json() as {
    consumerProjectId: string;
    sourceProjectId: string;
    action: "connect" | "disconnect";
  };

  if (!consumerProjectId || !sourceProjectId) {
    return Response.json({ error: "consumerProjectId and sourceProjectId required" }, { status: 400 });
  }

  if (consumerProjectId === sourceProjectId) {
    return Response.json({ error: "A project cannot connect to itself" }, { status: 400 });
  }

  if (action === "disconnect") {
    await supabase
      .from("project_design_systems")
      .delete()
      .eq("consumer_project_id", consumerProjectId)
      .eq("source_project_id", sourceProjectId)
      .eq("user_id", user.id);
    return Response.json({ ok: true });
  }

  // Connect — verify source is actually a design system
  const { data: source } = await supabase
    .from("projects")
    .select("id, is_design_system")
    .eq("id", sourceProjectId)
    .eq("user_id", user.id)
    .single();
  if (!source) return Response.json({ error: "Source project not found" }, { status: 404 });
  if (!source.is_design_system) {
    return Response.json({ error: "Source project is not marked as a design system" }, { status: 400 });
  }

  // Determine priority: append to end
  const { data: existing } = await supabase
    .from("project_design_systems")
    .select("priority")
    .eq("consumer_project_id", consumerProjectId)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPriority = ((existing?.priority ?? 0) + 100);

  const { error } = await supabase
    .from("project_design_systems")
    .insert({
      consumer_project_id: consumerProjectId,
      source_project_id: sourceProjectId,
      priority: nextPriority,
      enabled: true,
      user_id: user.id,
    });
  if (error && error.code !== "23505") {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

async function handlePATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { connectionId, priority, enabled } = await req.json() as {
    connectionId: string;
    priority?: number;
    enabled?: boolean;
  };
  if (!connectionId) return Response.json({ error: "connectionId required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (priority !== undefined) updates.priority = priority;
  if (enabled !== undefined) updates.enabled = enabled;

  const { error } = await supabase
    .from("project_design_systems")
    .update(updates)
    .eq("id", connectionId)
    .eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}


export const Route = createFileRoute("/api/design-systems")({
  server: { handlers: {
    GET: async ({ request }) => handleGET(request),
    POST: async ({ request }) => handlePOST(request),
    PUT: async ({ request }) => handlePUT(request),
    PATCH: async ({ request }) => handlePATCH(request),
  } },
});
