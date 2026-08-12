import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateApiRequest } from "@/lib/api/api-key";

/**
 * Native /api/v1/projects — public API projects collection.
 *   GET  → list your projects   (scope: projects:read)
 *   POST → create a project     (scope: projects:write)
 * Auth: Authorization: Bearer lmk_… (dashboard → API keys).
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/v1/projects")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request, "projects:read");
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: CORS });

        const url = new URL(request.url);
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);

        const supabase = createAdminClient();
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, description, framework, runtime, status, deployed_url, created_at, updated_at")
          .eq("user_id", auth.userId)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });
        return Response.json({ projects: data ?? [] }, { headers: CORS });
      },

      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request, "projects:write");
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: CORS });

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
        }
        const schema = z.object({
          name: z.string().trim().min(1).max(100),
          description: z.string().max(2_000).optional(),
          framework: z.enum(["static", "nextjs", "react", "vue", "svelte"]).optional(),
        });
        const parsedBody = schema.safeParse(raw);
        if (!parsedBody.success) {
          return Response.json(
            { error: "Invalid request body", issues: parsedBody.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
            { status: 400, headers: CORS },
          );
        }
        const body = parsedBody.data;
        const name = body.name;
        const framework = body.framework ?? "static";
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        const supabase = createAdminClient();
        const { data, error } = await supabase
          .from("projects")
          .insert({
            user_id: auth.userId,
            name,
            description: body.description ?? "",
            framework,
            runtime: framework === "static" ? "static" : "framework",
            slug: `${slug || "app"}-${Date.now()}`,
          })
          .select("id, name, description, framework, runtime, status, created_at")
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });
        return Response.json({ project: data }, { status: 201, headers: CORS });
      },
    },
  },
});
