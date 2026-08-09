import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Native /api/ai/commit-message — Conventional-Commits message from changed
 * files. TRUE NATIVE (no worker). Body: { projectId, changedFiles[] }.
 */
interface ChangedFile { path: string; content?: string }

export const Route = createFileRoute("/api/ai/commit-message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
        if (!rl.success) return Response.json({ error: "Rate limited" }, { status: 429 });

        let body: { projectId?: string; changedFiles?: ChangedFile[] };
        try { body = await request.json(); } catch { body = {}; }

        const { projectId, changedFiles = [] } = body;
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });
        if (changedFiles.length === 0) return Response.json({ error: "No changed files" }, { status: 400 });

        const { data: project } = await supabase
          .from("projects").select("id, user_id, name, framework").eq("id", projectId).single();

        if (!project || project.user_id !== user.id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const fileSummary = changedFiles
          .slice(0, 20)
          .map((f) => {
            const snippet = (f.content ?? "").slice(0, 300);
            return `- ${f.path}${snippet ? `\n  ${snippet.replace(/\n/g, "\n  ")}` : ""}`;
          })
          .join("\n");

        const systemPrompt = `You are a senior software engineer writing git commit messages.
Generate a single, concise commit message following the Conventional Commits format:
  <type>(<scope>): <short description>

Rules:
- type: feat | fix | chore | refactor | style | docs | test | perf
- scope: short component or area name (optional but preferred)
- description: imperative mood, lowercase, no period, max 72 chars total
- Output ONLY the commit message string — no explanation, no quotes, no markdown`;

        const userPrompt = `Project: ${project.name} (${project.framework ?? "web app"})
Changed files:
${fileSummary}

Generate a commit message for these changes.`;

        try {
          const response = await generateAI({
            model: getFastAiModel(),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            maxTokens: 80,
          }, { projectId, userId: user.id, task: "commit_message" });

          const message = (response.content ?? "").trim().replace(/^["\']|["\']$/g, "");
          if (!message) return Response.json({ error: "AI returned empty response" }, { status: 500 });

          return Response.json({ message });
        } catch (e) {
          return Response.json({ error: "AI generation failed: " + String(e) }, { status: 500 });
        }
      },
    },
  },
});
