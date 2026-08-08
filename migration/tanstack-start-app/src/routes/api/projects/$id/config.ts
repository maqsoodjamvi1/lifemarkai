import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database,Json } from "@/types/database";

/**
 * Native /api/projects/:id/config — export/import a project's config bundle
 * (project settings, env-var keys, persona, feature flags, secret metadata).
 */
const CONFIG_VERSION = "1.0";

const importConfigSchema = z.object({
  version: z.string().min(1),
  project: z.object({
    name: z.string().min(1).max(200).optional(),
    framework: z.string().min(1).max(100).optional(),
    description: z.string().max(10_000).optional(),
    knowledge: z.string().max(100_000).optional(),
    is_public: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  }).optional(),
  persona: z.record(z.unknown()).optional(),
  featureFlags: z.array(z.object({
    key: z.string().min(1).max(100),
    enabled: z.boolean(),
    description: z.string().max(1_000).optional(),
  })).max(250).optional(),
});

function jsonObject(value: Json | null | undefined): { [key: string]: Json | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export const Route = createFileRoute("/api/projects/$id/config")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await supabase
          .from("projects")
          .select("id, user_id, name, framework, description, knowledge, is_public, metadata")
          .eq("id", id)
          .single();

        if (!project || project.user_id !== user.id) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        const url = new URL(request.url);
        const sections = url.searchParams.getAll("sections");
        const includeAll = sections.length === 0;
        const include = (key: string) => includeAll || sections.includes(key);

        const config: Record<string, unknown> = {
          version: CONFIG_VERSION,
          exportedAt: new Date().toISOString(),
        };

        if (include("project")) {
          config.project = {
            name: project.name,
            framework: project.framework,
            description: project.description ?? undefined,
            knowledge: project.knowledge ?? undefined,
            is_public: project.is_public ?? false,
            metadata: project.metadata ?? undefined,
          };
        }

        if (include("envVars")) {
          const { data: envFiles } = await supabase
            .from("project_files")
            .select("content")
            .eq("project_id", id)
            .eq("path", ".env.local")
            .maybeSingle();

          if (envFiles?.content) {
            const envRecord: Record<string, string> = {};
            for (const line of (envFiles.content as string).split("\n")) {
              const [key] = line.split("=");
              if (key?.trim() && !key.trim().startsWith("#")) envRecord[key.trim()] = "***";
            }
            config.envVars = envRecord;
          }
        }

        if (include("persona")) {
          const persona = jsonObject(project.metadata).persona;
          if (persona) config.persona = persona;
        }

        if (include("featureFlags")) {
          const { data: flags } = await supabase
            .from("project_feature_flags")
            .select("key, enabled:is_enabled, description")
            .eq("project_id", id)
            .order("key");
          if (flags?.length) config.featureFlags = flags;
        }

        if (include("secrets")) {
          const { data: secrets } = await supabase
            .from("project_secrets")
            .select("key, description, rotate_after_days")
            .eq("project_id", id)
            .order("key");
          if (secrets?.length) {
            config.secrets = secrets.map((s) => ({
              key: s.key,
              description: s.description ?? undefined,
              rotate_after_days: s.rotate_after_days,
            }));
          }
        }

        return Response.json(config);
      },

      POST: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await supabase
          .from("projects").select("id, user_id, metadata").eq("id", id).single();

        if (!project || project.user_id !== user.id) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        const parsed = importConfigSchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid config", issues: parsed.error.flatten() },
            { status: 400 },
          );
        }
        const body = parsed.data;
        if (body.version !== CONFIG_VERSION) {
          return Response.json(
            { error: `Unsupported config version: ${body.version}` },
            { status: 400 },
          );
        }

        const results: string[] = [];
        let currentMetadata = jsonObject(project.metadata);

        if (body.project) {
          const patch: Database["public"]["Tables"]["projects"]["Update"] = {
            updated_at: new Date().toISOString(),
          };
          if (body.project.name) patch.name = body.project.name;
          if (body.project.framework) patch.framework = body.project.framework;
          if (body.project.description !== undefined) patch.description = body.project.description;
          if (body.project.knowledge !== undefined) patch.knowledge = body.project.knowledge;
          if (body.project.is_public !== undefined) patch.is_public = body.project.is_public;
          if (body.project.metadata) {
            currentMetadata = { ...currentMetadata, ...body.project.metadata } as { [key: string]: Json | undefined };
            patch.metadata = currentMetadata;
          }
          const { error } = await supabase.from("projects").update(patch).eq("id", id);
          if (error) {
            return Response.json({ error: "Failed to import project settings" }, { status: 500 });
          }
          results.push("project");
        }

        if (body.persona) {
          currentMetadata = { ...currentMetadata, persona: body.persona } as { [key: string]: Json | undefined };
          const { error } = await supabase.from("projects")
            .update({ metadata: currentMetadata, updated_at: new Date().toISOString() })
            .eq("id", id);
          if (error) {
            return Response.json({ error: "Failed to import persona" }, { status: 500 });
          }
          results.push("persona");
        }

        if (body.featureFlags?.length) {
          const rows: Database["public"]["Tables"]["project_feature_flags"]["Insert"][] =
            body.featureFlags.map((flag) => ({
              project_id: id,
              created_by: user.id,
              key: flag.key,
              is_enabled: flag.enabled,
              rollout_pct: 100,
              description: flag.description ?? null,
              updated_at: new Date().toISOString(),
            }));
          const { error } = await supabase
            .from("project_feature_flags")
            .upsert(rows, { onConflict: "project_id,key" });
          if (error) {
            return Response.json({ error: "Failed to import feature flags" }, { status: 500 });
          }
          results.push("featureFlags");
        }

        return Response.json({ ok: true, applied: results });
      },
    },
  },
});
