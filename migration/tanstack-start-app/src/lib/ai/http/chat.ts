import { createAdminClient } from "@/lib/supabase/server";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";
import { generateAI } from "@/lib/ai/generate";
import { ECONOMY_CODING_MODEL, getDefaultAiModel, ESCALATION_MODEL } from "@/lib/ai/model-defaults";
import { applyModelAdapter } from "@/lib/ai/model-catalog";
import { sendLowCreditsEmail } from "@/lib/email/resend";
import {
  CHAT_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  AUTO_FIX_SYSTEM_PROMPT,
  PATCH_SYSTEM_PROMPT,
  buildGenerationPrompt,
  buildReactNativePrompt,
  buildNextJSPrompt,
  buildProjectContext,
  buildRepairPrompt,
} from "@/lib/ai/system-prompts";
import { buildTemplateRefinementBlock } from "@/lib/ai/template-refine";
import { pickStarterTemplate } from "@/lib/templates/starter-catalog";
import { buildDesignDirectionBlock } from "@/lib/ai/design-directions";
import { applyPatches, collapsePatchResults, parsePatchResponse } from "@/lib/ai/patch-applier";
import { buildPersistedAssistantContent } from "@/lib/ai/persist-message-mode";
import { persistChatTurnMessages } from "@/lib/ai/persist-chat-turn";
import {
  buildNavEditContext,
  buildDeterministicMenuPatches,
  extractMenuLabelsFromPrompt,
  extractNavHaystack,
  extractDesktopNavHaystack,
  filterUnsafeHeaderPatches,
  findNavSourceFiles,
  isMenuNavEditIntent,
  navContainsLabel,
  remapInventedNavPatchPaths,
} from "@/lib/ai/nav-edit";
import {
  buildDeterministicTextPatches,
  parseTextReplacementIntent,
  parseHeadingDescriptor,
} from "@/lib/ai/text-edit";
import { parseAIResponse, validateGeneratedFiles, assessGenerationQuality, shouldAutoFix, needsBuildContinuation, detectLanguage, type ParsedFile } from "@/lib/ai/code-parser";
import { ensureCommonGeneratedSupportFiles } from "@/lib/ai/generated-support-files";
import { ensureWebsiteChrome } from "@/lib/ai/website-chrome";
import { alignGeneratedPackageJson, stripGeneratedRouteTree } from "@/lib/preview/align-package-json";
import { StreamingFileExtractor } from "@/lib/ai/streaming-file-extractor";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateApiKey } from "@/lib/api/api-key";
import { logger } from "@/lib/logger";
import { getProjectSchemaContext } from "@/lib/supabase/schema-reader";
import { attachSkillsToPrompt } from "@/lib/ai/attach-skills";
import { decideInitiativeRouting } from "@/lib/ai/initiative-routing";
import type { SkillMatch } from "@/lib/ai/skill-matcher";
import {
  shouldUseSubagents,
  runSubagentInvestigation,
  rankFilesByKeywords,
  type SubagentStep,
} from "@/lib/ai/subagents";
import {
  parallelSubagentsEnabled,
  planSubagents,
  runParallelSubagents,
} from "@/lib/ai/subagents-parallel";
import { computeCreditCost, maxCreditCostForMode } from "@/lib/ai/credit-cost";
import {
  cancelCreditReservation,
  claimDailyCredits,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";
import type { AutoWireResult, SelfVerifyResult } from "@/lib/ai/http/result-types";
import { autoWireAi } from "@/lib/ai/auto-wire-ai";
import { selectRelevantFiles } from "@/lib/ai/file-selector";
import { buildCompletedBuildActivity } from "@/lib/ai/build-activity";
import {
  parseCloudToolPermissions,
  buildCloudPermissionsPromptBlock,
  shouldBlockCloudAction,
} from "@/lib/cloud/permissions";
import { ensureDevCredits, getDevProfile } from "@/lib/dev-credits";
import { detectDeployIntent } from "@/lib/ai/deploy-intent";
import { detectCloudIntent } from "@/lib/ai/cloud-intent";
import { ENV_FILE_PATH, parseEnvFile } from "@/lib/project/env-file";
import {
  buildEditorIntelligencePromptBlock,
  recordEditorIntelligenceBuild,
} from "@/lib/ai/editor-lenses/persistence";
import {
  contextBudgetForRequest,
  isSimpleEditorRequest,
  maxOutputTokensForRequest,
  resolveBudgetAwareModel,
} from "@/lib/ai/cost-controls";
import { resolveSmartModel } from "@/lib/ai/editor-intelligence";

// Generation + backend wiring + self-verification can exceed a minute on
// complex builds (Lovable budgets 15 min for agent runs).

// Output token budget for full-app builds. 8000 was too small for multi-file
// generations — the response was cut off mid-JSON and later files (e.g. App.tsx)
// were silently dropped, leaving a placeholder app. Env-overridable.
// Defaults to the prior 32K for zero behavior change; set BUILD_MAX_TOKENS=64000
// to generate complete apps in one pass on Claude/Gemini. provider.ts clamps the
// value down per-model (e.g. to 16K) if the slug falls back to gpt-4o, so raising
// it is always safe.
const BUILD_MAX_TOKENS = Number(process.env.BUILD_MAX_TOKENS) || 32000;
const CHAT_MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS) || 4096;
// If the model still hits the cap mid-JSON, ask it to continue this many times
// before giving up — guarantees we don't ship a half-generated build.
const BUILD_CONTINUATION_ROUNDS = Number(process.env.BUILD_CONTINUATION_ROUNDS) || 3;

/** Safe SSE enqueue/close — avoids "Controller is already closed" when the client disconnects mid-build. */
function createStreamSink(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  signal: AbortSignal,
  onDisconnect?: () => void,
) {
  let clientDisconnected = signal.aborted;
  const onAbort = () => {
    clientDisconnected = true;
    onDisconnect?.();
  };
  signal.addEventListener("abort", onAbort);

  const safeEnqueue = (chunk: Uint8Array): boolean => {
    if (clientDisconnected) return false;
    try {
      controller.enqueue(chunk);
      return true;
    } catch {
      clientDisconnected = true;
      return false;
    }
  };

  const safeClose = () => {
    signal.removeEventListener("abort", onAbort);
    if (clientDisconnected) return;
    try {
      controller.close();
    } catch {
      /* already closed */
    }
    clientDisconnected = true;
  };

  return { safeEnqueue, safeClose, isClientGone: () => clientDisconnected };
}

