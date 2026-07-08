import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import { runAgent, type AgentStep } from "@/lib/ai/agent";
import { mcpInitialize, mcpListTools, mcpCallTool } from "@/lib/ai/mcp-client";
import { detectLanguage } from "@/lib/ai/code-parser";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";
import { ensureDevCredits } from "@/lib/dev-credits";
import { claimDailyCredits } from "@/lib/credits";
import { AGENT_MIN_CREDITS } from "@/lib/ai/credit-cost";
import { ensureCommonGeneratedSupportFiles } from "@/lib/ai/generated-support-files";
import { autoWireBackend } from "@/lib/cloud/auto-wire";
import { autoWireAi } from "@/lib/ai/auto-wire-ai";
import { runSelfVerification } from "@/lib/ai/self-verify";
import {
  parseCloudToolPermissions,
  buildCloudPermissionsPromptBlock,
  shouldBlockCloudAction,
} from "@/lib/cloud/permissions";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { attachSkillsToPrompt } from "@/lib/ai/attach-skills";
import {
  buildEditorIntelligencePromptBlock,
  recordEditorIntelligenceBuild,
} from "@/lib/ai/editor-lenses/persistence";
import { maxOutputTokensForRequest, resolveBudgetAwareModel } from "@/lib/ai/cost-controls";

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
  const { projectId, task, rawTask, model, modelManuallySelected = false } = body;
  const costTask = typeof rawTask === "string" && rawTask.trim() ? rawTask : task;
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
  if (creditsBalance < AGENT_MIN_CREDITS) {
    return NextResponse.json(
      { error: `Need at least ${AGENT_MIN_CREDITS} credits for Agent Mode` },
      { status: 402 },
    );
  }

  const cloudPermissions = parseCloudToolPermissions(profile?.cloud_tool_permissions);

  const { data: projectRow } = await (supabase as any)
    .from("projects")
    .select("name, knowledge, cloud_enabled, environment, disabled_skill_ids")
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
  const editorIntelligenceContext = await buildEditorIntelligencePromptBlock(supabase, projectId);
  if (editorIntelligenceContext) knowledgeParts.push(editorIntelligenceContext.trim());
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
  const effectiveModel = resolveBudgetAwareModel({
    requestedModel: model,
    mode: "agent",
    prompt: costTask,
    fileCount: Array.isArray(files) ? files.length : 0,
    manuallySelected: modelManuallySelected === true,
  });

  // ── User MCP chat connectors (migration 076) ─────────────────────────────
  // Load the user's enabled remote MCP servers (cap 5), list their tools, and
  // expose them to the agent as namespaced "mcp_{server}_{tool}" extra tools.
  // Failures are skipped silently (logged) — a dead connector never blocks a run.
  type ExtraTool = {
    name: string;
    description: string;
    inputSchema?: unknown;
    execute: (args: Record<string, unknown>) => Promise<string>;
  };
  const MAX_MCP_SERVERS = 5;
  const MAX_MCP_TOOLS = 25;
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "server";
  const extraTools: ExtraTool[] = [];
  try {
    const { data: mcpServers } = await (supabase as any)
      .from("user_mcp_servers")
      .select("id, name, url, auth_header, enabled")
      .eq("user_id", user.id)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(MAX_MCP_SERVERS);

    if (Array.isArray(mcpServers) && mcpServers.length > 0) {
      const settled = await Promise.allSettled(
        mcpServers.map(async (srv: { id: string; name: string; url: string; auth_header: string | null }) => {
          const init = await mcpInitialize(srv.url, srv.auth_header);
          const tools = await mcpListTools(srv.url, srv.auth_header, init.sessionId);
          return { srv, sessionId: init.sessionId, tools };
        })
      );
      for (const outcome of settled) {
        if (outcome.status === "rejected") {
          console.warn("[agent] MCP connector skipped:", outcome.reason instanceof Error ? outcome.reason.message : outcome.reason);
          continue;
        }
        const { srv, sessionId, tools } = outcome.value;
        const serverSlug = slugify(srv.name);
        for (const tool of tools) {
          if (extraTools.length >= MAX_MCP_TOOLS) break;
          const toolName = `mcp_${serverSlug}_${slugify(tool.name)}`;
          if (extraTools.some((t) => t.name === toolName)) continue;
          extraTools.push({
            name: toolName,
            description: `[${srv.name} connector] ${tool.description || tool.name}`.slice(0, 400),
            inputSchema: tool.inputSchema,
            execute: (args: Record<string, unknown>) =>
              mcpCallTool(srv.url, { name: tool.name, args, authHeader: srv.auth_header, sessionId }),
          });
        }
      }
    }
  } catch (err) {
    console.warn("[agent] MCP connector loading failed:", err instanceof Error ? err.message : err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const projectFileMap = new Map<string, { path: string; content: string; language?: string }>();
        for (const file of Array.isArray(files) ? files : []) {
          const path = String(file.path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
          if (!path) continue;
          projectFileMap.set(path, { path, content: String(file.content ?? ""), language: detectLanguage(path) });
        }

        const result = await runAgent({
          task,
          projectId,
          files: files ?? [],
          model: effectiveModel,
          maxOutputTokens: maxOutputTokensForRequest({
            mode: "agent",
            prompt: costTask,
            fileCount: Array.isArray(files) ? files.length : 0,
            defaultBuildMax: 8000,
            defaultChatMax: 4000,
          }),
          knowledge,
          extraTools: extraTools.length > 0 ? extraTools : undefined,
          onStep: (step: AgentStep) => send({ step }),
          onFileChange: async (path: string, content: string) => {
            const cleanPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
            projectFileMap.set(cleanPath, { path: cleanPath, content, language: detectLanguage(cleanPath) });
            send({ fileUpdated: { path: cleanPath, content: content.slice(0, 100) + "..." } });

            // Persist to DB
            await (supabase as any).from("project_files").upsert(
              { project_id: projectId, path: cleanPath, content, language: detectLanguage(cleanPath) },
              { onConflict: "project_id,path" }
            );
          },
        });

        const supportFiles = ensureCommonGeneratedSupportFiles(Array.from(projectFileMap.values())).filter(
          (file) => !projectFileMap.has(file.path.replace(/\\/g, "/").replace(/^\/+/, "")),
        );
        if (supportFiles.length > 0) {
          await (supabase as any).from("project_files").upsert(
            supportFiles.map((file) => ({
              project_id: projectId,
              path: file.path,
              content: file.content,
              language: file.language ?? detectLanguage(file.path),
            })),
            { onConflict: "project_id,path" },
          );
          for (const file of supportFiles) {
            projectFileMap.set(file.path, { path: file.path, content: file.content, language: file.language });
            send({ fileUpdated: { path: file.path, content: file.content.slice(0, 100) + "..." } });
          }
        }
        const filesChanged = Array.from(
          new Set([...(Array.isArray(result.filesChanged) ? result.filesChanged : []), ...supportFiles.map((file) => file.path)]),
        );

        // Save agent task as messages
        await (supabase as any).from("messages").insert([
          { project_id: projectId, role: "user", content: task, mode: "agent" },
          {
            project_id: projectId, role: "assistant",
            content: result.summary, tokens_used: result.tokensUsed,
            model: effectiveModel ?? getDefaultAiModel(), mode: "agent",
            metadata: { steps: result.steps.length, files_changed: filesChanged },
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
        if (filesChanged.length > 0) {
          try {
            const { data: changedRows } = await (supabase as any)
              .from("project_files")
              .select("path, content, language")
              .eq("project_id", projectId)
              .in("path", filesChanged);
            backendWiring = await autoWireBackend({
              supabase,
              projectId,
              userId: user.id,
              prompt: task,
              generatedFiles: (changedRows ?? []) as Array<{ path: string; content: string }>,
              cloudToolPermissionsRaw: profile?.cloud_tool_permissions,
              emit: (status) => send({ wiring_status: status }),
            });
            // In-app AI connector auto-wiring (managed AI for the generated app)
            try {
              await autoWireAi({
                supabase,
                projectId,
                prompt: task,
                generatedFiles: (changedRows ?? []) as Array<{ path: string; content: string }>,
                emit: (status) => send({ wiring_status: status }),
              });
            } catch { /* never fail the build */ }
          } catch { backendWiring = null; }

          try {
            verification = await runSelfVerification({
              supabase,
              projectId,
              emit: (status) => send({ verify_status: status }),
            });
          } catch { verification = null; }

          await recordEditorIntelligenceBuild({
            supabase,
            projectId,
            projectName: (projectRow as { name?: string | null } | null)?.name ?? null,
            source: "agent",
            mode: "agent",
            prompt: task,
            filesChanged,
            backendWiring,
            verification,
          });
        }

        send({
          done: true,
          summary: result.summary,
          filesChanged,
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
