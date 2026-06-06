import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { runAgent, type AgentStep } from "@/lib/ai/agent";
import { detectLanguage } from "@/lib/ai/code-parser";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  parseCloudToolPermissions,
  buildCloudPermissionsPromptBlock,
  shouldBlockCloudAction,
} from "@/lib/cloud/permissions";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before sending another request." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  const body = await req.json();
  const { projectId, task, model } = body;
  if (!task || typeof task !== "string" || task.length > 8000) {
    return NextResponse.json({ error: "Task must be a string under 8000 characters" }, { status: 400 });
  }

  // Check credits (agents cost more)
  const { data: profile } = await (supabase as any).from("profiles")
    .select("credits, workspace_knowledge, cloud_tool_permissions").eq("id", user.id).single();
  if (!profile || profile.credits < 5) {
    return NextResponse.json({ error: "Need at least 5 credits for Agent Mode" }, { status: 402 });
  }

  const cloudPermissions = parseCloudToolPermissions(profile.cloud_tool_permissions);

  const { data: projectRow } = await (supabase as any)
    .from("projects").select("knowledge, cloud_enabled").eq("id", projectId).single();

  const cloudBlock = shouldBlockCloudAction(task, cloudPermissions);
  if (cloudBlock.blocked) {
    return NextResponse.json({ error: cloudBlock.reason, cloud_blocked: true, tool: cloudBlock.tool }, { status: 403 });
  }
  const projectKnowledge = (projectRow as { knowledge?: string | null } | null)?.knowledge?.trim();
  const workspaceKnowledge = (profile as { workspace_knowledge?: string | null }).workspace_knowledge?.trim();

  // Combine workspace + project knowledge (workspace first, project-level overrides)
  const knowledgeParts: string[] = [];
  if (workspaceKnowledge) knowledgeParts.push(`# Workspace Standards (always follow)\n${workspaceKnowledge}`);
  if (projectKnowledge) knowledgeParts.push(`# Project Instructions (takes precedence)\n${projectKnowledge}`);
  knowledgeParts.push(buildCloudPermissionsPromptBlock(cloudPermissions, !!projectRow?.cloud_enabled));
  const knowledge = knowledgeParts.length > 0 ? knowledgeParts.join("\n\n---\n\n") : undefined;

  const { data: files } = await (supabase as any)
    .from("project_files").select("path, content").eq("project_id", projectId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const result = await runAgent({
          task,
          projectId,
          files: files ?? [],
          model,
          knowledge,
          onStep: (step: AgentStep) => send({ step }),
          onFileChange: async (path: string, content: string) => {
            send({ fileUpdated: { path, content: content.slice(0, 100) + "..." } });

            // Persist to DB
            await (supabase as any).from("project_files").upsert(
              { project_id: projectId, path, content, language: detectLanguage(path) },
              { onConflict: "project_id,path" }
            );
          },
        });

        // Save agent task as messages
        await (supabase as any).from("messages").insert([
          { project_id: projectId, role: "user", content: task, mode: "agent" },
          {
            project_id: projectId, role: "assistant",
            content: result.summary, tokens_used: result.tokensUsed,
            model: model ?? (process.env.DEFAULT_AI_MODEL as import("@/lib/ai/provider").AIModel) ?? "deepseek/deepseek-chat-v3-0324", mode: "agent",
            metadata: { steps: result.steps.length, files_changed: result.filesChanged },
          },
        ]);

        // Deduct credits
        const creditCost = Math.min(result.steps.length * 2, 20);
        await (supabase as any).rpc("deduct_credits", {
          user_id: user.id, amount: creditCost,
          action: "agent_run", project_id: projectId,
        });

        import("@/lib/stripe/auto-topup")
          .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
          .catch(() => {});

        send({ done: true, summary: result.summary, filesChanged: result.filesChanged });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Agent failed";
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