export async function handleAiChat(req: Request) {
  try {
    // ── Auth: cookie session OR API key ─────────────────────────────────────
    let userId: string;
    const apiKeyHeader = req.headers.get("x-lifemark-api-key");

    if (apiKeyHeader) {
      const result = await validateApiKey(apiKeyHeader);
      if (!result) return Response.json({ error: "Invalid or expired API key" }, { status: 401 });
      if (!result.scopes.includes("ai:chat")) {
        return Response.json({ error: "API key missing ai:chat scope" }, { status: 403 });
      }
      userId = result.userId;
    } else {
      const supabase = createClientFromRequest(req);
      const { user } = await getServerUser(supabase);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;
    }

    const supabase = apiKeyHeader ? await createAdminClient() : createClientFromRequest(req);

    // Rate limiting
    const rl = await rateLimitAsync(userId, RATE_LIMITS.ai);
    if (!rl.success) {
      return Response.json(
        { error: "Rate limit exceeded. Please wait before sending another message." },
        { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
      );
    }

    const body = await req.json();
    const {
      projectId,
      message,
      model,
      files = [],
      imageBase64,
      clarifyFirst = false,
      framework = "web",
      // Optional: starter template to refine from (Horizons-style design baseline)
      templateId,
      // Optional: project-level Supabase overrides for schema reading
      projectSupabaseUrl,
      projectServiceKey,
      modelManuallySelected = false,
      rawMessage,
    } = body;
    type ChatRouteMode = "chat" | "plan" | "build" | "agent" | "patch";
    let mode: ChatRouteMode = (["chat", "plan", "build", "agent", "patch"] as const).includes(body.mode)
      ? (body.mode as ChatRouteMode)
      : "chat";
    const costPrompt = typeof rawMessage === "string" && rawMessage.trim() ? rawMessage : message;

    // ── Lovable-agent behavior: questions get ANSWERS, not rebuilds ────────
    // In Build mode, "why is the cart empty?" / "explain how auth works" must
    // NOT regenerate the app. Downgrade informational queries to chat (cheaper
    // + prose answer); action requests ("add", "fix", "change"…) still build.
    let autoRoutedPatch = false;
    if (mode === "build" && body.forceBuild !== true && Array.isArray(files) && files.length > 0 && typeof message === "string") {
      try {
        const { isInformationalQuery, isSmallSurgicalEdit } = await import("@/lib/ai/build-intent");
        if (isInformationalQuery(message)) {
          mode = "chat";
        } else if (files.length > 8 && isSmallSurgicalEdit(typeof rawMessage === "string" && rawMessage.trim() ? rawMessage : message)) {
          // Micro-edit → surgical patch pipeline (find/replace + deterministic
          // fallbacks) instead of a full regeneration: seconds, not minutes.
          // If the patch misses, the client silently retries with forceBuild.
          mode = "patch";
          autoRoutedPatch = true;
        }
      } catch { /* non-fatal — keep build */ }
    }
    // The CLIENT's smart router may pre-select patch mode itself (its own
    // surgical-edit detection). It tells us via body.autoRouted so a patch miss
    // still triggers the silent patch→build fallback instead of "try rephrasing".
    if (mode === "patch" && body.autoRouted === true) autoRoutedPatch = true;

    // Input validation
    if (!message || typeof message !== "string") {
      return Response.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > 16000) {
      return Response.json({ error: "Message too long (max 16,000 characters)" }, { status: 400 });
    }
    if (!projectId || typeof projectId !== "string") {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }
    const projectAccess = await getProjectAccess(supabase, projectId, userId);
    if (!canWriteProjectFiles(projectAccess)) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 5 * 1024 * 1024) {
      return Response.json({ error: "Image too large (max 5MB)" }, { status: 413 });
    }
    const persistedUserMessage = typeof costPrompt === "string" && costPrompt.trim() ? costPrompt : message;

    // ── Publish from chat — "ship it" (Lovable parity) ──────────────────────
    // When the message is PRIMARILY a publish request ("ship it", "publish",
    // "deploy", "go live"…) and the project has files, skip the AI entirely
    // (zero model cost, zero credits) and run the deploy pipeline, streaming
    // progress over the same SSE channel. Runs BEFORE the credit gate
    // (publishing is free) and BEFORE the Live-environment lock (publishing
    // is allowed on Live — it's not a code write).
    if (
      (mode === "chat" || mode === "build") &&
      Array.isArray(files) &&
      files.length > 0 &&
      detectDeployIntent(persistedUserMessage)
    ) {
      const { publishProjectFromChat } = await import("@/lib/deploy/publish-from-chat");
      const deployEncoder = new TextEncoder();
      const deployStream = new ReadableStream({
        async start(controller) {
          const { safeEnqueue: deployEnqueue, safeClose: deployClose } = createStreamSink(
            controller,
            deployEncoder,
            req.signal,
          );
          const send = (payload: Record<string, unknown>) =>
            deployEnqueue(deployEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          // Progress events: `status: "deploy_status"` for consumers that read
          // generic status events, plus `wiring_status` (same string) so the
          // existing chat panel renders it on its post-build status line —
          // exactly how backend wiring / self-verification stream progress.
          const emitDeployStatus = (status: string) =>
            send({ status: "deploy_status", message: status, wiring_status: status });

          let assistantContent: string;
          let deployOk = false;
          let deployUrl: string | undefined;
          try {
            emitDeployStatus("Publishing your app…");
            const result = await publishProjectFromChat({
              supabase,
              projectId,
              userId,
              emit: emitDeployStatus,
            });
            deployOk = result.ok;
            deployUrl = result.url;
            assistantContent = result.ok
              ? `Your app is live! 🚀\n\n**${result.url}**\n\nPublished ${result.fileCount} file${result.fileCount === 1 ? "" : "s"} via ${result.provider === "netlify" ? "Netlify" : "LifemarkAI hosting"}. Publishing is free — no credits were used. Say "publish" any time to ship your latest changes.`
              : `Publish failed: ${result.error ?? "Unknown error"}. Your app wasn't changed — you can try again, or publish from the Deploy panel.`;
          } catch (err) {
            assistantContent = `Publish failed: ${err instanceof Error ? err.message : String(err)}. Your app wasn't changed — you can try again, or publish from the Deploy panel.`;
          }

          // Persist the turn exactly like the normal flow (user + assistant rows).
          let assistantMessageId: string | undefined;
          try {
            const persisted = await persistChatTurnMessages(
              supabase,
              [
                { project_id: projectId, role: "user", content: persistedUserMessage, mode },
                {
                  project_id: projectId,
                  role: "assistant",
                  content: assistantContent,
                  tokens_used: 0,
                  mode,
                  metadata: {
                    credits_used: 0,
                    deploy_requested: true,
                    ...(deployUrl ? { deploy_url: deployUrl } : {}),
                  },
                },
              ],
              { projectId, label: "deploy-turn" },
            );
            assistantMessageId = persisted.assistantMessageId;
          } catch {
            /* message persistence is best-effort — the deploy already happened */
          }

          send({ chunk: assistantContent });
          send({
            done: true,
            tokensUsed: 0,
            creditsUsed: 0,
            fileCount: 0,
            assistantMessageId,
            deployed: deployOk,
            deploy_url: deployUrl,
            displayMessage: assistantContent,
          });
          deployClose();
        },
      });
      return new Response(deployStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    // ── Cloud ops from chat (Lovable parity: pause / resize with approval
    // card). Zero AI cost, zero credits: detect the intent, emit an approval
    // card over SSE, and let the panel call the Cloud APIs after the user
    // approves. Nothing executes without the click.
    if (mode === "chat" || mode === "build") {
      const cloudIntent = detectCloudIntent(persistedUserMessage);
      if (cloudIntent) {
        const { data: cloudProject } = await (supabase as any)
          .from("projects")
          .select("cloud_enabled, cloud_status, cloud_instance")
          .eq("id", projectId)
          .single();
        if (cloudProject?.cloud_enabled) {
          const encoder2 = new TextEncoder();
          const cardStream = new ReadableStream({
            async start(controller) {
              const { safeEnqueue, safeClose } = createStreamSink(controller, encoder2, req.signal);
              const send = (payload: Record<string, unknown>) =>
                safeEnqueue(encoder2.encode(`data: ${JSON.stringify(payload)}\n\n`));

              const tier = (cloudProject.cloud_instance as string | null) ?? "tiny";
              const paused = cloudProject.cloud_status === "paused";
              const assistantContent =
                cloudIntent.kind === "resize"
                  ? `I can resize your Cloud compute instance (currently **${tier}**). Pick a size below and approve — the resize takes a few minutes, during which the backend is briefly unavailable. A larger instance handles more traffic but increases Cloud usage.`
                  : cloudIntent.kind === "pause"
                    ? paused
                      ? `Your Cloud backend is already paused. Use the card below if you want to wake it up.`
                      : `I can pause your Cloud backend (database, auth, storage, functions) so it stops using compute credits. Your data is preserved and you can wake it any time — but the live app stops working while paused. Approve below to pause.`
                    : paused
                      ? `Approve below to wake your Cloud backend up — it'll be back online in a few minutes.`
                      : `Your Cloud backend is already active — nothing to resume.`;

              let assistantMessageId: string | undefined;
              try {
                const persisted = await persistChatTurnMessages(
                  supabase,
                  [
                    { project_id: projectId, role: "user", content: persistedUserMessage, mode },
                    {
                      project_id: projectId,
                      role: "assistant",
                      content: assistantContent,
                      tokens_used: 0,
                      mode,
                      metadata: { credits_used: 0, cloud_action: cloudIntent.kind },
                    },
                  ],
                  { projectId, label: "cloud-turn" },
                );
                assistantMessageId = persisted.assistantMessageId;
              } catch { /* best-effort */ }

              send({ chunk: assistantContent });
              send({
                cloud_action: {
                  kind: paused && cloudIntent.kind !== "resize" ? "resume" : cloudIntent.kind,
                  currentTier: tier,
                  paused,
                  actionable:
                    cloudIntent.kind === "resize" ||
                    (cloudIntent.kind === "pause" && !paused) ||
                    (cloudIntent.kind === "resume" && paused),
                },
              });
              send({
                done: true, tokensUsed: 0, creditsUsed: 0, fileCount: 0,
                assistantMessageId, displayMessage: assistantContent,
              });
              safeClose();
            },
          });
          return new Response(cardStream, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
          });
        }
      }
    }

    // Check credits (dev: auto-grant if empty so local builds are testable)
    await ensureDevCredits(userId);
    await claimDailyCredits(supabase, userId);

    let profile = (
      await (supabase as any)
        .from("profiles")
        .select("credits, plan, email, workspace_knowledge")
        .eq("id", userId)
        .maybeSingle()
    ).data;

    // Dev fallback: user-scoped client may not see profile row (RLS / missing sync)
    if ((!profile || profile.credits <= 0) && process.env.NODE_ENV === "development") {
      profile = await getDevProfile(userId);
    }

    if (!profile || profile.credits <= 0) {
      return Response.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const cloudPermissionsRaw = (
      await (supabase as any)
        .from("profiles")
        .select("cloud_tool_permissions")
        .eq("id", userId)
        .maybeSingle()
    ).data?.cloud_tool_permissions;

    // Fetch project knowledge, private conversation context, recent messages,
    // and DB schema in parallel.
    const [
      projectRes,
      recentMessagesRes,
      privateContextRes,
      schemaContext,
      editorIntelligenceContext,
    ] = await Promise.all([
      // select("*") — NOT an explicit column list: cloud_* columns arrive with
      // migration 064 and an explicit list would make this query fail (and
      // degrade chat) on databases that haven't run it yet.
      (supabase as any).from("projects").select("*").eq("id", projectId).single(),
      (supabase as any).from("messages").select("role, content, mode, metadata").eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(40),
      (supabase as any)
        .from("project_private_context")
        .select("context_summary, context_summary_at, context_summary_covers")
        .eq("project_id", projectId)
        .maybeSingle(),
      // Schema reading is best-effort — never blocks the response
      getProjectSchemaContext(projectSupabaseUrl, projectServiceKey).catch(() => ""),
      buildEditorIntelligencePromptBlock(supabase, projectId).catch(() => ""),
    ]);

    // Cloud-managed backend (migration 064): when the project has a dedicated
    // Supabase backend and the client didn't supply integration credentials,
    // read the schema context from the managed backend server-side.
    let cloudSchemaContext = schemaContext;
    const cloudProject = projectRes.data as { cloud_supabase_url?: string | null } | null;
    if (!cloudSchemaContext && cloudProject?.cloud_supabase_url) {
      try {
        const admin = await createAdminClient();
        const { data: managedCredentials } = await (admin as any)
          .from("project_cloud_credentials")
          .select("service_key")
          .eq("project_id", projectId)
          .maybeSingle();
        if (managedCredentials?.service_key) {
          cloudSchemaContext = await getProjectSchemaContext(
            cloudProject.cloud_supabase_url,
            managedCredentials.service_key,
          ).catch(() => "");
        }
      } catch {
        // Managed schema context is best-effort and secrets remain server-only.
      }
    }

    // Test/Live environments (migration 046): when the project is Live, block
    // code-writing modes so production isn't changed accidentally (Lovable
    // behaviour). Read-only chat/plan conversations stay allowed.
    const projectEnvironment = (projectRes.data as { environment?: string } | null)?.environment;
    if (projectEnvironment === "live" && mode !== "chat" && mode !== "plan") {
      return Response.json(
        {
          error: "This project is in the Live environment. Switch to Test to make changes, then publish them to Live.",
          environment_locked: true,
        },
        { status: 423 }
      );
    }

    type MessageRow = { role: string; content: string; mode?: string; metadata?: Record<string, unknown> | null };
    const rawHistory = ((recentMessagesRes.data ?? []) as MessageRow[]).reverse();
    const history = rawHistory.map((m) => ({ role: m.role, content: m.content }));

    // Build a compact "file changes" context block from recent build-mode assistant turns.
    // Each build turn stores the list of generated file paths in its metadata.
    // We inject this so the AI always knows which files were created/modified in prior turns.
    const buildTurns = rawHistory.filter(
      (m) => m.role === "assistant" && m.mode === "build" && Array.isArray((m.metadata as Record<string, unknown> | null)?.files_changed)
    );
    const fileChangeLines = buildTurns.slice(-10).map((m, i) => {
      const paths = ((m.metadata as Record<string, unknown>)?.files_changed as string[]) ?? [];
      return `Turn ${i + 1}: ${paths.join(", ")}`;
    });
    const fileChangesBlock = fileChangeLines.length > 0
      ? `\n\n---\n# Files Changed in Recent Build Turns\n${fileChangeLines.join("\n")}\n---`
      : "";

    // Build knowledge context — project-level instructions set by the user
    const projectData = projectRes.data as {
      knowledge?: string | null;
      name?: string;
      disabled_skill_ids?: string[] | null;
      cloud_enabled?: boolean;
      github_repo?: string | null;
    } | null;
    const projectKnowledge = projectData?.knowledge?.trim();
    const knowledgeBlock = projectKnowledge
      ? `\n\n---\n# Project Instructions (always follow these)\n${projectKnowledge}\n---`
      : "";

    // Workspace-level knowledge — applies to all projects for this user
    const workspaceKnowledge = (profile as { workspace_knowledge?: string | null }).workspace_knowledge?.trim();
    const workspaceKnowledgeBlock = workspaceKnowledge
      ? `\n\n---\n# Workspace Standards (apply to all projects)\n${workspaceKnowledge}\n---`
      : "";

    // Context summary — injected when long conversations have been compressed
    const privateContext = privateContextRes.data as {
      context_summary?: string | null;
      context_summary_at?: string | null;
      context_summary_covers?: number | null;
    } | null;
    const contextSummary = privateContext?.context_summary ?? undefined;
    const summaryCovers = privateContext?.context_summary_covers ?? undefined;
    const summaryBlock = contextSummary
      ? `\n\n---\n# Conversation History Summary (covers the ${summaryCovers ?? "earlier"} messages before this context window)\n${contextSummary}\n---`
      : "";

    // Compact schema block — injected into all modes when available
    const schemaBlock = cloudSchemaContext ? `\n\n---\n${cloudSchemaContext}\n---` : "";

    const cloudPermissions = parseCloudToolPermissions(cloudPermissionsRaw);
    const cloudEnabled = !!projectData?.cloud_enabled;
    const cloudPermissionsBlock = `\n\n${buildCloudPermissionsPromptBlock(cloudPermissions, cloudEnabled)}`;

    const cloudBlockCheck = shouldBlockCloudAction(message, cloudPermissions);
    if (cloudBlockCheck.blocked && cloudBlockCheck.reason) {
      const blockText = cloudBlockCheck.reason;
      const blockEncoder = new TextEncoder();
      const blockStream = new ReadableStream({
        async start(controller) {
          const { safeEnqueue: blockEnqueue, safeClose: blockClose } = createStreamSink(
            controller,
            blockEncoder,
            req.signal,
          );
          blockEnqueue(
            blockEncoder.encode(`data: ${JSON.stringify({ chunk: blockText })}\n\n`),
          );
          blockEnqueue(
            blockEncoder.encode(
              `data: ${JSON.stringify({ done: true, tokensUsed: 0, creditsUsed: 0, cloud_blocked: true, tool: cloudBlockCheck.tool })}\n\n`,
            ),
          );
          blockClose();
        },
      });
      await persistChatTurnMessages(
        supabase,
        [
          { project_id: projectId, role: "user", content: persistedUserMessage, mode },
          { project_id: projectId, role: "assistant", content: blockText, mode },
        ],
        { projectId, label: "cloud-block" },
      );
      return new Response(blockStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    const fileCount = Array.isArray(files) ? files.length : 0;
    const serverAutoModel = modelManuallySelected === true
      ? model
      : resolveSmartModel(mode, { fileCount, hasPreviewError: false }, costPrompt);
    const effectiveModel = resolveBudgetAwareModel({
      requestedModel: serverAutoModel,
      mode,
      prompt: costPrompt,
      fileCount,
      manuallySelected: modelManuallySelected === true,
      hasImage: !!imageBase64,
    });
    const outputMaxTokens = maxOutputTokensForRequest({
      mode,
      prompt: costPrompt,
      fileCount,
      defaultBuildMax: BUILD_MAX_TOKENS,
      defaultChatMax: CHAT_MAX_TOKENS,
      hasImage: !!imageBase64,
    });
    const simpleEconomyRequest = isSimpleEditorRequest({
      mode,
      prompt: costPrompt,
      fileCount,
      hasImage: !!imageBase64,
    });

    // Build system prompt based on mode + framework
    // Chat/plan modes get full codebase context (up to 60k chars); build mode embeds up to 80k.
    let systemPrompt: string;
    if (mode === "build") {
      // Route to the right generator based on target framework
      const suffix = schemaBlock + summaryBlock + fileChangesBlock + editorIntelligenceContext + workspaceKnowledgeBlock + knowledgeBlock;
      // Intelligent file selection ("hydration"): give the builder only the files
      // relevant to this request instead of the whole project — cuts token cost
      // (a full-project turn can be ~157k tokens ≈ $2) and improves output quality.
      // Small projects / small total context pass through unchanged; on any error
      // it falls back to all files, so this can never fail the build.
      let contextFiles = files;
      try {
        contextFiles = await selectRelevantFiles({
          prompt: message,
          files: files as Array<{ path: string; content: string }>,
          activeFile: null,
        });
      } catch {
        contextFiles = files;
      }

      const buildContextBudget = contextBudgetForRequest({
        mode,
        prompt: costPrompt,
        fileCount: Array.isArray(contextFiles) ? contextFiles.length : 0,
        defaultBudget: 80000,
        hasImage: !!imageBase64,
      });
      if (framework === "react-native") {
        systemPrompt = buildReactNativePrompt(message, contextFiles, buildContextBudget) + suffix;
      } else if (framework === "nextjs" || framework === "next") {
        // SSR-first Next.js App Router — proper generateMetadata, Server Components.
        // Projects store "next" (FRAMEWORKS picker) while GitHub import detection
        // returns "nextjs" — accept both.
        systemPrompt = buildNextJSPrompt(message, contextFiles, buildContextBudget) + suffix;
      } else {
        // Pass the framework so the prompt ships ONE contract — the TanStack
        // blueprint for tanstack-start, the Vite rules for react/vue/svelte.
        systemPrompt =
          buildGenerationPrompt(message, contextFiles, buildContextBudget, framework) + suffix;
      }
      if (simpleEconomyRequest) {
        systemPrompt += `\n\n---\n# Economy Small Edit Mode\nThis is a small edit/debug turn on an existing project. Keep the response minimal:\n- Return ONLY files that must change.\n- Prefer surgical changes over rewriting whole files.\n- Do not regenerate the whole app, create new pages, restyle unrelated UI, or expand product scope.\n- Keep existing imports, data, assets, and routes unless the user explicitly asked to change them.\n---`;
      }
      // Anchor to a designer template baseline when one was chosen; otherwise
      // pick a distinct, polished design direction from the prompt. Apply it on
      // the FIRST build, OR on a later build when the user explicitly asks to
      // change the look/template (so "restyle / change the template" actually works).
      const isRestyleRequest =
        /(re-?style|re-?design|change\s+(the\s+)?(theme|template|design|look|colou?rs?|style)|update\s+(the\s+)?(website\s+)?(theme|template|design|look|style)|new\s+(theme|template|design|look|style)|different\s+(theme|template|design|look)|make\s+it\s+(dark|light|modern|minimal|colou?rful|cleaner))/i.test(
          message,
        );
      // Template precedence (Lovable-style):
      //  1. an explicitly chosen template always wins;
      //  2. otherwise, on a first build, auto-detect the niche from the prompt
      //     ("ecommerce store like Shopify" → storefront baseline);
      //  3. if no niche matches (or it's a restyle), fall back to a design direction.
      const autoTemplateId =
        templateId ?? (files.length === 0 ? pickStarterTemplate(message) : null);
      if (autoTemplateId) {
        systemPrompt += buildTemplateRefinementBlock(autoTemplateId);
      } else if (files.length === 0 || isRestyleRequest) {
        systemPrompt += buildDesignDirectionBlock(message);
      }

      // ── Incremental edit safety (Lovable-style preservation) ────────────────
      // On a follow-up build (project already has files), this is an EDIT, not a
      // from-scratch rebuild. Without this, a full regeneration silently drops
      // prior work — most painfully replacing real image URLs with placeholder
      // icons. Instruct the model to preserve everything it isn't asked to change.
      if (files.length > 0) {
        systemPrompt +=
          `\n\n---\n# INCREMENTAL EDIT — return ONLY the files you change (unchanged files are auto-preserved)\n` +
          `This is an edit to an EXISTING app, not a rebuild. Files are saved by PATH (merge/upsert), so any file you do NOT return is kept exactly as it is. Strict rules:\n` +
          `- Return ONLY the files you actually change. NEVER re-emit unchanged files (data, config, utils, hooks, routes, or components you aren't touching) — echoing them back wastes time and changes nothing. This is the #1 rule.\n` +
          `- PRESERVE every real asset URL already in the project (img src, background-image, logos, og images, any https image URL). NEVER swap a real image for a placeholder, emoji, icon-font glyph, gradient, or solid color.\n` +
          `- Keep existing copy, data, routes, and component structure unless the request specifically requires changing them.\n` +
          `- If the request is a RESTYLE / redesign: change the CENTRAL theme FIRST — the CSS variables / design tokens in the global stylesheet and the Tailwind theme config — so the new look propagates everywhere with the fewest file rewrites. Then rewrite ONLY the specific components whose markup or utility classes must actually change. Keep the SAME content and the SAME real images. Do not re-emit components that don't visually change.\n` +
          `---`;

        // ── Asset manifest ────────────────────────────────────────────────────
        // BM25 context selection can rank an asset-bearing file out of the 80k
        // budget on a big app, so the model never sees the real image URLs and
        // regenerates that file with icons. Extract every real asset URL and pin
        // it into the prompt (URLs only — tiny) so they survive regardless of
        // which files made it into context.
        const assetRe =
          /https?:\/\/[^\s"'`)]+?(?:\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?[^\s"'`)]*)?|\/storage\/v1\/object\/public\/[^\s"'`)]+)/gi;
        const assetMap = new Map<string, Set<string>>();
        for (const f of files as Array<{ path: string; content: string }>) {
          const found = (f.content || "").match(assetRe);
          if (found && found.length) {
            const set = assetMap.get(f.path) ?? new Set<string>();
            found.forEach((u) => set.add(u));
            assetMap.set(f.path, set);
          }
        }
        if (assetMap.size > 0) {
          let manifest =
            `\n\n---\n# EXISTING ASSETS — keep these EXACT URLs\n` +
            `These real asset URLs already exist in the project. If you output any of these files, the listed URLs MUST stay exactly as-is. Never replace them with placeholders, icons, emoji, or different URLs.\n`;
          let count = 0;
          for (const [p, urls] of assetMap) {
            manifest += `- ${p}:\n`;
            for (const u of urls) {
              if (count++ >= 60) break;
              manifest += `    ${u}\n`;
            }
            if (count >= 60) break;
          }
          manifest += `---`;
          systemPrompt += manifest;
        }
      }
    } else if (mode === "patch") {
      // Patch mode: inject full codebase (40k budget) so AI can write precise find strings
      systemPrompt = PATCH_SYSTEM_PROMPT + editorIntelligenceContext + workspaceKnowledgeBlock + knowledgeBlock;
      const patchContext = buildProjectContext(
        files,
        contextBudgetForRequest({
          mode,
          prompt: costPrompt,
          fileCount: Array.isArray(files) ? files.length : 0,
          defaultBudget: 40000,
          hasImage: !!imageBase64,
        }),
        message,
      );
      if (patchContext) systemPrompt += `\n\n${patchContext}`;
      // Menu/header edits: pin the real nav source files so the model cannot
      // invent header.html or return {"patches":[]}.
      systemPrompt += buildNavEditContext(
        files as Array<{ path: string; content: string }>,
        costPrompt,
      );
      systemPrompt += schemaBlock;
    } else if (mode === "plan") {
      systemPrompt = PLAN_SYSTEM_PROMPT + summaryBlock + fileChangesBlock + editorIntelligenceContext + workspaceKnowledgeBlock + knowledgeBlock;
      // Inject a compact codebase snapshot for plan mode so AI knows what already exists
      const planContext = buildProjectContext(
        files,
        contextBudgetForRequest({
          mode,
          prompt: costPrompt,
          fileCount: Array.isArray(files) ? files.length : 0,
          defaultBudget: 30000,
          hasImage: !!imageBase64,
        }),
        message,
      );
      if (planContext) systemPrompt += `\n\n${planContext}`;
      systemPrompt += schemaBlock;
    } else {
      systemPrompt = CHAT_SYSTEM_PROMPT;
      // Full codebase injection for chat mode — 60k char budget; BM25-rank by user message
      const projectContext = buildProjectContext(
        files,
        contextBudgetForRequest({
          mode,
          prompt: costPrompt,
          fileCount: Array.isArray(files) ? files.length : 0,
          defaultBudget: 60000,
          hasImage: !!imageBase64,
        }),
        message,
      );
      if (projectContext) systemPrompt += `\n\n${projectContext}`;
      systemPrompt += schemaBlock + summaryBlock + fileChangesBlock + editorIntelligenceContext + workspaceKnowledgeBlock + knowledgeBlock;
    }

    systemPrompt += cloudPermissionsBlock;

    // Connected backend — teach the AI to use the wired Supabase backend
    // instead of inventing its own setup (Lovable Cloud parity).
    const backendCreds = projectRes.data as {
      cloud_enabled?: boolean;
      cloud_supabase_url?: string | null;
      cloud_anon_key?: string | null;
    } | null;
    if (backendCreds?.cloud_enabled) {
      const credsReady = !!(backendCreds.cloud_supabase_url && backendCreds.cloud_anon_key);
      systemPrompt += `\n\n---\n# Connected Backend (Lifemark Cloud)\nThis project has a managed Supabase backend${credsReady ? ` at ${backendCreds.cloud_supabase_url}` : " (still provisioning — credentials connect automatically)"}.\nRules:\n- Use the shared client: \`import { supabase } from "./lib/supabase"\` (src/lib/supabase.ts — auto-scaffolded; never create another client or hardcode keys).\n- Credentials live in .env.local as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — already configured, do not ask the user for them.\n- Auth: use supabase.auth (signUp, signInWithPassword, signOut, onAuthStateChange).\n- Database schema changes: write SQL files at supabase/migrations/NNN_description.sql — they are applied to the backend automatically after the build.\n- Always enable RLS on new tables and add owner-scoped policies.\n- Storage (file/image/avatar uploads): use supabase.storage — create the bucket in a migration, upload via supabase.storage.from(bucket).upload(...), and store the returned public URL.\n- Serverless logic + secrets (webhooks, third-party API calls, payments): write Supabase Edge Functions at supabase/functions/<name>/index.ts and call them with supabase.functions.invoke('<name>') — NEVER put secret keys in client code.\n- Realtime (live updates, presence, chat): subscribe via supabase.channel(...).on('postgres_changes', { event:'*', schema:'public', table:'<t>' }, cb).subscribe().\n---`;
    }

    // NOTE: there used to be an "MCP context" injection here that appended a
    // block headed `# Live MCP Context` whenever the project's .env.local
    // contained keys like LINEAR_API_KEY / NEXT_PUBLIC_SENTRY_DSN /
    // NEXT_PUBLIC_SUPABASE_URL. Every one of those blocks was HARDCODED DEMO
    // DATA — fake Linear tickets ("[ENG-142] Redesign onboarding flow"), a fake
    // Sentry stack trace, and, worst, LifemarkAI's OWN database table list
    // presented to the model as the user's schema. Since NEXT_PUBLIC_SUPABASE_URL
    // is present in essentially every backend-enabled project, most builds were
    // being handed fiction labelled as live fact. Removed — do not reintroduce
    // this unless it fetches REAL data from the connected MCP server.
    let envFileContent =
      (files as Array<{ path: string; content: string }>).find(
        (f) => f.path === ENV_FILE_PATH || f.path.endsWith(`/${ENV_FILE_PATH}`),
      )?.content ?? "";
    if (!envFileContent) {
      const { data: envRow } = await (supabase as any)
        .from("project_files")
        .select("content")
        .eq("project_id", projectId)
        .eq("path", ENV_FILE_PATH)
        .maybeSingle();
      envFileContent = envRow?.content ?? "";
    }
    if (envFileContent) {
      const envKeys = Object.keys(parseEnvFile(envFileContent));

      // Connector gateway — when connector credentials are configured, teach
      // the AI to route third-party API calls through the gateway so secrets
      // never reach client code (Lovable-parity connector gateway).
      const CONNECTOR_ENV_KEYS: Record<string, string> = {
        SLACK_BOT_TOKEN: "slack", RESEND_API_KEY: "resend", NOTION_API_KEY: "notion",
        HUBSPOT_ACCESS_TOKEN: "hubspot", LINEAR_API_KEY: "linear", ASANA_ACCESS_TOKEN: "asana",
        ELEVENLABS_API_KEY: "elevenlabs", FIRECRAWL_API_KEY: "firecrawl", PERPLEXITY_API_KEY: "perplexity",
        AIRTABLE_API_KEY: "airtable", TWILIO_ACCOUNT_SID: "twilio", MAILGUN_API_KEY: "mailgun",
        TELEGRAM_BOT_TOKEN: "telegram", STRIPE_SECRET_KEY: "stripe",
      };
      const configuredConnectors = [...new Set(envKeys.map((k) => CONNECTOR_ENV_KEYS[k]).filter(Boolean))];
      if (configuredConnectors.length > 0) {
        systemPrompt += `\n\n---\n# Connector Gateway\nConnectors configured for this project: ${configuredConnectors.join(", ")}.\nWhen the app calls these third-party APIs, NEVER put API keys in client code. Route calls through the gateway instead:\n  POST ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/projects/${projectId}/connector-proxy\n  body: { "connector": "${configuredConnectors[0]}", "path": "/<api-path>", "method": "POST", "body": { ... } }\nThe gateway injects credentials server-side and forwards to the connector's official API host.\n---`;
      }
    }

    // @connector:<id> mentions (Lovable parity: reference a connector in chat)
    // — steer the AI toward the referenced connector explicitly.
    {
      const connectorMentions = [...new Set(
        [...(message ?? "").matchAll(/@connector:([\w-]+)/g)].map((m) => m[1]),
      )];
      if (connectorMentions.length > 0) {
        systemPrompt += `\n\n---\n# Referenced Connectors\nThe user explicitly referenced these app connectors: ${connectorMentions.join(", ")}.\nBuild the requested functionality against them. All API calls MUST go through the project's connector gateway (POST /api/projects/${projectId}/connector-proxy with { "connector": "<id>", "path": "...", "method": "...", "body": ... }) — never embed credentials in app code. If the connector's credentials are not configured yet, still write the integration against the gateway and tell the user to add the key in the Connectors panel.\n---`;
      }
    }

    // Reference pages (Build-with-URL html= links): fetch the user-provided
    // public pages server-side and inject readable text as layout/content
    // reference (Lovable parity, Jun 16 2026).
    if (message?.includes("Reference pages:")) {
      try {
        const { buildPageReferenceBlock } = await import("@/lib/ai/page-reference");
        const pageBlock = await buildPageReferenceBlock(message);
        if (pageBlock) systemPrompt += pageBlock;
      } catch { /* reference fetching is best-effort */ }
    }

    // ── Design Systems: inject .lovable/system.md + rules from connected DS ───
    try {
      const { data: dsLinks } = await (supabase as any)
        .from("project_design_systems")
        .select("source_project_id, priority, enabled")
        .eq("consumer_project_id", projectId)
        .eq("enabled", true)
        .order("priority", { ascending: true });
      const sourceIds = (dsLinks ?? []).map((l: any) => l.source_project_id);
      if (sourceIds.length > 0) {
        const { data: dsFiles } = await (supabase as any)
          .from("project_files")
          .select("project_id, path, content")
          .in("project_id", sourceIds)
          .like("path", ".lovable/%");
        if (dsFiles && dsFiles.length > 0) {
          // Concatenate per source, system.md first then rules/*
          const byProject = new Map<string, Array<{ path: string; content: string }>>();
          for (const f of dsFiles) {
            const arr = byProject.get(f.project_id) ?? [];
            arr.push(f);
            byProject.set(f.project_id, arr);
          }
          const dsBlocks: string[] = [];
          for (const link of (dsLinks ?? [])) {
            const files = byProject.get(link.source_project_id) ?? [];
            files.sort((a, b) => {
              if (a.path.endsWith("/system.md")) return -1;
              if (b.path.endsWith("/system.md")) return 1;
              return a.path.localeCompare(b.path);
            });
            for (const f of files) {
              dsBlocks.push(`### ${f.path}\n${(f.content ?? "").slice(0, 4000)}`);
            }
          }
          if (dsBlocks.length > 0) {
            systemPrompt += `\n\n---\n# Connected Design Systems (highest priority first)\n${dsBlocks.join("\n\n")}\n---`;
          }
        }
      }
    } catch (err) {
      // Don't fail chat on design-system fetch errors
    }

    // ── Auto-attached skills (Lovable-style description match) ────────────
    // Score every enabled workspace skill against the user's message; attach
    // up to 2 with score >= 0.18 so users don't have to type the exact /name.
    // We don't fail the chat if the load errors — skills are an enhancement,
    // not a requirement.
    let attachedSkills: SkillMatch[] = [];
    try {
      const { block, matches } = await attachSkillsToPrompt(
        supabase,
        userId,
        message,
        Array.isArray(projectData?.disabled_skill_ids) ? projectData!.disabled_skill_ids! : [],
      );
      attachedSkills = matches;
      if (block) systemPrompt += block;
    } catch {
      // Non-fatal
    }

    // ── Design consistency + project memory (Lovable-agent parity) ────────
    // Incremental builds see the project's REAL design system (tokens, fonts,
    // ui kit) and the recent decision log, so edits stay visually coherent and
    // earlier requests don't get silently undone.
    if ((mode === "build" || mode === "patch") && Array.isArray(files) && files.length > 8) {
      try {
        const { buildDesignSystemBlock, buildDecisionLogBlock } = await import("@/lib/ai/design-system-context");
        const dsBlock = buildDesignSystemBlock(files);
        if (dsBlock) systemPrompt += `\n\n${dsBlock}`;
        const decisions = (projectRes.data as { metadata?: { decision_log?: unknown } } | null)?.metadata?.decision_log;
        const dlBlock = buildDecisionLogBlock(decisions);
        if (dlBlock) systemPrompt += `\n\n${dlBlock}`;
      } catch { /* non-fatal */ }

      // Own-builds tuning flywheel: recurring failure classes from this
      // project's health findings become prevention rules in the prompt.
      try {
        const { buildLearnedRulesBlock } = await import("@/lib/ai/learned-rules");
        const { data: findings } = await (supabase as any)
          .from("health_findings")
          .select("title, detail")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(30);
        const lrBlock = buildLearnedRulesBlock(Array.isArray(findings) ? findings : []);
        if (lrBlock) systemPrompt += `\n\n${lrBlock}`;
      } catch { /* table may not exist yet — non-fatal */ }
    }

    // ── Live preview console context (Lovable-agent parity) ───────────────
    // The client sends the CURRENT preview runtime errors with every message,
    // so the AI knows the app's actual state before answering or editing —
    // not only inside explicit "Try to fix" flows.
    const previewErrors = Array.isArray(body.previewErrors) ? body.previewErrors.slice(0, 5) : [];
    if (previewErrors.length > 0) {
      const lines = previewErrors
        .map((e: { kind?: string; message?: string; filename?: string; lineno?: number }, i: number) => {
          const loc = e.filename ? ` (${e.filename}${typeof e.lineno === "number" ? `:${e.lineno}` : ""})` : "";
          return `${i + 1}. [${e.kind ?? "runtime"}] ${String(e.message ?? "").slice(0, 400)}${loc}`;
        })
        .join("\n");
      systemPrompt += `

---
# Current Preview Console Errors

The running preview currently reports these errors. Factor them into your answer.
If the user's request is unrelated, do NOT silently fix them — mention them briefly
and offer to fix. If the request IS about broken behavior, treat these as the
primary evidence and fix the root cause:

${lines}
---`;
    }

    // ── Role-isolation guardrail ───────────────────────────────────────────
    // If the user mentions a role (Admin, User, Investor, etc.) and asks for a
    // role-specific change, remind the AI to isolate logic to that role and not
    // mutate shared components unless clearly scoped. Mirrors Lovable's
    // best-practice 2: "always define which role the prompt applies to".
    const ROLE_PATTERN = /\b(admin|administrator|user|investor|startup|manager|owner|editor|viewer|guest|moderator|customer|seller|buyer|agent|reviewer|approver)s?\b/i;
    const mentionsRole = typeof message === "string" && ROLE_PATTERN.test(message);
    if (mentionsRole) {
      systemPrompt += `

---
# Role-Isolation Reminder

The user appears to be working on role-specific behavior. Apply these rules:
1. If a role is named, isolate the new logic/component to that role only.
2. Do NOT modify shared layouts, shared components, or shared route handlers unless explicitly told.
3. Prefer creating role-specific components over conditionally branching shared ones.
4. If the change WOULD require touching shared code, state this explicitly and ask before proceeding.
5. After your implementation summary, list which other roles could be affected and what to re-test.
---`;
    }

    // ── Frustration-aware nudge ────────────────────────────────────────────
    // If the user's message contains a frustrated tone or the "I am frustrated…"
    // pattern Lovable's best-practice guide recommends, we tell the AI to slow
    // down, focus on root-cause analysis, and avoid breaking unrelated code.
    const lowerMessage = (typeof message === "string" ? message : "").toLowerCase();
    const FRUSTRATION_MARKERS = [
      "i am frustrated", "i'm frustrated", "im frustrated", "this is frustrating",
      "you keep breaking", "still broken", "stop breaking", "fed up",
      "this isn't working", "this is not working", "doesn't work",
      "wtf", "ffs", "annoying", "useless", "again??", "again ??",
    ];
    const isFrustrated = FRUSTRATION_MARKERS.some((m) => lowerMessage.includes(m));
    if (isFrustrated) {
      systemPrompt += `

---
# IMPORTANT: User Tone Detected — Frustration

The user has expressed frustration. Do the following:
1. Acknowledge the issue briefly (one short sentence) without grovelling.
2. SLOW DOWN. Do not rush to patch.
3. Identify the ROOT CAUSE before proposing any change. State your hypothesis explicitly.
4. Do NOT touch unrelated files or features. Constrain the blast radius.
5. If the same fix has been attempted before and failed, recommend reverting to the last working version and proposing a different approach.
6. If the request is ambiguous, ask ONE clarifying question rather than guessing.
---`;
    }

    // Enrich build-mode user message with autonomous directive (models read this reliably)
    let buildIntent: import("@/lib/ai/build-intent").BuildIntent | null = null;
    let userMessage = message;
    if (mode === "build") {
      const { classifyBuildIntent, buildUserDirective } = await import("@/lib/ai/build-intent");
      buildIntent = classifyBuildIntent(message);
      userMessage = `${message}\n\n${buildUserDirective(buildIntent)}`;
      // Style seeding: when the user picked no design direction (skipped or
      // never saw the 3-preview picker) and expressed no style themselves,
      // inject a deterministic per-project archetype so every app gets a
      // distinct look instead of the model's default dark template. New
      // builds only — incremental edits must keep the existing design.
      if (files.length <= 8) {
        try {
          const { buildAutoStyleBrief } = await import("@/lib/ai/design-previews");
          const autoStyle = buildAutoStyleBrief(message, projectId);
          if (autoStyle) userMessage += `\n\n${autoStyle}`;
        } catch { /* non-fatal */ }
      }
    }

    // ── Subagents: read-only parallel investigation (Lovable-style) ─────────
    let subagentSteps: SubagentStep[] = [];
    if (shouldUseSubagents(message, mode, files.length)) {
      // Real parallel read-only investigators when enabled (default on): three
      // concurrent fast-tier calls, hard-capped, each given one question and its
      // own file slice. Costs a fraction of a cent per build, which is why it can
      // be on without moving the economy posture.
      //
      // Falls back to the deterministic keyword scan whenever the fan-out is
      // disabled or every agent fails. The scan is what shipped before this and is
      // still a reasonable answer — a build must not degrade because an optional
      // investigation did.
      let usedParallel = false;
      if (parallelSubagentsEnabled()) {
        try {
          const assignments = planSubagents(message, files, rankFilesByKeywords);
          if (assignments.length > 0) {
            const fanout = await runParallelSubagents(
              assignments,
              { projectId, userId },
              (step) => {
                safeEnqueue(
                  encoder.encode(`data: ${JSON.stringify({ subagent: step })}\n\n`),
                );
              },
            );
            logger.info("ai.chat.subagents_parallel", {
              projectId,
              agents: fanout.outcomes.length,
              succeeded: fanout.outcomes.filter((o) => o.ok).length,
              ms: Math.max(0, ...fanout.outcomes.map((o) => o.ms)),
            });
            if (fanout.anySucceeded) {
              subagentSteps = fanout.steps;
              systemPrompt += `\n\n${fanout.contextBlock}`;
              usedParallel = true;
            }
          }
        } catch (fanoutErr) {
          logger.warn("ai.chat.subagents_parallel_failed", {
            projectId,
            error: String(fanoutErr),
          });
        }
      }

      if (!usedParallel) {
        const investigation = runSubagentInvestigation(message, files);
        subagentSteps = investigation.steps;
        if (investigation.contextBlock) systemPrompt += investigation.contextBlock;
      }
    }

    // Build messages array — support image attachments (vision)
    const userContent = imageBase64
      ? [
          { type: "text" as const, text: userMessage },
          { type: "image_url" as const, image_url: { url: imageBase64 } },
        ]
      : userMessage;

    // Model-aware prompting: tune the system prompt to the selected model
    // (fast → minimal change, frontier → plan+verify, non-Claude → strict contract).
    systemPrompt = applyModelAdapter(systemPrompt, effectiveModel);

    const messages: import("@/lib/ai/provider").AIMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: userContent as string },
    ];

    // ── Clarify-first mode: ask AI for clarifying questions before building ──────
    if (mode === "build" && clarifyFirst) {
      const clarifyReservation = await reserveCredits(supabase, {
        userId,
        amount: maxCreditCostForMode("chat"),
        action: "clarify_message",
        projectId,
      });
      if (!clarifyReservation) {
        return Response.json(
          { error: "Insufficient credits", requiredCredits: maxCreditCostForMode("chat") },
          { status: 402 },
        );
      }

      const clarifySystemPrompt = [
        "You are an expert product designer + software architect asking a user a few quick questions before building, exactly like Lovable's pre-build questionnaire.",
        "Given a user's build request, generate 2-4 targeted questions. Prefer CHOICE questions with 3-4 concrete options.",
        'Return ONLY a JSON array of question objects, no prose, no code fences.',
        'Each object: id (string), question (string), type ("text"|"choice"), kind ("palette"|"typography"|"layout"|"structure"|"database"|"general"), options (string[] for choice).',
        "For NEW WEBSITE/APP builds ask design questions: one palette question (kind palette — each option is a named palette followed by 2-3 hex codes in parentheses, e.g. \"Cherry Blossom (#F8C8DC, #B03052)\"), one typography pairing question (kind typography, e.g. \"Outfit + Figtree\"), and one homepage layout structure question (kind layout, options like \"Hero + feature grid\", \"Full-width banner + columns\", \"Magazine\", \"Split rows\").",
        "For DATABASE/BACKEND requests (schema, tables, auth, user accounts, admin, CRUD) ask kind database questions instead: which entities/tables, auth method (email / OAuth / both), roles & permissions, public vs private data.",
        "Keep every question short and answerable in one tap.",
        "Respond ONLY with a valid JSON array.",
      ].join("\n");

      const clarifyEncoder = new TextEncoder();
      const clarifyStream = new ReadableStream({
        async start(controller) {
          const { safeEnqueue: clarifyEnqueue, safeClose: clarifyClose } = createStreamSink(
            controller,
            clarifyEncoder,
            req.signal,
          );
          let questionsJson = "";
          let reservationFinalized = false;
          try {
            const clarifyResult = await generateAI(
              {
                model: effectiveModel,
                messages: [
                  { role: "system", content: clarifySystemPrompt },
                  { role: "user", content: "Build request: " + persistedUserMessage + "\n\nProject has " + files.length + " existing files." },
                ],
                maxTokens: 600,
                stream: true,
                jsonMode: true,
                onChunk: (chunk) => { questionsJson += chunk; },
              },
              { projectId, userId, task: "chat.clarify" },
            );

            const clarifyCost = computeCreditCost({
              mode: "chat",
              tokensUsed: clarifyResult.tokensUsed,
            });
            const remaining = await settleCreditReservation(
              supabase,
              clarifyReservation.id,
              clarifyCost,
            );
            if (remaining == null) throw new Error("Unable to settle clarification credits");
            reservationFinalized = true;

            let questions: unknown[] = [];
            try {
              const parsed: unknown = JSON.parse(questionsJson);
              if (Array.isArray(parsed)) {
                questions = parsed;
              } else if (parsed && typeof parsed === "object") {
                // jsonMode forces an OBJECT on many models — they wrap the
                // array ({"questions":[...]}). Take the first array value.
                const arr = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
                if (arr) questions = arr as unknown[];
              }
            } catch { questions = []; }
            // Normalize — models rename fields ("text"/"prompt" for question,
            // option objects instead of strings). Empty questions rendered a
            // blank wizard (observed live: "1/4" with no visible question).
            questions = questions
              .map((raw, i) => {
                if (!raw || typeof raw !== "object") return null;
                const r = raw as Record<string, unknown>;
                const text = [r.question, r.q, r.text, r.prompt, r.label].find(
                  (v): v is string => typeof v === "string" && v.trim() !== "",
                );
                if (!text) return null;
                const rawOpts = Array.isArray(r.options)
                  ? r.options
                  : Array.isArray(r.choices)
                    ? r.choices
                    : [];
                const options = (rawOpts as unknown[])
                  .map((o) =>
                    typeof o === "string"
                      ? o
                      : o && typeof o === "object"
                        ? [
                            (o as Record<string, unknown>).label,
                            (o as Record<string, unknown>).value,
                            (o as Record<string, unknown>).text,
                          ].find((v): v is string => typeof v === "string")
                        : undefined,
                  )
                  .filter((s): s is string => !!s && s.trim() !== "");
                return {
                  id: typeof r.id === "string" ? r.id : `q${i + 1}`,
                  question: text.trim(),
                  type: options.length > 0 ? "choice" : "text",
                  kind: typeof r.kind === "string" ? r.kind : "general",
                  ...(options.length > 0 ? { options } : {}),
                };
              })
              .filter((q): q is NonNullable<typeof q> => q !== null);

            const qPayload = JSON.stringify({
              clarifying_questions: questions,
              originalPrompt: message,
              creditsUsed: clarifyCost,
              remainingCredits: remaining,
            });
            clarifyEnqueue(clarifyEncoder.encode("data: " + qPayload + "\n\n"));
            clarifyEnqueue(clarifyEncoder.encode("data: {}\n\n"));
          } catch {
            if (!reservationFinalized) {
              try {
                if (questionsJson.trim()) {
                  await settleCreditReservation(
                    supabase,
                    clarifyReservation.id,
                    clarifyReservation.amount,
                  );
                } else {
                  await cancelCreditReservation(supabase, clarifyReservation.id);
                }
                reservationFinalized = true;
              } catch (reservationError) {
                logger.error(
                  "ai.chat.clarify_reservation_finalize_failed",
                  reservationError instanceof Error ? reservationError : new Error(String(reservationError)),
                  { projectId, userId },
                );
              }
            }
            const errPayload = JSON.stringify({ error: "Failed to generate clarifying questions" });
            clarifyEnqueue(clarifyEncoder.encode("data: " + errPayload + "\n\n"));
          } finally {
            clarifyClose();
          }
        },
      });
      return new Response(clarifyStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }


    const reservationAmount = maxCreditCostForMode(mode);
    const creditReservation = await reserveCredits(supabase, {
      userId,
      amount: reservationAmount,
      action: `${mode}_message`,
      projectId,
    });
    if (!creditReservation) {
      return Response.json(
        { error: "Insufficient credits", requiredCredits: reservationAmount },
        { status: 402 },
      );
    }

        // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const turnStartedAt = Date.now();
        const { safeEnqueue, safeClose, isClientGone } = createStreamSink(controller, encoder, req.signal);
        let fullContent = "";
        let tokensUsed = 0;
        let usedAutoFix = false;
        const streamedFilePaths = new Set<string>();
        // Durability backstop: record every file the extractor streams so we can
        // await-persist them if the request is interrupted before the normal save
        // path runs (the mid-stream upserts below are fire-and-forget and can be
        // dropped on a client/proxy abort). Only flushed when NOT completed normally,
        // so a successful build's final/verified content is never clobbered.
        const streamedFiles: Array<{ path: string; content: string; language: string }> = [];
        let completedNormally = false;
        let reservationFinalized = false;
        let finalCreditCost: number | null = null;
        // Pre-build snapshot id — links the persisted assistant message to the
        // project state right before this build (Lovable per-message versions).
        // Stays null if snapshotting fails; must NEVER fail the build.
        let preBuildSnapshotId: string | null = null;
        // SSE keep-alive: reverse proxies (nginx proxy_read_timeout, Cloudflare ~100s)
        // drop a connection that goes idle during model "thinking" gaps (continuation +
        // self-verify phases emit no chunks). A comment frame every 20s keeps it open.
        // The client skips any line that doesn't start with "data: ", so this is inert.
        const heartbeat = setInterval(() => {
          try { if (!isClientGone()) safeEnqueue(encoder.encode(`: keepalive\n\n`)); } catch { /* ignore */ }
        }, 20_000);

        for (const step of subagentSteps) {
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ subagent: step })}\n\n`),
          );
        }

        // Surface auto-attached skills to the client before the model output
        // begins, so the chat panel can render a "using skill: X" chip on the
        // pending assistant message.
        if (mode === "build" && buildIntent) {
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ build_intent: buildIntent })}\n\n`),
          );
        }

        // ── Risk-gated route to the 11-role orchestrator ────────────────────
        // editor-lenses/orchestrator.ts (discovery → planning → debate → waves →
        // verification, 11 roles, real agent execution) is the strongest
        // generation path in the codebase. It used to be reachable only from the
        // Editor Intelligence side panel, so no normal build ever used it — the
        // best thing the product could do was not something it did.
        //
        // A request that scores high enough on `decideInitiativeRouting` is now
        // HANDED OFF to that path; a borderline one is merely offered. The handoff
        // is deliberate rather than inline: the initiative route owns the
        // orchestrator, its credit reservation and its own SSE contract, and
        // re-implementing that here would create a second copy of it — the same
        // mistake as the two auto-fix implementations.
        //
        // The build stops when we hand off, so we only hand off to a caller that
        // said it can pick the work up (`canRouteInitiative`). Without that flag —
        // API clients, older UI builds — the normal build runs, because a promoted
        // request that nobody executes is worse than a cheaper one that completes.
        if (mode === "build") {
          try {
            const routing = decideInitiativeRouting(message, {
              fileCount: Array.isArray(files) ? files.length : 0,
              mode,
              credits: typeof profile?.credits === "number" ? Number(profile.credits) : undefined,
              clientCanRoute: body.canRouteInitiative === true,
              forceBuild: body.forceBuild === true,
            });

            if (routing.autoRoute) {
              logger.info("ai.chat.initiative_autoroute", {
                projectId,
                signals: routing.signals,
                budgetCredits: routing.budgetCredits,
              });
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    initiative_routed: {
                      goal: message,
                      reason: routing.reason,
                      signals: routing.signals,
                      budgetCredits: routing.budgetCredits,
                    },
                  })}\n\n`,
                ),
              );
              // Nothing was generated and nothing was charged on this request —
              // say so explicitly rather than sending a `done` that implies a
              // finished build.
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    status: "handed_off",
                    message: "Routed to the engineering team — this build was not charged.",
                  })}\n\n`,
                ),
              );
              safeClose();
              return;
            }

            if (routing.suggest) {
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    initiative_suggestion: {
                      reason: routing.reason,
                      signals: routing.signals,
                      budgetCredits: routing.budgetCredits,
                      declinedBecause: routing.declinedBecause,
                    },
                  })}\n\n`,
                ),
              );
            }
          } catch (routeErr) {
            // Routing is an optimisation. It must never cost the user their build.
            logger.warn("ai.chat.initiative_routing_failed", {
              projectId,
              error: String(routeErr),
            });
          }
        }

        if (attachedSkills.length > 0) {
          safeEnqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                skills_attached: attachedSkills.map((m) => ({
                  id: m.skill.id,
                  name: m.skill.name,
                  icon: undefined,            // populated client-side from local cache if needed
                  score: Math.round(m.score * 100) / 100,
                  reason: m.reason,
                })),
              })}\n\n`,
            ),
          );
        }

        // In build mode, stream-upsert each file to DB as soon as it completes
        const fileExtractor = mode === "build"
          ? new StreamingFileExtractor(async (file) => {
              if (streamedFilePaths.has(file.path)) return; // dedupe
              streamedFilePaths.add(file.path);
              streamedFiles.push({ path: file.path, content: file.content, language: file.language });
              // Fire-and-forget upsert so it doesn't block streaming
              void (supabase as any).from("project_files").upsert({
                project_id: projectId,
                path: file.path,
                content: file.content,
                language: file.language,
              }, { onConflict: "project_id,path" });
              // Notify client that a file is available early
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ streamedFile: file.path })}\n\n`)
              );
            })
          : null;

        try {
          const result = await generateAI(
            {
              model: effectiveModel,
              messages,
              maxTokens: outputMaxTokens,
              stream: true,
              // Force structured JSON for build. Patch uses an object wrapper
              // ({"patches":[...]}) so OpenAI json_object mode is valid.
              jsonMode: mode === "build" || mode === "patch",
              onChunk: (chunk) => {
                fullContent += chunk;
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
                // Feed chunk into incremental file extractor (build mode only)
                fileExtractor?.feed(chunk);
              },
            },
            { projectId, userId, task: `chat.${mode}.primary` },
          );

          tokensUsed = result.tokensUsed;

          // ── Continuation: never ship a truncated build ───────────────────
          // If the model hit the token cap mid-JSON, the response is incomplete
          // and later files would be lost. Ask it to continue from where it
          // stopped and append, until the JSON parses cleanly (or we run out of
          // rounds). This is what makes a 10-file app reliably complete.
          if (mode === "build") {
            let contRounds = 0;
            while (
              needsBuildContinuation(fullContent) &&
              contRounds < BUILD_CONTINUATION_ROUNDS
            ) {
              contRounds++;
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ status: "continuing", message: `Response was long — continuing generation (${contRounds}/${BUILD_CONTINUATION_ROUNDS})…` })}\n\n`)
              );
              let contChunk = "";
              try {
                await generateAI({
                  model: effectiveModel,
                  messages: [
                    ...messages,
                    { role: "assistant" as const, content: fullContent },
                    {
                      role: "user" as const,
                      content:
                        "Your previous JSON response was cut off before it finished. Continue from EXACTLY where it stopped and output ONLY the remaining raw characters needed to complete the JSON object. Do not repeat any earlier content, do not restart, no code fences, no commentary.",
                    },
                  ],
                  maxTokens: outputMaxTokens,
                  stream: true,
                  jsonMode: false, // raw continuation of the existing object, not a new one
                  onChunk: (chunk) => {
                    fullContent += chunk;
                    contChunk += chunk;
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
                    fileExtractor?.feed(chunk);
                  },
                }, { projectId, userId, task: "chat.build.continuation" });
              } catch (contErr) {
                logger.warn("ai.chat.continuation_failed", { projectId, error: String(contErr) });
                break;
              }
              if (!contChunk.trim()) break; // model produced nothing more
              tokensUsed += 1000; // rough estimate for the continuation pass
            }
          }

          // ── Patch mode: apply find-and-replace patches ────────────────────
          let parsedFiles: ParsedFile[] = [];
          /** Lovable honesty: don't claim success when nothing landed in project_files. */
          let patchOutcome: "applied" | "failed" | "n/a" = mode === "patch" ? "failed" : "n/a";
          if (mode === "patch") {
            const projectFiles = files as Array<{ path: string; content: string }>;
            const menuIntent = isMenuNavEditIntent(costPrompt);
            const navFiles = findNavSourceFiles(projectFiles);
            const navSnippet = navFiles
              .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 6000)}\n\`\`\``)
              .join("\n\n");

            let patches = parsePatchResponse(fullContent);
            patches = remapInventedNavPatchPaths(patches, projectFiles);
            patches = filterUnsafeHeaderPatches(patches, costPrompt);

            // Repair when empty OR when EVERY patch misses — for ANY edit, not
            // just menu edits. Observed failure: "change the hero heading …"
            // parsed one patch whose find-string missed and went straight to
            // "try rephrasing" instead of retrying against real file content.
            const firstPassResults =
              patches.length > 0 ? applyPatches(patches, projectFiles) : [];
            const allMissed =
              patches.length > 0 && firstPassResults.every((r) => !r.applied);
            const needsRepair =
              (patches.length === 0 && fullContent.trim().length > 0) || allMissed;

            // Deterministic shortcut first — instant and exact when it hits,
            // saving the extra repair model round-trip entirely.
            let repairHandled = false;
            if (needsRepair) {
              const detShortcut = [
                ...(menuIntent ? buildDeterministicMenuPatches(costPrompt, projectFiles) : []),
                ...buildDeterministicTextPatches(costPrompt, projectFiles),
              ];
              if (
                detShortcut.length > 0 &&
                applyPatches(detShortcut, projectFiles).some((r) => r.applied)
              ) {
                logger.info("ai.chat.patch_deterministic_shortcut", {
                  projectId,
                  paths: detShortcut.map((p) => p.path),
                });
                patches = detShortcut;
                repairHandled = true;
              }
            }
            if (needsRepair && !repairHandled) {
              logger.warn("ai.chat.patch_empty_retry", {
                projectId,
                contentLen: fullContent.length,
                preview: fullContent.slice(0, 240),
                menuIntent,
                navTargets: navFiles.map((f) => f.path),
              });
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    status: "fixing",
                    message: "Retrying edit against the real header/nav files…",
                  })}\n\n`,
                ),
              );
              try {
                let repairContent = "";
                // Give the retry the VERBATIM contents of the files the missed
                // patches targeted — the first pass failed precisely because the
                // model never had (or ignored) the real text to copy from.
                // Reachability guard: if a missed target is an ORPHAN (imported
                // nowhere), also hand the model the rendered pages that contain
                // a heading — patching an unused duplicate changes nothing on
                // screen (observed: unused Hero.tsx vs live pages/Home.tsx).
                const { findReachablePaths, pickHeadingCandidateFiles } = await import(
                  "@/lib/ai/text-edit"
                );
                const reachableSet = findReachablePaths(projectFiles);
                const missedPaths = new Set(patches.map((p) => p.path));
                const missedFiles = projectFiles.filter((f) => missedPaths.has(f.path));
                const hasOrphanTarget = missedFiles.some((f) => !reachableSet.has(f.path));
                const renderedAlternatives = hasOrphanTarget
                  ? projectFiles
                      .filter(
                        (f) =>
                          reachableSet.has(f.path) &&
                          !missedPaths.has(f.path) &&
                          /\.(tsx|jsx|vue|html?)$/i.test(f.path) &&
                          /<(h1|h2)\b/i.test(f.content),
                      )
                      .sort((a, b) => {
                        const rank = (p: string) =>
                          /(pages|views)\//i.test(p) ? 0 : /(home|app|index|landing)/i.test(p) ? 1 : 2;
                        return rank(a.path) - rank(b.path);
                      })
                      .slice(0, 2)
                  : [];
                let targetFiles = [
                  ...missedFiles.filter((f) => reachableSet.has(f.path)),
                  ...renderedAlternatives,
                  ...missedFiles.filter((f) => !reachableSet.has(f.path)),
                ].slice(0, 3);
                // Heading-descriptor requests ("change the hero heading to X"):
                // rank hero candidates OURSELVES and put them first — retries of
                // the same prompt otherwise re-target whatever wrong file earlier
                // attempts touched (observed: OrderSuccess.tsx patched twice
                // while the real hero sat in pages/Home.tsx).
                const repairIntent = parseTextReplacementIntent(costPrompt);
                const repairDescriptor = repairIntent
                  ? parseHeadingDescriptor(repairIntent.from)
                  : null;
                if (repairDescriptor) {
                  const heroFiles = pickHeadingCandidateFiles(
                    projectFiles,
                    repairDescriptor.scope,
                  );
                  if (heroFiles.length > 0) {
                    const heroPaths = new Set(heroFiles.map((f) => f.path));
                    targetFiles = [
                      ...heroFiles,
                      ...targetFiles.filter((f) => !heroPaths.has(f.path)),
                    ].slice(0, 3);
                  }
                }
                const targetSnippet = targetFiles
                  .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 8000)}\n\`\`\``)
                  .join("\n\n");
                const allowedPaths =
                  targetFiles.length > 0
                    ? targetFiles.map((f) => f.path).join(", ")
                    : navFiles.length > 0
                      ? navFiles.map((f) => f.path).join(", ")
                      : projectFiles
                          .map((f) => f.path)
                          .filter((p) => /\.(tsx|jsx|html)$/i.test(p))
                          .slice(0, 12)
                          .join(", ");
                await generateAI({
                  model: effectiveModel,
                  messages: [
                    {
                      role: "system",
                      content:
                        'Return ONLY a JSON object: {"patches":[{"path","find","replace","description"}]}. ' +
                        "No markdown, no prose. find must be copied VERBATIM from the provided file. " +
                        `Allowed paths only: ${allowedPaths || "(paths from file contents below)"}. ` +
                        'Never invent header.html. Never return {"patches":[]} for an edit request.',
                    },
                    {
                      role: "user",
                      content:
                        `User request:\n${costPrompt}\n\n` +
                        `Previous invalid/empty response:\n${fullContent.slice(0, 1500)}\n\n` +
                        `Real file contents to patch (copy find strings VERBATIM from here):\n${targetSnippet || navSnippet || "(see project files — look for the component that renders the text being changed)"}\n\n` +
                        (hasOrphanTarget
                          ? `IMPORTANT: the previously targeted file is NOT imported/rendered anywhere — editing it changes nothing on screen. Patch the RENDERED file (listed first) that actually contains the visible text.\n\n`
                          : "") +
                        `Emit {"patches":[...]} that applies the requested edit to one of those files.`,
                    },
                  ],
                  maxTokens: Math.max(outputMaxTokens, 3500),
                  stream: true,
                  jsonMode: true,
                  onChunk: (chunk) => {
                    repairContent += chunk;
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
                  },
                }, { projectId, userId, task: "chat.patch.repair" });
                if (repairContent.trim()) {
                  fullContent = repairContent;
                  patches = filterUnsafeHeaderPatches(
                    remapInventedNavPatchPaths(
                      parsePatchResponse(repairContent),
                      projectFiles,
                    ),
                    costPrompt,
                  );
                }
              } catch (repairErr) {
                logger.warn("ai.chat.patch_repair_failed", {
                  projectId,
                  error: String(repairErr),
                });
              }
            }

            if (patches.length === 0) {
              // Deterministic last resort for menu/header edits — clone existing
              // link markup in the real Header/Navbar so the preview always updates.
              if (menuIntent) {
                const deterministic = buildDeterministicMenuPatches(costPrompt, projectFiles);
                if (deterministic.length > 0) {
                  logger.info("ai.chat.patch_deterministic_menu", {
                    projectId,
                    paths: deterministic.map((p) => p.path),
                  });
                  patches = deterministic;
                }
              }
              if (patches.length === 0) {
                const deterministicText = buildDeterministicTextPatches(costPrompt, projectFiles);
                if (deterministicText.length > 0) {
                  logger.info("ai.chat.patch_deterministic_text", {
                    projectId,
                    paths: deterministicText.map((p) => p.path),
                  });
                  patches = deterministicText;
                }
              }
            }

            if (patches.length === 0) {
              logger.warn("ai.chat.patch_empty", {
                projectId,
                contentLen: fullContent.length,
                menuIntent,
                navTargets: navFiles.map((f) => f.path),
              });
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    status: "patches_failed",
                    auto_routed: autoRoutedPatch,
                    message: menuIntent
                      ? `Could not patch the header/nav. Expected targets: ${navFiles.map((f) => f.path).join(", ") || "Header/Navbar/App"}. Try: "add About and Contact links to the header".`
                      : "Could not parse any file patches from the model response. Try Quick Edit or rephrase the change.",
                  })}\n\n`,
                ),
              );
            } else {
              let patchResults = applyPatches(patches, projectFiles);
              // If AI patches all missed, try deterministic menu insert once.
              if (menuIntent && patchResults.every((r) => !r.applied)) {
                const deterministic = buildDeterministicMenuPatches(costPrompt, projectFiles);
                if (deterministic.length > 0) {
                  logger.info("ai.chat.patch_deterministic_menu_after_miss", {
                    projectId,
                    paths: deterministic.map((p) => p.path),
                  });
                  patches = deterministic;
                  patchResults = applyPatches(patches, projectFiles);
                }
              }
              if (patchResults.every((r) => !r.applied)) {
                const deterministicText = buildDeterministicTextPatches(costPrompt, projectFiles);
                if (deterministicText.length > 0) {
                  logger.info("ai.chat.patch_deterministic_text_after_miss", {
                    projectId,
                    paths: deterministicText.map((p) => p.path),
                  });
                  patches = deterministicText;
                  patchResults = applyPatches(patches, projectFiles);
                }
              }
              // Menu intent: patches may "apply" but still miss the real <nav>
              // (e.g. model/logo Link cloned). Re-check labels and fall back.
              if (menuIntent) {
                const labels = extractMenuLabelsFromPrompt(costPrompt);
                const workingFiles = projectFiles.map((f) => {
                  const hit = patchResults.find((r) => r.applied && r.path === f.path);
                  return hit ? { path: f.path, content: hit.content } : f;
                });
                const navTargets = findNavSourceFiles(workingFiles, 4);
                const stillMissing =
                  labels.length > 0 &&
                  (navTargets.length === 0 ||
                    navTargets.some((f) => {
                      // Desktop-visible nav only — mobile drawer labels don't count.
                      const hay =
                        extractDesktopNavHaystack(f.content) || extractNavHaystack(f.content);
                      return labels.some((label) => !navContainsLabel(hay, label));
                    }));
                if (stillMissing) {
                  const deterministic = buildDeterministicMenuPatches(costPrompt, workingFiles);
                  if (deterministic.length > 0) {
                    logger.info("ai.chat.patch_deterministic_menu_after_weak", {
                      projectId,
                      labels,
                      paths: deterministic.map((p) => p.path),
                    });
                    patches = deterministic;
                    patchResults = applyPatches(patches, workingFiles);
                  }
                }
              }
              // Literal from→to requests: if the exact FROM text STILL exists
              // after the model's patches, the model edited the wrong target
              // (observed: 'change "Get a Quote" to "Get a Free Quote"' patched
              // CTASection while the hero button kept the literal text).
              // Deterministically fix the real occurrence too.
              {
                const literalIntent = parseTextReplacementIntent(costPrompt);
                if (literalIntent && !parseHeadingDescriptor(literalIntent.from)) {
                  const workingFiles = projectFiles.map((f) => {
                    const hit = [...patchResults]
                      .reverse()
                      .find((r) => r.applied && r.path === f.path);
                    return hit ? { path: f.path, content: hit.content } : f;
                  });
                  const correction = buildDeterministicTextPatches(costPrompt, workingFiles);
                  if (correction.length > 0) {
                    logger.info("ai.chat.patch_deterministic_text_correction", {
                      projectId,
                      paths: correction.map((p) => p.path),
                    });
                    patchResults = patchResults.concat(applyPatches(correction, workingFiles));
                  }
                }
              }
              const applied = patchResults.filter((r) => r.applied);
              const failed = patchResults.filter((r) => !r.applied);
              if (applied.length > 0) patchOutcome = "applied";
              // Upsert FINAL content per path — sequential multi-patches on the
              // same file must not be overwritten by an earlier intermediate result.
              for (const pr of collapsePatchResults(patchResults)) {
                const lang = pr.path.split(".").pop()?.toLowerCase() ?? "text";
                const langMap: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", css: "css", html: "html", json: "json", md: "markdown" };
                parsedFiles.push({ path: pr.path, content: pr.content, language: langMap[lang] ?? lang });
                await (supabase as any).from("project_files").upsert({
                  project_id: projectId, path: pr.path, content: pr.content, language: langMap[lang] ?? lang,
                }, { onConflict: "project_id,path" });
              }
              for (const pr of failed) {
                logger.warn("ai.chat.patch_failed", { projectId, path: pr.path, error: pr.error });
              }
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    status: "patches_applied",
                    count: applied.length,
                    paths: applied.map((r) => r.path),
                    failed: failed.map((r) => ({ path: r.path, error: r.error })),
                  })}\n\n`,
                ),
              );
              if (failed.length > 0 && applied.length === 0) {
                safeEnqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      status: "patches_failed",
                      auto_routed: autoRoutedPatch,
                      message: `${failed.length} patch${failed.length === 1 ? "" : "es"} could not be applied (${failed.map((f) => f.path).join(", ")}).`,
                      failed: failed.map((f) => ({ path: f.path, error: f.error })),
                    })}\n\n`,
                  ),
                );
              }
            }
          } else if (mode === "build") {
            const parsed = parseAIResponse(fullContent);
            const existingFiles = (files as ParsedFile[]) ?? [];

            // ── <file_update> with <search>/<replace> ─────────────────────────
            // parseAIResponse can turn <full> blocks straight into files, but a
            // search/replace pair needs the file's CURRENT content to resolve, and
            // the parser only receives the raw response text. So it hands them back
            // as `xmlPatches` and they are applied here, where the project's files
            // are in scope.
            //
            // This closes a real divergence: the client feeds the same stream to
            // XmlStreamParser and applies these blocks to its local file state, so
            // before this the editor showed the edit and the database kept the old
            // content. Failures are left to the existing zero-files retry below,
            // which asks the model for the proper format.
            if (parsed.xmlPatches?.length) {
              // Patch against existing files overlaid with any <full> blocks from
              // the same response, so a <full> and a <search> for one path compose
              // instead of racing.
              const baseMap = new Map(existingFiles.map((f) => [f.path, f.content]));
              for (const f of parsed.files) baseMap.set(f.path, f.content);
              const patchBase = [...baseMap].map(([path, content]) => ({ path, content }));

              const xmlResults = applyPatches(
                parsed.xmlPatches.map((p) => ({
                  path: p.path,
                  find: p.find,
                  replace: p.replace,
                })),
                patchBase,
              );

              const byPath = new Map(parsed.files.map((f) => [f.path, f]));
              for (const pr of collapsePatchResults(xmlResults)) {
                byPath.set(pr.path, {
                  path: pr.path,
                  content: pr.content,
                  language: detectLanguage(pr.path),
                });
              }
              parsed.files = [...byPath.values()];

              const xmlFailed = xmlResults.filter((r) => !r.applied);
              if (xmlFailed.length > 0) {
                logger.warn("ai.chat.xml_patch_failed", {
                  projectId,
                  failed: xmlFailed.map((f) => ({ path: f.path, error: f.error })),
                });
              }
              logger.info("ai.chat.xml_file_update", {
                projectId,
                model: effectiveModel,
                patches: parsed.xmlPatches.length,
                applied: parsed.xmlPatches.length - xmlFailed.length,
              });
            }

            let finalFiles = ensureCommonGeneratedSupportFiles(parsed.files, existingFiles);

            // ── Validation pass ───────────────────────────────────────────
            if (finalFiles.length > 0) {
              // Correctness errors (broken imports, missing config) + type-agnostic
              // RICHNESS errors (too thin / sparse) — both feed the auto-fix loop,
              // so a structurally-valid-but-empty app gets enriched, not shipped.
              const correctnessErrors = validateGeneratedFiles(finalFiles, existingFiles);
              const richnessErrors = assessGenerationQuality(finalFiles, existingFiles, {
                minFiles: buildIntent?.minFiles,
                appType: buildIntent?.appType,
              });
              const validationErrors = [...correctnessErrors, ...richnessErrors];
              const needsEnrichment = richnessErrors.length > 0;

              if (shouldAutoFix(validationErrors) && validationErrors.length > 0) {
                usedAutoFix = true;
                // ── Auto-fix pass — send errors back to AI ────────────────
                safeEnqueue(
                  encoder.encode(`data: ${JSON.stringify({ status: "fixing", message: `Auto-fixing ${validationErrors.length} issue(s)…` })}\n\n`)
                );

                logger.info("ai.chat.autofix", {
                  projectId,
                  errorCount: validationErrors.length,
                  errors: validationErrors.map((e) => e.message),
                });

                try {
                  const repairPrompt = buildRepairPrompt(
                    finalFiles,
                    validationErrors.map((e) => e.message),
                    needsEnrichment ? buildIntent?.blueprint : undefined,
                  );
                  let repairContent = "";
                  const repairModel = simpleEconomyRequest ? ECONOMY_CODING_MODEL : ESCALATION_MODEL;
                  await generateAI({
                    // Escalation ladder (mirrors the lens system): repair with
                    // the STRONGEST tier, not the model that just produced the
                    // flawed output — the same brain asked to fix its own
                    // systematic mistake mostly reproduces it. Fires at most
                    // once per build and only after validation failed, so the
                    // premium model's cost lands exactly where it pays.
                    model: repairModel,
                    messages: [
                      {
                        role: "system" as const,
                        // Enrichment carries its own full build instructions in the
                        // user message; the "fix only" AutoFix system prompt would
                        // fight it, so use a neutral system prompt when enriching.
                        content: needsEnrichment
                          ? "You are LifemarkAI Build Engine. Follow the user message exactly and respond with ONLY the required JSON object."
                          : AUTO_FIX_SYSTEM_PROMPT,
                      },
                      { role: "user" as const, content: repairPrompt },
                    ],
                    maxTokens: outputMaxTokens,
                    stream: true,
                    jsonMode: true,
                    onChunk: (chunk) => { repairContent += chunk; },
                  }, { projectId, userId, task: "chat.build.autofix" });

                  const repaired = parseAIResponse(repairContent);
                  if (repaired.files.length > 0) {
                    // Merge repaired files on top of originals
                    const mergedMap = new Map(finalFiles.map((f) => [f.path, f]));
                    for (const rf of repaired.files) mergedMap.set(rf.path, rf);
                    finalFiles = ensureCommonGeneratedSupportFiles(Array.from(mergedMap.values()), existingFiles);
                    tokensUsed += 1000; // rough estimate for fix pass

                    const remainingErrors = validateGeneratedFiles(finalFiles, existingFiles);
                    if (shouldAutoFix(remainingErrors)) {
                      logger.info("ai.chat.autofix_remaining", {
                        projectId,
                        errorCount: remainingErrors.length,
                      });
                    }
                  }
                } catch (fixErr) {
                  logger.warn("ai.chat.autofix_failed", { projectId, error: String(fixErr) });
                  // Continue with original files if fix pass fails
                }
              }
            } else {
              // ── Zero files parsed: the model ignored the build output format
              // (common with weaker models that answer in prose + code fences).
              // Retry once with an explicit format demand; if that also fails,
              // tell the user instead of silently doing nothing.
              // Be specific about WHY nothing was extracted. An unlabelled code
              // fence used to be silently turned into `src/fileN.tsx` — junk that
              // nothing imports, reported as a successful build. Now it fails, so
              // say exactly what was missing and the retry has a real chance.
              const unlabelled = parsed.unlabelledFences ?? 0;
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({
                  status: "fixing",
                  message: unlabelled > 0
                    ? `Model returned ${unlabelled} code block${unlabelled === 1 ? "" : "s"} without a file path — requesting proper file output…`
                    : "Model returned prose instead of files — requesting proper file output…",
                })}\n\n`)
              );
                  logger.warn("ai.chat.no_files_parsed", { projectId, model: effectiveModel, unlabelledFences: unlabelled });
              try {
                let retryContent = "";
                await generateAI({
                  model: effectiveModel,
                  messages: [
                    ...messages,
                    { role: "assistant" as const, content: fullContent },
                    {
                      role: "user" as const,
                      content:
                        (unlabelled > 0
                          ? `Your previous response contained ${unlabelled} code block${unlabelled === 1 ? "" : "s"} but never said which file each one belongs to, so none of it could be saved. `
                          : "Your previous response did not contain any files in the required output format. ") +
                        "Respond ONLY with the required JSON object containing the COMPLETE file contents for this request — " +
                        "every file must carry its full path — no explanations, no installation steps, no markdown fences.",
                    },
                  ],
                  maxTokens: outputMaxTokens,
                  stream: true,
                  jsonMode: true,
                  onChunk: (chunk) => { retryContent += chunk; },
                }, { projectId, userId, task: "chat.build.format_retry" });
                const retryParsed = parseAIResponse(retryContent);
                if (retryParsed.files.length > 0) {
                  finalFiles = ensureCommonGeneratedSupportFiles(retryParsed.files, existingFiles);
                  fullContent = retryContent; // persist the output that actually contained files
                  tokensUsed += 1500; // rough estimate for the retry pass
                } else {
                  safeEnqueue(
                    encoder.encode(`data: ${JSON.stringify({ status: "no_files", message: "The model didn't produce files in the required format. Try again, or switch to a stronger model (e.g. GPT-4o) in the model picker." })}\n\n`)
                  );
                }
              } catch (retryErr) {
                logger.warn("ai.chat.format_retry_failed", { projectId, error: String(retryErr) });
                safeEnqueue(
                  encoder.encode(`data: ${JSON.stringify({ status: "no_files", message: "The model didn't produce files in the required format. Try again, or switch to a stronger model." })}\n\n`)
                );
              }
            }

            // ── Post-generation guarantees ────────────────────────────────
            // Everything above is the model's work checked against prompts. The
            // three passes below are deterministic and run last, so a bad turn
            // degrades into a plain build rather than a broken one.
            if (mode === "build" && finalFiles.length > 0) {
              // 1. `src/routeTree.gen.ts` belongs to the tanstackStart() Vite
              //    plugin, never to the model.
              finalFiles = stripGeneratedRouteTree(finalFiles);

              // 2. Header + footer. A landing page without site chrome is not a
              //    landing page; the prompt asked, this makes sure.
              finalFiles = ensureWebsiteChrome(finalFiles, existingFiles, {
                appType: buildIntent?.appType,
                brand: projectData?.name ?? undefined,
              });

              // 3. Pin every dependency we own. One React-18-only version next
              //    to the React 19 base set aborts `npm install` with ERESOLVE,
              //    which the user experiences as a preview that never boots.
              const pkgIndex = finalFiles.findIndex((f) => f.path === "package.json");
              if (pkgIndex >= 0) {
                const aligned = alignGeneratedPackageJson(finalFiles[pkgIndex].content);
                if (aligned.changed.length > 0) {
                  finalFiles[pkgIndex] = { ...finalFiles[pkgIndex], content: aligned.content };
                  logger.info("ai.chat.package_pins_aligned", {
                    projectId,
                    changed: aligned.changed,
                  });
                }
              }
            }

            parsedFiles = finalFiles;

            // ── Save files to DB ──────────────────────────────────────────
            if (parsedFiles.length > 0) {
              // Auto-snapshot current state before overwriting
              const { data: currentFiles } = await (supabase as any)
                .from("project_files")
                .select("path, content, language")
                .eq("project_id", projectId);

              if (currentFiles && currentFiles.length > 0) {
                try {
                  const { data: preSnap } = await (supabase as any)
                    .from("project_snapshots")
                    .insert({
                      project_id:  projectId,
                      user_id:     userId,
                      label:       `Auto-save before: ${message.slice(0, 60)}`,
                      is_baseline: true,
                      files:       currentFiles,
                      patches:     null,
                      parent_id:   null,
                    })
                    .select("id")
                    .single();
                  preBuildSnapshotId = (preSnap as { id: string } | null)?.id ?? null;
                } catch {
                  preBuildSnapshotId = null; // best-effort — never fail the build
                }
              }

              // Project memory: append this build to the decision log (capped,
              // zero AI cost) so future prompts know what was already asked.
              try {
                const { appendDecision } = await import("@/lib/ai/design-system-context");
                const prevMeta = ((projectRes.data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
                const nextLog = appendDecision(prevMeta.decision_log, {
                  at: new Date().toISOString(),
                  req: String(costPrompt ?? message).slice(0, 140),
                  files: parsedFiles.length,
                  paths: parsedFiles.slice(0, 3).map((f) => f.path),
                });
                await (supabase as any)
                  .from("projects")
                  .update({ metadata: { ...prevMeta, decision_log: nextLog } })
                  .eq("id", projectId);
              } catch { /* best-effort — never fail the build */ }

              // Always upsert FINAL parsed/repaired content. Mid-stream upserts are
              // for UX only — skipping here left autofix/repair changes on disk out
              // of sync with what the model "finished" (Lovable: preview = latest).
              const { sanitizeGeneratedFile } = await import("@/lib/ai/html-sanity");
              for (const file of parsedFiles) {
                await (supabase as any).from("project_files").upsert({
                  project_id: projectId,
                  path: file.path,
                  // Guards against continuation rounds appending a second full
                  // document to html files (observed corruption in the wild).
                  content: sanitizeGeneratedFile(file.path, file.content),
                  language: file.language,
                }, { onConflict: "project_id,path" });
              }

                            // empty desktop <nav>. Force About/Services/Contact into the real header.
              if (isMenuNavEditIntent(costPrompt)) {
                const mergedForNav = new Map<string, { path: string; content: string }>();
                for (const f of (currentFiles as Array<{ path: string; content: string }> | null) ?? []) {
                  mergedForNav.set(f.path, { path: f.path, content: f.content });
                }
                for (const f of parsedFiles) {
                  mergedForNav.set(f.path, { path: f.path, content: f.content });
                }
                const workingNavFiles = Array.from(mergedForNav.values());
                const menuPatches = buildDeterministicMenuPatches(costPrompt, workingNavFiles);
                if (menuPatches.length > 0) {
                  const menuResults = applyPatches(menuPatches, workingNavFiles);
                  for (const pr of collapsePatchResults(menuResults)) {
                    if (!pr.applied) continue;
                    const lang = pr.path.split(".").pop()?.toLowerCase() ?? "text";
                    const langMap: Record<string, string> = {
                      ts: "typescript", tsx: "typescript", js: "javascript",
                      jsx: "javascript", css: "css", html: "html", json: "json", md: "markdown",
                    };
                    const language = langMap[lang] ?? lang;
                    parsedFiles = parsedFiles.map((f) =>
                      f.path === pr.path ? { ...f, content: pr.content } : f,
                    );
                    if (!parsedFiles.some((f) => f.path === pr.path)) {
                      parsedFiles.push({ path: pr.path, content: pr.content, language });
                    }
                    await (supabase as any).from("project_files").upsert({
                      project_id: projectId,
                      path: pr.path,
                      content: pr.content,
                      language,
                    }, { onConflict: "project_id,path" });
                  }
                  logger.info("ai.chat.build_deterministic_menu", {
                    projectId,
                    paths: menuPatches.map((p) => p.path),
                  });
                }
              }
            }
          }

          // ── Lovable parity: backend auto-wiring + self-verification ────────
          // Both run inside the stream so the user sees live progress; both
          // are best-effort and never fail the build.
          let backendWiring: AutoWireResult | null = null;
          let verification: SelfVerifyResult | null = null;
          if ((mode === "build" || mode === "patch") && parsedFiles.length > 0) {
            const emitStatus = (key: string) => (status: string) => {
              safeEnqueue(encoder.encode(`data: ${JSON.stringify({ [key]: status })}\n\n`));
            };

            // 1. Backend wiring — auto-connect Cloud + credentials + migrations
            try {
              const { autoWireBackend } = await import("@/lib/cloud/auto-wire");
              backendWiring = await autoWireBackend({
                supabase,
                projectId,
                userId,
                prompt: message,
                generatedFiles: parsedFiles,
                cloudToolPermissionsRaw: cloudPermissionsRaw,
                emit: emitStatus("wiring_status"),
              });
              // In-app AI connector auto-wiring (managed AI for the generated app)
              try {
                await autoWireAi({
                  supabase,
                  projectId,
                  prompt: message,
                  generatedFiles: parsedFiles,
                  emit: emitStatus("wiring_status"),
                });
              } catch { /* never fail the build */ }
            } catch { backendWiring = null; }

            // 2. Self-verification — render the app, auto-fix runtime errors.
            //    For pure restyle/redesign edits, skip the slow auto-fix ROUNDS
            //    (verify-only, maxRounds=0): a theme/color/spacing change almost
            //    never introduces build errors, and the fix rounds are the biggest
            //    time cost. Non-styling builds keep the default 2 fix rounds.
            const isStyleOnlyEdit = /(re-?style|re-?design|change\s+(the\s+)?(theme|template|design|look|colou?rs?|style)|update\s+(the\s+)?(website\s+)?(theme|template|design|look|style)|new\s+(theme|template|design|look|style)|different\s+(theme|template|design|look)|make\s+it\s+(dark|light|modern|minimal|colou?rful|cleaner))/i.test(message);
            const verifyOnlyFastLane = simpleEconomyRequest || isStyleOnlyEdit;
            try {
              const { runSelfVerification } = await import("@/lib/ai/self-verify");
              verification = await runSelfVerification({
                supabase,
                projectId,
                userId,
                emit: emitStatus("verify_status"),
                maxRounds: verifyOnlyFastLane ? 0 : undefined,
              });
              if (verification && verification.fixesApplied > 0) {
                usedAutoFix = true;
                // Merge fix-round rewrites into the build's file list so the
                // client and files_changed metadata reflect the final state.
                for (const fixed of verification.fixedFiles) {
                  const idx = parsedFiles.findIndex((f) => f.path === fixed.path);
                  if (idx >= 0) parsedFiles[idx] = { ...parsedFiles[idx], content: fixed.content };
                  else parsedFiles.push({ path: fixed.path, content: fixed.content, language: fixed.language });
                }
              }
              // Errors that survived the auto-fix rounds become 'runtime'
              // health findings so the Self-Heal tab tracks them (best-effort,
              // never fails the build — see lib/ai/self-healing.ts).
              if (verification && !verification.passed) {
                const { recordVerificationFindings } = await import("@/lib/ai/self-healing");
                await recordVerificationFindings({
                  supabase,
                  projectId,
                  userId,
                  verification,
                }).catch(() => {});
              }
            } catch { verification = null; }
          }

          const buildActivity =
            (mode === "build" || mode === "patch") && (parsedFiles.length > 0 || Array.isArray(files) && files.length > 0)
              ? buildCompletedBuildActivity(
                  Array.isArray(files) ? files.length : 0,
                  buildIntent?.statusLabel ?? null,
                  Math.max(parsedFiles.length, streamedFilePaths.size),
                  { githubRepo: projectData?.github_repo ?? null },
                )
              : null;

          const skillsMeta =
            attachedSkills.length > 0
              ? {
                  skills_attached: attachedSkills.map((m) => ({
                    id: m.skill.id,
                    name: m.skill.name,
                    reason: m.reason,
                  })),
                }
              : {};

          const assistantMetadata: Record<string, unknown> | null =
            (mode === "build" || mode === "patch") && parsedFiles.length > 0
              ? {
                  files_changed: parsedFiles.map((f) => f.path),
                  snapshot_id: preBuildSnapshotId ?? undefined,
                  work_seconds: Math.max(1, Math.round((Date.now() - turnStartedAt) / 1000)),
                  ...(buildActivity ? { build_activity: buildActivity, steps: buildActivity.length } : {}),
                  ...skillsMeta,
                }
              : buildActivity || attachedSkills.length > 0
                ? {
                    ...(buildActivity
                      ? {
                          build_activity: buildActivity,
                          steps: buildActivity.length,
                          work_seconds: Math.max(1, Math.round((Date.now() - turnStartedAt) / 1000)),
                        }
                      : {}),
                    ...skillsMeta,
                  }
                : null;

          const creditCost = computeCreditCost({
            mode,
            filesGenerated: parsedFiles.length,
            tokensUsed,
            usedSubagents: subagentSteps.length > 0,
            usedAutoFix,
          });
          finalCreditCost = creditCost;

          // Save messages to DB — attach files_changed + credits metadata.
          // Map "patch" → "build" for the messages.mode CHECK; admin retry on RLS fail.
          const changedPathsForPersist =
            mode === "patch" && patchOutcome === "failed"
              ? []
              : parsedFiles.length > 0
                ? parsedFiles.map((f) => f.path)
                : Array.from(streamedFilePaths);
          const persistedContent =
            mode === "patch" && patchOutcome === "failed"
              ? "I couldn't apply that edit to your files — the preview wasn't changed. Try rephrasing or switch to Build."
              : buildPersistedAssistantContent({
                  mode,
                  fullContent,
                  changedPaths: changedPathsForPersist,
                });
          const { assistantMessageId } = await persistChatTurnMessages(
            supabase,
            [
              { project_id: projectId, role: "user", content: persistedUserMessage, mode },
              {
                project_id: projectId,
                role: "assistant",
                content: persistedContent,
                tokens_used: tokensUsed,
                model: effectiveModel,
                mode,
                metadata: assistantMetadata
                  ? { ...assistantMetadata, credits_used: creditCost }
                  : { credits_used: creditCost },
              },
            ],
            { projectId, label: "chat-turn" },
          );

          if ((mode === "build" || mode === "patch") && (parsedFiles.length > 0 || streamedFilePaths.size > 0)) {
            await recordEditorIntelligenceBuild({
              supabase,
              projectId,
              projectName: projectData?.name ?? null,
              source: "chat",
          mode,
          prompt: costPrompt,
              filesChanged: parsedFiles.length > 0 ? parsedFiles.map((f) => f.path) : Array.from(streamedFilePaths),
              assistantMessageId,
              backendWiring,
              verification,
            });
          }

          const remainingCredits = await settleCreditReservation(
            supabase,
            creditReservation.id,
            creditCost,
          );
          if (remainingCredits == null) {
            throw new Error("Unable to settle reserved credits");
          }
          reservationFinalized = true;

          // Warn user when credits drop low (fire-and-forget)
          const profileEmail = (profile as { email?: string }).email;
          if (remainingCredits <= 10 && remainingCredits > 0 && profileEmail) {
            sendLowCreditsEmail(profileEmail, remainingCredits).catch(() => {});
          }

          // Auto top-up: recharge if balance dropped below user's threshold (fire-and-forget)
          import("@/lib/stripe/auto-topup")
            .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(userId))
            .catch(() => {});

          // Background context summarisation — trigger when total messages > 30 and no recent summary
          // Fire-and-forget: don't await so it doesn't block the response
          ;(async () => {
            try {
              const { count } = await (supabase as any)
                .from("messages")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId);

              const totalMessages = count ?? 0;
              const lastSummaryAt = privateContext?.context_summary_at ?? undefined;
              const hoursSinceSummary = lastSummaryAt
                ? (Date.now() - new Date(lastSummaryAt).getTime()) / 3_600_000
                : Infinity;

              // Summarise if > 30 messages and no summary in last 6 hours
              if (totalMessages > 30 && hoursSinceSummary > 6) {
                const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
                await fetch(`${appUrl}/api/projects/${projectId}/summarise`, {
                  method: "POST",
                  headers: { Cookie: req.headers.get("cookie") ?? "" },
                }).catch(() => {});
              }
            } catch {
              // Silently ignore summarisation errors — not critical
            }
          })();

          // Fire in-app notification when files were generated (non-blocking)
          if (parsedFiles.length > 0 && userId) {
            void (async () => {
              try {
                const admin = await createAdminClient();
                await (admin as any).from("notifications").insert({
                  user_id: userId,
                  type: "ai_done",
                  title: "Build complete ✓",
                  body: `Generated ${parsedFiles.length} file${parsedFiles.length !== 1 ? "s" : ""} in your project`,
                  link: `/editor/${projectId}`,
                  is_read: false,
                });
              } catch { /* non-critical */ }
            })();
          }

          // Build the final files list to send to the client. parsedFiles
          // covers the case where parseAIResponse succeeded. But if the
          // streaming extractor wrote files mid-stream AND parseAIResponse
          // came back empty (rare but possible when the AI's final JSON is
          // malformed at the close), those streamed files would be lost
          // from data.files. Fetch them from DB as a safety net so the
          // client always knows the truth.
          let finalFilesForClient = parsedFiles;
          if (
            mode === "build" &&
            parsedFiles.length === 0 &&
            streamedFilePaths.size > 0
          ) {
            const { data: dbFiles } = await (supabase as any)
              .from("project_files")
              .select("path, content, language")
              .eq("project_id", projectId)
              .in("path", Array.from(streamedFilePaths));
            if (dbFiles) finalFilesForClient = dbFiles as typeof parsedFiles;
          }

          // Send final event (skip SSE when client already left — DB work above still completed)
          if (!isClientGone()) {
            safeEnqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                done: true,
                tokensUsed,
                files: finalFilesForClient,
                creditsUsed: creditCost,
                remainingCredits,
                fileCount: finalFilesForClient.length,
                filesChanged:
                  mode === "patch"
                    ? patchOutcome === "applied"
                    : finalFilesForClient.length > 0 || streamedFilePaths.size > 0,
                changedPaths:
                  mode === "patch" && patchOutcome !== "applied"
                    ? []
                    : finalFilesForClient.length > 0
                      ? finalFilesForClient.map((f) => f.path)
                      : Array.from(streamedFilePaths),
                assistantMessageId,
                snapshot_id: preBuildSnapshotId ?? undefined,
                build_activity: buildActivity ?? undefined,
                backend_wired: backendWiring ?? undefined,
                patch_failed: mode === "patch" && patchOutcome === "failed" ? true : undefined,
                auto_routed: autoRoutedPatch || undefined,
                verification: verification
                  ? {
                      engine: verification.engine,
                      passed: verification.passed,
                      fixesApplied: verification.fixesApplied,
                      errors: verification.errors,
                    }
                  : undefined,
                // Human-readable summary for the chat bubble — without this the
                // client renders the raw JSON blob (escaped \n and all).
                displayMessage:
                  mode === "build" || mode === "patch"
                    ? (() => {
                        if (mode === "patch" && patchOutcome === "failed") {
                          return "I couldn't apply that edit to your files — the preview wasn't changed. Try rephrasing (e.g. \"add About, Services, and Contact links in the header\") or switch to **Build**.";
                        }
                        if (mode === "patch" && finalFilesForClient.length > 0) {
                          const paths = finalFilesForClient.map((f) => f.path).join(", ");
                          return `Updated ${paths}. Preview refreshed.`;
                        }
                        const parsed = parseAIResponse(fullContent);
                        const msg = parsed.message?.trim() ?? "";
                        if (msg && msg !== "Changes applied." && !msg.startsWith("{")) return msg;
                        if (buildIntent) return `${buildIntent.statusLabel.replace(/…$/, "")} — ${parsed.files.length} file${parsed.files.length === 1 ? "" : "s"} generated. Open preview to see the result.`;
                        return msg || "Build complete. Open preview to see the result.";
                      })()
                    : undefined,
              })}\n\n`
              )
            );
          }
          completedNormally = true;
        } catch (error) {
          logger.error("ai.chat.stream_error", error instanceof Error ? error : new Error(String(error)), {
            projectId,
            userId,
            mode,
          });
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`)
          );
        } finally {
          clearInterval(heartbeat);
          // Durability backstop: if the build did NOT complete normally (client/proxy
          // abort, or an error before the save path), persist whatever streamed so an
          // interrupted build never results in "no change". Idempotent; skipped on
          // success so final/verified content is never overwritten by mid-stream text.
          if (!completedNormally && streamedFiles.length > 0) {
            try {
              await (supabase as any).from("project_files").upsert(
                streamedFiles.map((f) => ({ project_id: projectId, path: f.path, content: f.content, language: f.language })),
                { onConflict: "project_id,path" },
              );
            } catch { /* best-effort */ }
          }
          if (!reservationFinalized) {
            try {
              const producedBillableWork =
                tokensUsed > 0 || fullContent.trim().length > 0 || streamedFiles.length > 0;
              if (producedBillableWork) {
                const fallbackCost = Math.min(
                  creditReservation.amount,
                  finalCreditCost ?? creditReservation.amount,
                );
                const remaining = await settleCreditReservation(
                  supabase,
                  creditReservation.id,
                  fallbackCost,
                );
                reservationFinalized = remaining != null;
              } else {
                await cancelCreditReservation(supabase, creditReservation.id);
                reservationFinalized = true;
              }
            } catch (reservationError) {
              // Fail closed: leave the reservation deducted for reconciliation
              // rather than refunding provider work that may already be persisted.
              logger.error(
                "ai.chat.reservation_finalize_failed",
                reservationError instanceof Error ? reservationError : new Error(String(reservationError)),
                { projectId, userId, mode, reservationId: creditReservation.id },
              );
            }
          }
          safeClose();
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}

/** Thin alias for Next route re-export */
export const POST = handleAiChat;
