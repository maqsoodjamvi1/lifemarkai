import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import {
generateAppMcpFiles,
MCP_GENERATED_BANNER,
type McpServerSpec,
} from "@/lib/ai/app-mcp-codegen";

/**
 * Native /api/projects/:id/mcp-generate — write an MCP server INTO the app.
 *
 * This is the Lovable-model replacement for the platform-hosted proxy at
 * /api/apps/:id/mcp. Instead of registering actions we then forward HTTP to,
 * we generate real source files into the project:
 *
 *   src/lib/mcp/runtime.ts          dependency-free defineTool/defineMcp
 *   src/lib/mcp/index.ts            server metadata + tool registry
 *   src/lib/mcp/tools/<kebab>.ts    one editable file per tool
 *   supabase/functions/mcp/index.ts Deno edge function (MCP JSON-RPC)
 *   .lifemark/mcp/manifest.json     discovery manifest
 *
 * The edge function runs in the USER's Supabase project and forwards the
 * caller's JWT into supabase-js, so Row Level Security performs authorisation.
 * That is the whole point of the rewrite: under the old proxy every MCP caller
 * was one shared principal, so a tool could never act as the signed-in end user.
 *
 * Files whose banner has been deleted are treated as user-owned and skipped, so
 * a regenerate never clobbers hand-edited tools.
 */
export const Route = createFileRoute("/api/projects/$id/mcp-generate")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await supabase
          .from("projects")
          .select("id, user_id, name, cloud_project_ref")
          .eq("id", id)
          .single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const canWrite =
          project.user_id === user.id ||
          (await supabase
            .from("collaborators")
            .select("role")
            .eq("project_id", id)
            .eq("user_id", user.id)
            .maybeSingle()
            .then((r: any) => ["owner", "editor"].includes(r.data?.role)));
        if (!canWrite) return Response.json({ error: "Forbidden" }, { status: 403 });

        const body = await request.json().catch(() => ({}));
        const tools = Array.isArray(body?.tools) ? body.tools : [];
        if (tools.length === 0) {
          return Response.json(
            { error: "At least one tool is required (name, description, table)" },
            { status: 400 },
          );
        }
        for (const t of tools) {
          if (!t?.name || !t?.description || !t?.table) {
            return Response.json(
              { error: "Each tool needs name, description and table" },
              { status: 400 },
            );
          }
          if (!/^[a-z][a-z0-9_]*$/.test(t.name)) {
            return Response.json(
              { error: `Invalid tool name "${t.name}" — use snake_case` },
              { status: 400 },
            );
          }
        }

        // The OAuth issuer must be the app's OWN Supabase project, otherwise the
        // forwarded token would be validated against the wrong tenant.
        const projectRef = body?.projectRef ?? project.cloud_project_ref;
        if (!projectRef) {
          return Response.json(
            {
              error:
                "This project has no Supabase backend yet — enable Lifemark Cloud first so the MCP server has an OAuth issuer.",
            },
            { status: 400 },
          );
        }

        const slug =
          (project.name ?? "app")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "app";

        const spec: McpServerSpec = {
          name: body?.serverName ?? `${slug}-mcp`,
          title: body?.serverTitle ?? `${project.name ?? "App"} MCP`,
          version: body?.version ?? "0.1.0",
          instructions: body?.instructions,
          projectRef,
          tools,
        };

        // Existing content decides what is regenerated vs left alone.
        const { data: existing } = await supabase
          .from("project_files")
          .select("path, content")
          .eq("project_id", id)
          .like("path", "%mcp%");

        const generated = generateAppMcpFiles(spec, existing ?? []);
        const skipped = (existing ?? [])
          .filter(
            (f: any) =>
              typeof f.content === "string" &&
              !f.content.startsWith(MCP_GENERATED_BANNER) &&
              /(^src\/lib\/mcp\/|^supabase\/functions\/mcp\/|^\.lifemark\/mcp\/)/.test(f.path),
          )
          .map((f: any) => f.path);

        for (const file of generated) {
          await supabase.from("project_files").upsert(
            {
              project_id: id,
              path: file.path,
              content: file.content,
              language: file.language,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "project_id,path" },
          );
        }

        const manifest = generated.find((f) => f.path.endsWith("manifest.json"));

        return Response.json({
          ok: true,
          endpoint: `https://${projectRef}.supabase.co/functions/v1/mcp`,
          written: generated.map((f) => f.path),
          skippedUserOwned: skipped,
          manifest: manifest ? JSON.parse(manifest.content) : null,
          next: "Deploy the edge function (supabase/functions/mcp) so the endpoint goes live.",
        });
      },
    },
  },
});
