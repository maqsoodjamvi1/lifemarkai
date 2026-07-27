// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey } from "@/lib/api/api-key";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Native /api/integrations/openai/build — ChatGPT Action "createProject".
 * Auth via X-LifemarkAI-Key or Bearer key (projects:create scope). Creates a
 * project + starter message and returns its editor URL.
 */
interface CreateBody {
  prompt?: string;
  framework?: "react" | "next" | "vue" | "svelte" | "vanilla";
  name?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-LifemarkAI-Key, Authorization",
  "Access-Control-Max-Age": "86400",
};

function deriveName(prompt: string): string {
  const cleaned = prompt
    .replace(/^(please\s+)?(build|create|make|generate)\s+(a|an|the)\s+/i, "")
    .replace(/[.!?].*$/, "")
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1) || "Untitled project";
}

export const Route = createFileRoute("/api/integrations/openai/build")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const headerKey =
          request.headers.get("x-lifemarkai-key") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          "";
        if (!headerKey) {
          return Response.json(
            { error: "Missing API key. Set X-LifemarkAI-Key or Authorization: Bearer <key>." },
            { status: 401, headers: CORS_HEADERS },
          );
        }
        const auth = await validateApiKey(headerKey);
        if (!auth) return Response.json({ error: "Invalid or expired API key." }, { status: 401, headers: CORS_HEADERS });
        if (!auth.scopes.includes("projects:create")) {
          return Response.json(
            { error: "API key is missing the `projects:create` scope. Re-issue it from /dashboard/settings → API keys." },
            { status: 403, headers: CORS_HEADERS },
          );
        }

        const rl = await rateLimitAsync(auth.userId, RATE_LIMITS.ai);
        if (!rl.success) {
          return Response.json(
            { error: "Rate limit exceeded. Please wait before sending another request." },
            { status: 429, headers: { ...CORS_HEADERS, "X-RateLimit-Reset": String(rl.resetAt) } },
          );
        }

        let body: CreateBody;
        try {
          body = (await request.json()) as CreateBody;
        } catch {
          return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: CORS_HEADERS });
        }

        const prompt = (body.prompt ?? "").trim();
        if (!prompt || prompt.length < 5) {
          return Response.json({ error: "prompt is required and must be at least 5 characters." }, { status: 400, headers: CORS_HEADERS });
        }
        if (prompt.length > 4000) {
          return Response.json({ error: "prompt is too long (max 4000 characters)." }, { status: 400, headers: CORS_HEADERS });
        }
        const framework: NonNullable<CreateBody["framework"]> =
          ["react", "next", "vue", "svelte", "vanilla"].includes(body.framework ?? "")
            ? (body.framework as NonNullable<CreateBody["framework"]>)
            : "react";

        const name = (body.name?.trim() || deriveName(prompt)).slice(0, 80);

        const supabase = createAdminClient();
        const { data: project, error } = await (supabase as any)
          .from("projects")
          .insert({
            user_id: auth.userId,
            name,
            description: prompt,
            framework,
            status: "active",
            is_public: false,
          })
          .select()
          .single();

        if (error) {
          return Response.json({ error: `Failed to create project: ${error.message}` }, { status: 500, headers: CORS_HEADERS });
        }

        await (supabase as any).from("messages").insert({
          project_id: project.id,
          role: "user",
          content: prompt,
          model: null,
          tokens_used: 0,
        });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com";
        return Response.json(
          {
            projectId: project.id,
            editorUrl: `${baseUrl}/editor/${project.id}`,
            name: project.name,
            next: "Open the editor URL to watch the AI build your app.",
          },
          { status: 201, headers: CORS_HEADERS },
        );
      },
    },
  },
});
