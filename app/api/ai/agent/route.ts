import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import { runAgent, type AgentStep } from "@/lib/ai/agent";
import { detectLanguage } from "@/lib/ai/code-parser";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";
import { ensureDevCredits } from "@/lib/dev-credits";
import { claimDailyCredits } from "@/lib/credits";
import { autoWireBackend } from "@/lib/cloud/auto-wire";
import { runSelfVerification } from "@/lib/ai/self-verify";
import {
  parseCloudToolPermissions,
  buildCloudPermissionsPromptBlock,
  shouldBlockCloudAction,
} from "@/lib/cloud/permissions";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { attachSkillsToPrompt } from "@/lib/ai/attach-skills";

export const runtime = "nodejs";
// Agent run + backend wiring + browser verification (Lovable budgets 15 min).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
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
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!task || typeof task !== "string" || task.length > 8000) {
    return NextResponse.json({ error: "Task must be a string under 8000 characters" }, { status: 400 });
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Check credits (agents cost more). Dev accounts auto-grant via ensureDevCredits.
  await claimDailyCredits(supabase, user.id); // grants today's free credits before the gate
  const { data: profile } = await (supabase as any).from("profiles")
    .select("credits, workspace_knowledge, cloud_tool_permissions").eq("id", user.id).single();
  let creditsBalance = profile?.credits ?? 0;
  const granted = await ensureDevCredits(user.id);
  if (granted !== null) creditsBalance = granted;
  if (creditsBalance < 1) {
    return NextResponse.json({ error: "Need at least 1 credit for Agent Mode" }, { status: 402 });
  }

  const cloudPermissions = parseCloudToolPermissions(profile?.cloud_tool_permissions);

  const { data: projectRow } = await (supabase as any)
    .from("projects")
    .select("knowledge, cloud_enabled, environment, disabled_skill_ids")
    .eq("id", projectId)
    .single();

  // Test/Live environments: Agent mode writes files — block when Live.
  if ((projectRow as { environment?: string } | null)?.environment === "live") {
    return NextResponse.json(
      {
        error: "This project is in the Live environment. Switch to Test to make changes, then publish them to Live.",
        environment_locked: true,
      },
      { status: 423 }
    );
  }

  const cloudBlock = shouldBlockCloudAction(task, cloudPermissions);
  if (cloudBlock.blocked) {
    return NextResponse.json({ error: cloudBlock.reason, cloud_blocked: true, tool: cloudBlock.tool }, { status: 403 });
  }
  const projectKnowledge = (projectRow as { knowledge?: string | null } | null)?.knowledge?.trim();
  const workspaceKnowledge = profile?.workspace_knowledge?.trim();

  // Combine workspace + project knowledge (workspace first, project-level overrides)
  const knowledgeParts: string[] = [];
  if (workspaceKnowledge) knowledgeParts.push(`# Workspace Standards (always follow)\n${workspaceKnowledge}`);
  if (projectKnowledge) knowledgeParts.push(`# Project Instructions (takes precedence)\n${projectKnowledge}`);
  knowledgeParts.push(buildCloudPermissionsPromptBlock(cloudPermissions, !!projectRow?.cloud_enabled));

  const { block: skillBlock } = await attachSkillsToPrompt(
    supabase,
    user.id,
    task,
    Array.isArray(projectRow?.disabled_skill_ids) ? projectRow.disabled_skill_ids : [],
  );
  if (skillBlock) knowledgeParts.push(skillBlock);

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
            model: model ?? getDefaultAiModel(), mode: "agent",
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

        // ── Lovable parity: backend auto-wiring + self-verification ──────────
        let backendWiring = null;
        let verification = null;
        if (Array.isArray(result.filesChanged) && result.filesChanged.length > 0) {
          try {
            const { data: changedRows } = await (supabase as any)
              .from("project_files")
              .select("path, content, language")
              .eq("project_id", projectId)
              .in("path", result.filesChanged);
            backendWiring = await autoWireBackend({
              supabase,
              projectId,
              userId: user.id,
              prompt: task,
              generatedFiles: (changedRows ?? []) as Array<{ path: string; content: string }>,
              cloudToolPermissionsRaw: profile?.cloud_tool_permissions,
              emit: (status) => send({ wiring_status: status }),
            });
          } catch { backendWiring = null; }

          try {
            verification = await runSelfVerification({
              supabase,
              projectId,
              emit: (status) => send({ verify_status: status }),
            });
          } catch { verification = null; }
        }

        send({
          done: true,
          summary: result.summary,
          filesChanged: result.filesChanged,
          backend_wired: backendWiring ?? undefined,
          verification: verification
            ? { engine: verification.engine, passed: verification.passed, fixesApplied: verification.fixesApplied, errors: verification.errors }
            : undefined,
        });
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
