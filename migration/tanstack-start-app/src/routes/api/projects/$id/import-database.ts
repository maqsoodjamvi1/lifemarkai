// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { extractSchemaFromFiles, dumpSourceDatabase, buildSeedSql } from "@/lib/import/lovable-db";

/**
 * Native /api/projects/:id/import-database — bring a Lovable/Supabase project's
 * DATABASE over: schema from repo migrations + live data dumped over PostgREST.
 * Applies to a managed Cloud backend when permitted, else stages SQL files.
 */
export const Route = createFileRoute("/api/projects/$id/import-database")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const rl = await rateLimitAsync(`db-import:${user.id}`, RATE_LIMITS.api);
        if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

        const { data: project } = await (supabase as any)
          .from("projects")
          .select("id, user_id, environment, cloud_enabled, cloud_ref")
          .eq("id", projectId)
          .single();
        if (!project || project.user_id !== user.id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        if (project.environment === "live") {
          return Response.json(
            { environment_locked: true, error: "Project is Live — switch to Test to import a database." },
            { status: 423 },
          );
        }

        const { sourceUrl, sourceServiceKey } = (await request.json()) as {
          sourceUrl?: string;
          sourceServiceKey?: string;
        };
        if (!sourceUrl || !/^https:\/\/[\w-]+\.supabase\.co\/?$/.test(sourceUrl.trim())) {
          return Response.json(
            { error: "sourceUrl must be a Supabase project URL (https://xxxx.supabase.co)" },
            { status: 400 },
          );
        }
        if (!sourceServiceKey || sourceServiceKey.length < 30) {
          return Response.json({ error: "sourceServiceKey (service_role) is required" }, { status: 400 });
        }

        try {
          const { data: fileRows } = await (supabase as any)
            .from("project_files")
            .select("path, content")
            .eq("project_id", projectId)
            .like("path", "supabase/migrations/%");
          const { schemaSql, migrationCount } = extractSchemaFromFiles(fileRows ?? []);

          const dump = await dumpSourceDatabase(sourceUrl.trim(), sourceServiceKey.trim());
          const seedSql = buildSeedSql(dump.tables);
          const tablesWithData = dump.tables.filter((t) => t.rows.length > 0);

          let applied = false;
          let applyError: string | null = null;

          if (project.cloud_enabled && project.cloud_ref) {
            const { parseCloudToolPermissions } = await import("@/lib/cloud/permissions");
            const { data: profile } = await (supabase as any)
              .from("profiles").select("cloud_tool_permissions").eq("id", user.id).single();
            const perms = parseCloudToolPermissions(profile?.cloud_tool_permissions);

            if (perms.database === "allow") {
              const { runManagedSql } = await import("@/lib/cloud/management");
              if (schemaSql) {
                const schemaRes = await runManagedSql(project.cloud_ref, schemaSql);
                if (!schemaRes.ok) applyError = `schema: ${schemaRes.error}`;
              }
              if (!applyError && tablesWithData.length > 0) {
                const seedRes = await runManagedSql(project.cloud_ref, seedSql);
                if (!seedRes.ok) applyError = `data: ${seedRes.error}`;
              }
              applied = !applyError;
            } else {
              applyError = "Database permission is set to \"" + perms.database + "\" — staged as files instead (change it in the Cloud panel to auto-apply).";
            }
          }

          const staged: Array<{ path: string; content: string; language: string }> = [];
          if (schemaSql) staged.push({ path: "supabase/import/schema.sql", content: schemaSql, language: "sql" });
          if (tablesWithData.length > 0) staged.push({ path: "supabase/import/seed.sql", content: seedSql, language: "sql" });
          for (const f of staged) {
            await (supabase as any).from("project_files").upsert(
              { project_id: projectId, path: f.path, content: f.content, language: f.language },
              { onConflict: "project_id,path" },
            );
          }

          try {
            const summary = [
              `🗄️ **Database import ${applied ? "complete" : "staged"}** — ${tablesWithData.length} tables, ${dump.totalRows} rows${migrationCount ? `, schema from ${migrationCount} migrations` : ", no repo migrations found"}.`,
              applied
                ? "Schema + data were applied to your Lifemark Cloud backend."
                : `SQL staged at \`supabase/import/\` — run it from the DB panel${applyError ? ` (${applyError})` : ""}.`,
              dump.skippedTables.length ? `Skipped tables: ${dump.skippedTables.join(", ")}.` : "",
              dump.tables.some((t) => t.truncated) ? "Some tables were capped at 5,000 rows." : "",
            ].filter(Boolean).join("\n\n");
            await (supabase as any).from("messages").insert({
              project_id: projectId,
              role: "assistant",
              mode: "chat",
              content: summary,
              metadata: { imported_from: "lovable-db" },
            });
          } catch { /* non-fatal */ }

          return Response.json({
            applied,
            applyError,
            migrationCount,
            tables: tablesWithData.length,
            totalRows: dump.totalRows,
            skippedTables: dump.skippedTables,
            truncatedTables: dump.tables.filter((t) => t.truncated).map((t) => t.name),
            stagedFiles: staged.map((f) => f.path),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ error: "Database import failed: " + message }, { status: 502 });
        }
      },
    },
  },
});
