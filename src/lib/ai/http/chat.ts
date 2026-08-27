import { createAdminClient } from "../../supabase/server.ts";
import { setCorrelation } from "../../observability/correlation.ts";
import { canWriteProjectFiles,getProjectAccess } from "../../project/access.ts";
import { runGenerationStage } from "../chat/generation-service.ts";
import { DEFAULT_CHAT_MODEL } from "../model-defaults.ts";
import { applyModelAdapter } from "../model-catalog.ts";
import { clampHistory } from "../context-clamp.ts";
import {
isCloudProvisioningConfigured,
isUpgradeToFullStackIntent,
promptNeedsRealBackend,
STATIC_BACKEND_GUARD,
UPGRADE_NOT_READY_GUARD,
} from "@/lib/project/generation-profile";
import { sendLowCreditsEmail } from "../../email/resend.ts";
import {
buildReactNativePrompt,
buildProjectContext,
} from "@/lib/ai/system-prompts";
import { CHAT_SYSTEM_PROMPT } from "../prompts/chat.ts";
import { PLAN_SYSTEM_PROMPT } from "../prompts/plan.ts";
import { EDIT_SYSTEM_PROMPT } from "../prompts/edit.ts";
import { buildReactGenerationPrompt } from "../prompts/react-build.ts";
import { buildTanStackGenerationPrompt } from "../prompts/tanstack-build.ts";
import { buildNextGenerationPrompt } from "../prompts/next-build.ts";
import { buildTemplateRefinementBlock } from "../template-refine.ts";
import { pickStarterTemplate } from "../../templates/starter-catalog.ts";
import { buildDesignDirectionBlock } from "../design-directions.ts";
import { classifyBuildIntent,isAppShellAppType,isMajorGreenfieldBuild } from "../build-intent.ts";
import { countUserAuthoredFiles,isGreenfieldProject } from "../scaffold-files.ts";
import { resolvePromptMode } from "../editor-intelligence.ts";
import { assessRequestScope,formatScopeAssessment } from "../scope-guard.ts";
import { applyPatches,collapsePatchResults,parsePatchResponse } from "../patch-applier.ts";
import { buildPersistedAssistantContent } from "../persist-message-mode.ts";
import { persistChatTurnMessages } from "../persist-chat-turn.ts";
import {
detectAppGaps,
extractDecisions,
mergeDecisionsIntoKnowledge,
nextStepsPromptBlock,
renderDecisionsBlock,
} from "../decision-memory.ts";
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
import { parseAIResponse,shouldAutoFix,needsBuildContinuation,detectLanguage,type ParsedFile } from "../code-parser.ts";
import { generationValidationSignature,normalizeGenerationStage,prepareGeneratedFiles,validateGenerationStage } from "../chat/validation-service.ts";
import { StreamingFileExtractor } from "../streaming-file-extractor.ts";
import { logger } from "../../logger.ts";
import { getProjectSchemaContext } from "../../supabase/schema-reader.ts";
import { attachSkillsToPrompt } from "../attach-skills.ts";
import { decideInitiativeRouting } from "../initiative-routing.ts";
import type { SkillMatch } from "../skill-matcher.ts";
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
import {
cancelStageCredits,
claimDailyCredits,
computeCreditCost,
maxCreditCostForMode,
reserveStageCredits,
settleStageCredits,
} from "../chat/accounting-service.ts";
import type { AutoWireResult,SelfVerifyResult } from "./result-types.ts";
import { autoWireAi } from "../auto-wire-ai.ts";
import { selectRelevantFiles } from "../file-selector.ts";
import { buildCompletedBuildActivity } from "../build-activity.ts";
import {
parseCloudToolPermissions,
buildCloudPermissionsPromptBlock,
shouldBlockCloudAction,
} from "@/lib/cloud/permissions";
import { ensureDevCredits,getDevProfile } from "../../dev-credits.ts";
import { detectDeployIntent } from "../deploy-intent.ts";
import { detectCloudIntent } from "../cloud-intent.ts";
import { ENV_FILE_PATH,parseEnvFile } from "../../project/env-file.ts";
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
import { resolveSmartModel } from "../editor-intelligence.ts";
import { commitGenerationStage } from "../chat/commit-service.ts";
import { pushFileToRunningSandbox } from "../../preview/push-to-sandbox.ts";
import { buildStaticGenerationPrompt } from "../prompts/static-build.ts";
import { runRepairStage } from "../chat/repair-service.ts";
import { buildClarificationPrompt,parseClarifyingQuestions } from "../chat/clarification.ts";
import { resolveChatRequestContext } from "../chat/request-context.ts";
import { createStreamSink } from "../chat/sse-stream.ts";
import { createDeployActionResponse } from "../chat/deploy-action.ts";
import { buildControlledTemplatePrompt,resolveControlledTemplate } from "../../templates/controlled-registry.ts";
import { recordGenerationVerification } from "../generation-observability.ts";
import { getCoreLoopPolicy,isCoreLoopRequest } from "../../reliability/core-loop-policy.ts";

// Generation + backend wiring + self-verification can exceed a minute on
// complex builds (Lovable budgets 15 min for agent runs).

// Output token budget for full-app builds. 8000 was too small for multi-file
// generations — the response was cut off mid-JSON and later files (e.g. App.tsx)
// were silently dropped, leaving a placeholder app. Env-overridable.
// Defaults to the prior 32K for zero behavior change; set BUILD_MAX_TOKENS=64000
// to generate complete apps in one pass on Claude/Gemini. provider.ts clamps the
// value down per-model (e.g. to 16K) if the slug falls back to gpt-4o, so raising
// it is always safe.
const BUILD_MAX_TOKENS = Number(process.env.BUILD_MAX_TOKENS) || 40_000;
const CHAT_MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS) || 4096;
// If the model still hits the cap mid-JSON, ask it to continue this many times
// before giving up — guarantees we don't ship a half-generated build.
const BUILD_CONTINUATION_ROUNDS = Number(process.env.BUILD_CONTINUATION_ROUNDS) || 3;

/** Safe SSE enqueue/close — avoids "Controller is already closed" when the client disconnects mid-build. */
export async function handleAiChat(req: Request) {
  try {
    // ── Auth: cookie session OR API key ─────────────────────────────────────
    const requestContext = await resolveChatRequestContext(req);
    if (!requestContext.ok) return requestContext.response;
    const { userId, supabase } = requestContext;

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
      coreLoop: coreLoopValue = false,
    } = body;
    type ChatRouteMode = "chat" | "plan" | "build" | "agent" | "patch";
    let mode: ChatRouteMode = (["chat", "plan", "build", "agent", "patch"] as const).includes(body.mode)
      ? (body.mode as ChatRouteMode)
      : "chat";
    // Phase 0: attach identity to the correlation context so every downstream
    // log line, AI call and sandbox action in this request carries the same
    // project/user without threading ctx through a dozen call sites.
    setCorrelation({ userId, projectId: typeof projectId === "string" ? projectId : undefined });

    const coreLoop = isCoreLoopRequest(coreLoopValue);
    const coreLoopPolicy = getCoreLoopPolicy();
    if (coreLoop) mode = coreLoopPolicy.mode;
    const costPrompt = typeof rawMessage === "string" && rawMessage.trim() ? rawMessage : message;

    // ── Lovable-agent behavior: questions get ANSWERS, not rebuilds ────────
    // In Build mode, "why is the cart empty?" / "explain how auth works" must
    // NOT regenerate the app. Downgrade informational queries to chat (cheaper
    // + prose answer); action requests ("add", "fix", "change"…) still build.
    //
    // Both downgrades are gated on the project containing REAL work, not on it
    // containing files. A new project holds a 25-file scaffold, which used to
    // satisfy `files.length > 0` and `files.length > 8` on the very first
    // message — so a first build could be routed to the surgical patch
    // pipeline and asked to find-and-replace inside a placeholder.
    let autoRoutedPatch = false;
    const hasRealWork = Array.isArray(files) && !isGreenfieldProject(files);
    if (!coreLoop && mode === "build" && body.forceBuild !== true && hasRealWork && typeof message === "string") {
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

    // Mirror the client smart router so Build-tab chit-chat ("hello", "thanks")
    // cannot trigger a full regeneration when the UI still says Build.
    if (!coreLoop && body.forceBuild !== true && typeof persistedUserMessage === "string") {
      const authoredCount = Array.isArray(files) ? countUserAuthoredFiles(files) : 0;
      const resolved = resolvePromptMode(persistedUserMessage, {
        fileCount: authoredCount,
        hasPreviewError: false,
        currentMode:
          mode === "agent" ? "agent" : mode === "plan" ? "plan" : mode === "chat" ? "chat" : "build",
        files: Array.isArray(files) ? files.map((f: { path: string }) => ({ path: f.path })) : undefined,
      });
      if (resolved === "chat" || resolved === "plan") {
        if (mode === "build" || mode === "agent" || mode === "patch") {
          mode = resolved;
          autoRoutedPatch = false;
        }
      }
    }

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
      return createDeployActionResponse({
        req,
        supabase,
        projectId,
        userId,
        persistedUserMessage,
        mode,
      });
    }

    // ── Cloud ops from chat (Lovable parity: pause / resize with approval
    // card). Zero AI cost, zero credits: detect the intent, emit an approval
    // card over SSE, and let the panel call the Cloud APIs after the user
    // approves. Nothing executes without the click.
    if (mode === "chat" || mode === "build") {
      const cloudIntent = detectCloudIntent(persistedUserMessage);
      if (cloudIntent) {
        const { data: cloudProject } = await supabase
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
      await supabase
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
      await supabase
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
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("messages").select("role, content, mode, metadata").eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(40),
      supabase
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
        const { data: managedCredentials } = await admin
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
    // Improvement #7: hard outer clamp — the smart selectors above decide WHAT
    // goes in; this guarantees a selector bug can never blow up the prompt.
    const history = clampHistory(rawHistory.map((m) => ({ role: m.role, content: m.content })));

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

    // ── Scope guard: ask before building something we shouldn't build blind ──
    //
    // Observed in Lovable: given a spec for a 30-subsystem platform pasted into
    // a working site builder, it declined and asked what the user actually
    // wanted. We had no equivalent — every prompt was classified and executed,
    // so the same paste would have started rewriting a working app.
    //
    // This never blocks permanently: `forceBuild` skips it, and the message
    // tells the user so. Placed after the cloud-action block because it follows
    // the same shape — stream one message, charge nothing, return.
    if (!coreLoop && (mode === "build" || mode === "agent") && body.forceBuild !== true && Array.isArray(files)) {
      const assessment = assessRequestScope(costPrompt, {
        userAuthoredFileCount: countUserAuthoredFiles(files),
      });
      if (assessment) {
        const scopeText = formatScopeAssessment(assessment);
        const scopeEncoder = new TextEncoder();
        const scopeStream = new ReadableStream({
          async start(controller) {
            const { safeEnqueue: scopeEnqueue, safeClose: scopeClose } = createStreamSink(
              controller,
              scopeEncoder,
              req.signal,
            );
            scopeEnqueue(scopeEncoder.encode(`data: ${JSON.stringify({ chunk: scopeText })}\n\n`));
            scopeEnqueue(
              scopeEncoder.encode(
                `data: ${JSON.stringify({
                  done: true,
                  tokensUsed: 0,
                  creditsUsed: 0,
                  scope_query: true,
                  scopeConcerns: assessment.concerns.map((c) => c.kind),
                })}\n\n`,
              ),
            );
            scopeClose();
          },
        });
        await persistChatTurnMessages(
          supabase,
          [
            { project_id: projectId, role: "user", content: persistedUserMessage, mode },
            { project_id: projectId, role: "assistant", content: scopeText, mode },
          ],
          { projectId, label: "scope-guard" },
        );
        logger.info?.("ai.chat.scope_query", {
          projectId,
          userId,
          kinds: assessment.concerns.map((c) => c.kind).join(","),
        });
        return new Response(scopeStream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      }
    }

    // Model selection asks "how big is this project", which is a question about
    // the user's work, not about the 25-file scaffold every project ships with.
    const fileCount = Array.isArray(files) ? countUserAuthoredFiles(files) : 0;
    const serverAutoModel = modelManuallySelected === true
      ? model
      : resolveSmartModel(mode, { fileCount, hasPreviewError: false }, costPrompt);
    // Core-loop campaigns pin the model in the request (modelManuallySelected)
    // so a long-lived server with OPENROUTER_CODING_MODEL=qwen cannot silently
    // override the release-gate tier. Without an explicit client model, fall
    // back to getCoreLoopPolicy() (CORE_LOOP_AI_MODEL → … → default).
    const coreLoopModel =
      typeof model === "string" && model.trim() && modelManuallySelected === true
        ? model.trim()
        : coreLoopPolicy.primaryModel;
    const effectiveModel = coreLoop
      ? coreLoopModel
      : resolveBudgetAwareModel({
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

    const runClarifyFirst =
      !coreLoop && mode === "build" && body.forceBuild !== true && clarifyFirst === true;

    // ── Clarify-first (Lovable): questionnaire BEFORE research/subagents/build ──
    if (runClarifyFirst) {
      const clarifyReservation = await reserveStageCredits(supabase, {
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

      const clarifyIntent = classifyBuildIntent(persistedUserMessage);
      const appShell = isAppShellAppType(clarifyIntent.appType);
      const clarifySystemPrompt = buildClarificationPrompt(clarifyIntent.appType, appShell);
      /* Legacy inline prompt retained temporarily for blame context. [
        "You are an expert product designer + software architect asking a user a few quick questions before building, exactly like Lovable's pre-build questionnaire.",
        "Do NOT research, plan implementation, or generate code in this step — ONLY output the JSON question array.",
        "Given a user's build request, generate 1-4 targeted questions only for decisions that materially change the product. Prefer CHOICE questions with 3-5 concrete options.",
        'Return ONLY a JSON array of question objects, no prose, no code fences.',
        'Each object: id (string), question (string), type ("text"|"choice"), kind ("palette"|"typography"|"layout"|"structure"|"database"|"general"), multiple (boolean), options ({label, description, value?}[] for choice).',
        appShell
          ? `This is a ${clarifyIntent.appType} / operations app. Ask kind structure or database questions: which modules to include first (offer 3-4 concrete bundles), authentication (email / OAuth / invite-only), and roles (admin vs staff vs read-only). Do NOT ask marketing palette/hero layout unless they explicitly wanted a public website.`
          : "For NEW WEBSITE/APP builds ask design questions: one palette question (kind palette — each option is a named palette followed by 2-3 hex codes in parentheses), one typography pairing (kind typography), and one homepage layout (kind layout).",
        "For DATABASE/BACKEND-heavy requests add kind database questions: core entities/tables, auth method, roles & permissions.",
        "For connectors/integrations, first determine what the user means. Offer capability choices such as: generated apps access shared real data; each end user connects their own OAuth account; published apps receive a persistent backend/auth; add more AI providers. Use multiple:true when choices can be combined. Give every choice a concise outcome-focused description.",
        "Do not ask about decisions already explicit in the request. Do not ask cosmetic questions for an existing app unless design is ambiguous and requested.",
        "Keep every question short and answerable in one tap.",
        "Respond ONLY with a valid JSON array.",
      ].join("\n"); */

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
            const clarifyResult = await runGenerationStage(
              {
                model: DEFAULT_CHAT_MODEL,
                messages: [
                  { role: "system", content: clarifySystemPrompt },
                  {
                    role: "user",
                    content:
                      `Build request: ${persistedUserMessage}\n` +
                      `Detected app type: ${clarifyIntent.appType}\n` +
                      `User-authored files so far: ${fileCount} (0 = brand-new project).`,
                  },
                ],
                maxTokens: 800,
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
            const remaining = await settleStageCredits(
              supabase,
              clarifyReservation.id,
              clarifyCost,
            );
            if (remaining == null) throw new Error("Unable to settle clarification credits");
            reservationFinalized = true;

            const questions = parseClarifyingQuestions(questionsJson);
            /* Legacy parser retained temporarily for blame context.
            try {
              const parsed: unknown = JSON.parse(questionsJson);
              if (Array.isArray(parsed)) {
                questions = parsed;
              } else if (parsed && typeof parsed === "object") {
                const arr = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
                if (arr) questions = arr as unknown[];
              }
            } catch { questions = []; }
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
                        ? (() => {
                            const option = o as Record<string, unknown>;
                            const label = [option.label, option.text, option.value].find(
                              (v): v is string => typeof v === "string" && v.trim() !== "",
                            );
                            return label ? {
                              label: label.trim(),
                              ...(typeof option.description === "string" && option.description.trim()
                                ? { description: option.description.trim() }
                                : {}),
                              ...(typeof option.value === "string" && option.value.trim()
                                ? { value: option.value.trim() }
                                : {}),
                            } : undefined;
                          })()
                        : undefined,
                  )
                  .filter((option): option is string | { label: string; description?: string; value?: string } =>
                    typeof option === "string" ? option.trim() !== "" : !!option,
                  );
                return {
                  id: typeof r.id === "string" ? r.id : `q${i + 1}`,
                  question: text.trim(),
                  type: options.length > 0 ? "choice" : "text",
                  kind: typeof r.kind === "string" ? r.kind : "general",
                  multiple: r.multiple === true,
                  ...(options.length > 0 ? { options } : {}),
                };
              })
              .filter((q): q is NonNullable<typeof q> => q !== null); */

            const qPayload = JSON.stringify({
              clarifying_questions: questions,
              originalPrompt: message,
              creditsUsed: clarifyCost,
              remainingCredits: remaining,
              done: true,
              tokensUsed: clarifyResult.tokensUsed,
            });
            clarifyEnqueue(clarifyEncoder.encode(`data: ${qPayload}\n\n`));
          } catch {
            if (!reservationFinalized) {
              try {
                if (questionsJson.trim()) {
                  await settleStageCredits(
                    supabase,
                    clarifyReservation.id,
                    clarifyReservation.amount,
                  );
                } else {
                  await cancelStageCredits(supabase, clarifyReservation.id);
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
            clarifyEnqueue(clarifyEncoder.encode(`data: ${errPayload}\n\n`));
          } finally {
            clarifyClose();
          }
        },
      });
      return new Response(clarifyStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    // Build system prompt based on mode + framework
    // Chat/plan modes get full codebase context (up to 60k chars); build mode embeds up to 80k.
    let systemPrompt: string;
    if (mode === "build") {
      // Route to the right generator based on target framework
      // Proactive gap scan (rule-based, free): hands the model concrete gaps
      // in the CURRENT app so it volunteers "suggested next steps".
      const gapsBlock = nextStepsPromptBlock(
        detectAppGaps(files as Array<{ path: string; content?: string | null }>),
      );
      const suffix = schemaBlock + summaryBlock + fileChangesBlock + editorIntelligenceContext + workspaceKnowledgeBlock + knowledgeBlock + gapsBlock;
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
      // Static → full-stack upgrade path: "upgrade to full-stack" on a static
      // project converts it to TanStack Start for this and future builds.
      let effectiveFramework = framework;
      let upgradeNotReady = false;
      if (framework === "static" && isUpgradeToFullStackIntent(message)) {
        if (isCloudProvisioningConfigured()) {
          effectiveFramework = "tanstack-start";
          try {
            await supabase
              .from("projects")
              .update({ framework: "tanstack-start", runtime: "framework" })
              .eq("id", projectId);
          } catch { /* best-effort — the build itself still upgrades */ }
        } else {
          // Provisioning env not ready (SUPABASE_ORG_ID missing): converting
          // would produce a TanStack app whose backend never connects — a
          // broken app for a client. Stay static and explain instead.
          upgradeNotReady = true;
        }
      }
      if (effectiveFramework === "static") {
        systemPrompt = buildStaticGenerationPrompt(message, contextFiles, buildContextBudget) + suffix;
        if (upgradeNotReady) {
          systemPrompt += UPGRADE_NOT_READY_GUARD;
        } else if (promptNeedsRealBackend(message)) {
          // Never fake auth/payments/db in a static app — explain the upgrade.
          systemPrompt += STATIC_BACKEND_GUARD;
        }
      } else if (effectiveFramework === "react-native") {
        systemPrompt = buildReactNativePrompt(message, contextFiles, buildContextBudget) + suffix;
      } else if (effectiveFramework === "nextjs" || effectiveFramework === "next") {
        // SSR-first Next.js App Router — proper generateMetadata, Server Components.
        // Projects store "next" (FRAMEWORKS picker) while GitHub import detection
        // returns "nextjs" — accept both.
        systemPrompt = buildNextGenerationPrompt(message, contextFiles, buildContextBudget) + suffix;
      } else {
        // Pass the framework so the prompt ships ONE contract — the TanStack
        // blueprint for tanstack-start, the Vite rules for react/vue/svelte.
        systemPrompt = (effectiveFramework === "tanstack-start" || effectiveFramework === "tanstack"
          ? buildTanStackGenerationPrompt(message, contextFiles, buildContextBudget)
          : buildReactGenerationPrompt(message, contextFiles, buildContextBudget, effectiveFramework)) + suffix;
      }
      systemPrompt += buildControlledTemplatePrompt(resolveControlledTemplate(message, effectiveFramework));
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
      //
      // `isGreenfieldProject`, NOT `files.length === 0`. Projects are created
      // with a 25-file scaffold already in them, so the length test has been
      // false on every first build since scaffolding was introduced — which
      // silently skipped both the starter template AND the design baseline for
      // exactly the request that needed them most.
      const greenfield = isGreenfieldProject(files);
      const greenfieldIntent = greenfield ? classifyBuildIntent(message) : null;
      const autoTemplateId =
        templateId ?? (greenfield ? pickStarterTemplate(message) : null);
      if (autoTemplateId) {
        systemPrompt += buildTemplateRefinementBlock(autoTemplateId);
      } else if (
        (greenfield || isRestyleRequest) &&
        !(greenfieldIntent && isAppShellAppType(greenfieldIntent.appType))
      ) {
        systemPrompt += buildDesignDirectionBlock(message);
      }

      // ── Incremental edit safety (Lovable-style preservation) ────────────────
      // On a follow-up build (project already has REAL work in it), this is an
      // EDIT, not a from-scratch rebuild. Without this, a full regeneration
      // silently drops prior work — most painfully replacing real image URLs
      // with placeholder icons. Instruct the model to preserve everything it
      // isn't asked to change.
      //
      // The condition was `files.length > 0`, and that is the bug a customer
      // reported as "I say hi and it never builds". Every project is born with
      // a 25-file scaffold, so this branch fired on the FIRST message of every
      // new project: the model was told, in capitals, "this is an edit to an
      // EXISTING app, not a rebuild… return ONLY the files you actually change…
      // keep existing copy, data, routes and component structure". Asked to
      // edit a placeholder it had never seen a request for, it correctly
      // concluded there was nothing to change and returned prose. The format
      // retry then failed too, and the customer got "No files generated".
      //
      // Nothing was broken downstream. The model did as it was told.
      if (!greenfield) {
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
      systemPrompt = EDIT_SYSTEM_PROMPT + editorIntelligenceContext + workspaceKnowledgeBlock + knowledgeBlock;
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
      const { data: envRow } = await supabase
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
      const { data: dsLinks } = await supabase
        .from("project_design_systems")
        .select("source_project_id, priority, enabled")
        .eq("consumer_project_id", projectId)
        .eq("enabled", true)
        .order("priority", { ascending: true });
      const sourceIds = (dsLinks ?? []).map((l: any) => l.source_project_id);
      if (sourceIds.length > 0) {
        const { data: dsFiles } = await supabase
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
        const { data: findings } = await supabase
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
            // No onStep callback on purpose. This fan-out runs BEFORE the
            // response stream is created, so there is no sink to enqueue into
            // yet. The callback that used to be here referenced `safeEnqueue`,
            // which is not bound until the ReadableStream opens further down —
            // so it threw ReferenceError on the FIRST assignment, inside the
            // try below, and every build silently fell back to the keyword
            // scan. Parallel subagents never ran once in production.
            //
            // Nothing is lost by dropping it: the steps reach the client
            // anyway, replayed from `subagentSteps` the moment the stream opens.
            const fanout = await runParallelSubagents(
              assignments,
              { projectId, userId },
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

    const reservationAmount = maxCreditCostForMode(mode);
    const creditReservation = await reserveStageCredits(supabase, {
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
        // Keep streamed files in memory for progress and billing only. Canonical
        // project_files are written only after the complete response parses and
        // passes deterministic validation; an interrupted generation changes no
        // source files.
        const streamedFiles: Array<{ path: string; content: string; language: string }> = [];
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
              fileCount: Array.isArray(files) ? countUserAuthoredFiles(files) : 0,
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

        // Loaded once before streaming so every preview notification uses the
        // same deterministic sanitizer as the final authoritative save.
        const { sanitizeGeneratedFile: sanitizeStreamedFile } = await import(
          "@/lib/ai/html-sanity"
        );

        // In build mode, stream file-complete notifications without mutating DB.
        const fileExtractor = mode === "build"
          ? new StreamingFileExtractor((file) => {
              if (streamedFilePaths.has(file.path)) return; // dedupe
              streamedFilePaths.add(file.path);
              // Sanitize HERE too, not only in the final loop. The extractor
              // emits a file the moment its closing delimiter arrives, and a
              // continuation round can append a SECOND full document to an
              // html file — observed corruption in the wild. Writing the raw
              // text mid-stream meant the preview picked up the doubled
              // version and rendered it, seconds before the final pass fixed
              // the row. Sanitizing both places keeps the DB and the preview
              // honest at every instant, not just at the end.
              const safeContent = sanitizeStreamedFile(file.path, file.content);
              streamedFiles.push({ path: file.path, content: safeContent, language: file.language });
              // Notify client that a file is available early
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ streamedFile: file.path })}\n\n`)
              );
            })
          : null;

        try {
          const result = await runGenerationStage(
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
            const contCap = isMajorGreenfieldBuild(message, fileCount)
              ? Math.max(BUILD_CONTINUATION_ROUNDS, 5)
              : BUILD_CONTINUATION_ROUNDS;
            while (
              needsBuildContinuation(fullContent) &&
              contRounds < contCap
            ) {
              contRounds++;
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ status: "continuing", message: `Response was long — continuing generation (${contRounds}/${contCap})…` })}\n\n`)
              );
              let contChunk = "";
              try {
                await runGenerationStage({
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
          let stagedVerification: SelfVerifyResult | null = null;
          let preCommitRevision: number | null = null;
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
                await runGenerationStage({
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
                await supabase.from("project_files").upsert({
                  project_id: projectId, path: pr.path, content: pr.content, language: langMap[lang] ?? lang,
                }, { onConflict: "project_id,path" });
                // Reach the RUNNING preview container too — a DB-only save
                // leaves the sandbox serving the pre-patch file until the
                // container is recreated (observed stale-preview bug).
                pushFileToRunningSandbox(supabase, projectId, pr.path, pr.content);
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

            const normalizeBuildCandidate = (candidate: ParsedFile[]): ParsedFile[] => {
              if (mode !== "build" || candidate.length === 0) {
                return prepareGeneratedFiles(candidate, existingFiles);
              }
              const normalized = normalizeGenerationStage(candidate, existingFiles, {
                prompt: costPrompt,
                framework,
                appType: buildIntent?.appType,
                brand: projectData?.name ?? undefined,
              });
              if (normalized.alignedDependencies.length > 0) {
                logger.info("ai.chat.package_pins_aligned", {
                  projectId,
                  changed: normalized.alignedDependencies,
                });
              }
              if (normalized.controlledDependencies.length > 0) {
                logger.info("ai.chat.controlled_dependency_lock", {
                  projectId,
                  template: normalized.controlledTemplate,
                  changed: normalized.controlledDependencies,
                });
              }
              return normalized.files;
            };

            let finalFiles = normalizeBuildCandidate(parsed.files);

            // ── Validation pass (up to 3 enrichment rounds on large greenfield) ─
            if (finalFiles.length > 0) {
              const maxEnrichPasses = isMajorGreenfieldBuild(message, fileCount) ? 3 : 2;
              let previousValidationSignature: string | null = null;
              for (let enrichPass = 0; enrichPass < maxEnrichPasses; enrichPass++) {
                const {
                  validationErrors,
                  needsEnrichment,
                } = validateGenerationStage(finalFiles, existingFiles, {
                  minFiles: buildIntent?.minFiles,
                  appType: buildIntent?.appType,
                  singlePage: buildIntent?.singlePage,
                });

                if (!shouldAutoFix(validationErrors) || validationErrors.length === 0) {
                  break;
                }

                const validationSignature = generationValidationSignature(validationErrors);
                if (validationSignature === previousValidationSignature) {
                  logger.warn("ai.chat.autofix_stalled", {
                    projectId,
                    pass: enrichPass + 1,
                    errorCount: validationErrors.length,
                    errors: validationErrors.map((error) => error.message),
                  });
                  break;
                }
                previousValidationSignature = validationSignature;

                usedAutoFix = true;
                const statusMsg =
                  enrichPass === 0
                    ? `Auto-fixing ${validationErrors.length} issue(s)…`
                    : `Expanding build — ${validationErrors.length} completeness issue(s) remain…`;
                safeEnqueue(
                  encoder.encode(`data: ${JSON.stringify({ status: "fixing", message: statusMsg })}\n\n`),
                );

                logger.info("ai.chat.autofix", {
                  projectId,
                  pass: enrichPass + 1,
                  errorCount: validationErrors.length,
                  errors: validationErrors.map((e) => e.message),
                });

                try {
                  const repaired = await runRepairStage({
                    files: finalFiles,
                    existingFiles,
                    errors: validationErrors.map((error) => error.message),
                    blueprint: buildIntent?.blueprint,
                    needsEnrichment,
                    majorGreenfield: isMajorGreenfieldBuild(message, fileCount),
                    simpleEconomyRequest,
                    round: enrichPass,
                    maxTokens: outputMaxTokens,
                    projectId,
                    userId,
                  });
                  if (!repaired) break;
                  finalFiles = normalizeBuildCandidate(repaired.files);
                  tokensUsed += repaired.tokenEstimate;
                } catch (fixErr) {
                  logger.warn("ai.chat.autofix_failed", { projectId, error: String(fixErr) });
                  break;
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
                await runGenerationStage({
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
                  finalFiles = normalizeBuildCandidate(retryParsed.files);
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
            // Re-run the idempotent platform-owned normalizer after the final
            // model pass. It also ran before every validation pass so package
            // and support-file defects never consumed an AI repair round.
            if (mode === "build" && finalFiles.length > 0) {
              finalFiles = normalizeBuildCandidate(finalFiles);
            }

            // Never activate a knowingly invalid major/core-loop generation.
            // This final gate also covers the zero-file format-retry path.
            if (
              mode === "build" &&
              finalFiles.length > 0 &&
              (coreLoop || isMajorGreenfieldBuild(message, fileCount))
            ) {
              const remaining = validateGenerationStage(finalFiles, existingFiles, {
                minFiles: buildIntent?.minFiles,
                appType: buildIntent?.appType,
                singlePage: buildIntent?.singlePage,
              }).validationErrors.filter((error) => error.severity === "error");
              if (remaining.length > 0) {
                throw new Error(
                  `Generation contract remained invalid after bounded repair: ${remaining
                    .slice(0, 5)
                    .map((error) => error.message)
                    .join(" | ")}`,
                );
              }
            }

            parsedFiles = finalFiles;

            // ── Save files to DB ──────────────────────────────────────────
            if (parsedFiles.length > 0) {
              // Auto-snapshot current state before overwriting
              const { data: currentFiles } = await supabase
                .from("project_files")
                .select("path, content, language")
                .eq("project_id", projectId);
              const { data: revisionRow } = await supabase
                .from("projects")
                .select("generation_revision")
                .eq("id", projectId)
                .single();
              preCommitRevision = Number((revisionRow as { generation_revision?: number } | null)?.generation_revision ?? 0);

              // Deterministic edits are part of the same staged candidate as
              // model-generated files. They must never bypass verification or
              // create a second, partially committed revision.
              if (isMenuNavEditIntent(costPrompt)) {
                const workingNavFiles = new Map<string, { path: string; content: string }>();
                for (const file of (currentFiles ?? []) as Array<{ path: string; content: string }>) {
                  workingNavFiles.set(file.path, file);
                }
                for (const file of parsedFiles) workingNavFiles.set(file.path, file);
                const menuPatches = buildDeterministicMenuPatches(costPrompt, Array.from(workingNavFiles.values()));
                const menuResults = collapsePatchResults(applyPatches(menuPatches, Array.from(workingNavFiles.values())));
                for (const result of menuResults) {
                  if (!result.applied) continue;
                  const extension = result.path.split(".").pop()?.toLowerCase() ?? "text";
                  const language = ({
                    ts: "typescript", tsx: "typescript", js: "javascript",
                    jsx: "javascript", css: "css", html: "html", json: "json", md: "markdown",
                  } as Record<string, string>)[extension] ?? extension;
                  const index = parsedFiles.findIndex((file) => file.path === result.path);
                  const staged = { path: result.path, content: result.content, language };
                  if (index >= 0) parsedFiles[index] = staged;
                  else parsedFiles.push(staged);
                }
                if (menuPatches.length > 0) {
                  logger.info("ai.chat.build_deterministic_menu_staged", {
                    projectId,
                    paths: menuPatches.map((patch) => patch.path),
                  });
                }
              }

              // Verify a complete candidate in memory BEFORE canonical files
              // are changed. A failed candidate is recorded by the stream but
              // never replaces the last working revision.
              const candidateByPath = new Map<string, { path: string; content: string; language: string }>();
              for (const file of (currentFiles ?? []) as Array<{ path: string; content: string; language: string }>) {
                candidateByPath.set(file.path, file);
              }
              for (const file of parsedFiles) {
                candidateByPath.set(file.path, { path: file.path, content: file.content, language: file.language });
              }
              const { runSelfVerification } = await import("@/lib/ai/self-verify");
              stagedVerification = await runSelfVerification({
                supabase,
                projectId,
                userId,
                candidateFiles: Array.from(candidateByPath.values()) as unknown as import("@/types/database").ProjectFile[],
                persistFixes: false,
                maxRounds: coreLoop ? coreLoopPolicy.maxAutomaticRepairRounds : undefined,
                emit: (status) => safeEnqueue(encoder.encode(`data: ${JSON.stringify({ verify_status: status })}\n\n`)),
              });
              if (!stagedVerification?.passed) {
                const reason = stagedVerification?.errors[0] ?? "candidate verification could not complete";
                try {
                  // Record what was ACTUALLY rendered and rejected, not just the
                  // pre-repair generator output. self-verify's repair ladder
                  // (round 0 DEFAULT_CODING_MODEL, round 1 ESCALATION_MODEL) can
                  // rewrite files between the original candidate and the final
                  // failing render — stagedVerification.fixedFiles accumulates
                  // every repair round's applied writes, in order, so overlaying
                  // it on the original candidate reconstructs the exact file set
                  // the last (failing) render actually saw. Logging parsedFiles
                  // alone left this audit trail showing stale, already-superseded
                  // content whenever a repair round had run — undiagnosable from
                  // the DB alone.
                  const finalByPath = new Map(candidateByPath);
                  for (const fixed of stagedVerification?.fixedFiles ?? []) {
                    finalByPath.set(fixed.path, fixed);
                  }
                  // Supabase's rpc() builder is thenable but not a real Promise —
                  // chaining .catch() directly threw "is not a function" and
                  // crashed the stream after verification (same fix as agent.ts).
                  await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> })
                    .rpc("record_failed_generation", {
                      target_project_id: projectId,
                      run_source: "chat",
                      staged_files: Array.from(finalByPath.values()),
                      failure_message: reason,
                    });
                } catch { /* best-effort logging only */ }
                // Staged verify exists to protect a working revision. Soft-fail when:
                // - true greenfield (no files yet), or
                // - core-loop campaigns (projects often ship a scaffold so
                //   currentFiles.length > 0 even on the first real build, and
                //   hard-blocking zeros fileCount for the release gate).
                const protectWorkingApp = (currentFiles?.length ?? 0) > 0 && !coreLoop;
                if (protectWorkingApp) {
                  throw new Error(`Verification blocked this generation before it replaced your working app: ${reason}`);
                }
                logger.warn("ai.chat.greenfield_verification_soft_fail", {
                  projectId,
                  coreLoop: !!coreLoop,
                  reason,
                });
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                  verify_status: `Verification warnings on first build (continuing): ${reason}`,
                })}\n\n`));
              }
              for (const fixed of stagedVerification?.fixedFiles ?? []) {
                const existing = parsedFiles.findIndex((file) => file.path === fixed.path);
                if (existing >= 0) parsedFiles[existing] = { ...parsedFiles[existing], content: fixed.content };
                else parsedFiles.push({ path: fixed.path, content: fixed.content, language: fixed.language });
              }

              if (currentFiles && currentFiles.length > 0) {
                try {
                  const { data: preSnap } = await supabase
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
                await supabase
                  .from("projects")
                  .update({ metadata: { ...prevMeta, decision_log: nextLog } as unknown as import("@/types/database").Json })
                  .eq("id", projectId);
              } catch { /* best-effort — never fail the build */ }

              // Persist the complete validated generation in one batch. No
              // streamed fragment reaches canonical project_files, so parse,
              // continuation, or disconnect failures leave the prior project
              // intact instead of producing a half-updated application.
              parsedFiles = await commitGenerationStage(
                supabase,
                projectId,
                parsedFiles,
              );

            }
          }

          // ── Lovable parity: backend auto-wiring + self-verification ────────
          // Both run inside the stream so the user sees live progress; both
          // are best-effort and never fail the build.
          let backendWiring: AutoWireResult | null = null;
          let verification: SelfVerifyResult | null = stagedVerification;
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
              // Candidate verification already ran bounded repair rounds before
              // commit. This post-commit pass is health confirmation only.
              const { runSelfVerification } = await import("@/lib/ai/self-verify");
              verification = await runSelfVerification({
                supabase,
                projectId,
                userId,
                emit: emitStatus("verify_status"),
                maxRounds: stagedVerification ? 0 : verifyOnlyFastLane ? 0 : undefined,
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

            // A candidate passed isolated checks but failed after activation
            // (for example environment-specific startup). Restore the exact
            // pre-generation snapshot automatically and report the failure.
            // Core-loop campaigns soft-fail staged verify on purpose; rolling
            // back here would zero fileCount and make the release gate lie.
            if (verification && !verification.passed && preCommitRevision !== null && !coreLoop) {
              const { data: activeRevision } = await supabase
                .from("projects")
                .select("generation_revision")
                .eq("id", projectId)
                .single();
              const expectedRevision = Number((activeRevision as { generation_revision?: number } | null)?.generation_revision);
              if (Number.isSafeInteger(expectedRevision)) {
                const { error: rollbackError } = await (supabase as unknown as {
                  rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
                }).rpc("rollback_generation_revision", {
                  target_project_id: projectId,
                  target_revision: preCommitRevision,
                  expected_revision: expectedRevision,
                });
                if (!rollbackError) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                    verify_status: "Verification failed after activation. Restored the last working revision.",
                    auto_rolled_back: true,
                  })}\n\n`));
                  parsedFiles = [];
                }
              }
            }
            await recordGenerationVerification(
              supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> },
              projectId,
              resolveControlledTemplate(message, framework),
              verification,
              verification?.passed ? "verification" : "post-activation",
            );
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

            // Decision memory (long-horizon consistency): deterministically
            // extract the project's established decisions from the post-build
            // file set and merge them into project knowledge, which every
            // future prompt already injects as "always follow these". Best
            // effort — a failure here must never fail the build.
            try {
              const existingFiles = (files as Array<{ path: string; content?: string | null }>) ?? [];
              const byPath = new Map(existingFiles.map((f) => [f.path, f] as const));
              for (const f of parsedFiles) byPath.set(f.path, { path: f.path, content: f.content });
              const decisions = extractDecisions(Array.from(byPath.values()), framework);
              const block = renderDecisionsBlock(decisions);
              const currentKnowledge = projectData?.knowledge ?? "";
              const nextKnowledge = mergeDecisionsIntoKnowledge(currentKnowledge, block);
              if (nextKnowledge.trim() !== currentKnowledge.trim()) {
                await supabase
                  .from("projects")
                  .update({ knowledge: nextKnowledge } as never)
                  .eq("id", projectId);
              }
            } catch (memoryErr) {
              logger.warn("decision-memory update skipped", { error: String(memoryErr) });
            }
          }

          // By this point the build has already run to completion and its
          // files are persisted — everything below is billing/notification
          // housekeeping. It used to share the outer try/catch, so a transient
          // hiccup in settling the credit reservation (an RPC blip, or the
          // reservation racing itself) propagated to the top-level catch and
          // sent the client the same `{error}` SSE payload used for a build
          // that never ran — the chat thread then showed "The request failed,
          // so no changes were made" directly under a build that, on
          // inspection, fully succeeded. Settling is scoped to its own
          // try/catch so a failure here is logged and reconciled by the
          // `finally` block's fallback settlement (`reservationFinalized`
          // stays false) instead of overwriting a real success with a false
          // failure. `profile.credits` (captured before this reservation was
          // taken) is used as an approximate fallback balance for the "done"
          // event the client actually reads.
          let remainingCredits: number;
          try {
            const settled = await settleStageCredits(
              supabase,
              creditReservation.id,
              creditCost,
            );
            if (settled == null) throw new Error("Unable to settle reserved credits");
            remainingCredits = settled;
            reservationFinalized = true;
          } catch (settleErr) {
            logger.error(
              "ai.chat.settle_credits_failed",
              settleErr instanceof Error ? settleErr : new Error(String(settleErr)),
              { projectId, userId, mode, reservationId: creditReservation.id },
            );
            remainingCredits = typeof profile?.credits === "number"
              ? Math.max(0, profile.credits - creditCost)
              : 0;
          }

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
              const { count } = await supabase
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
                await admin.from("notifications").insert({
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
            const { data: dbFiles } = await supabase
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
          if (!reservationFinalized) {
            try {
              const producedBillableWork =
                tokensUsed > 0 || fullContent.trim().length > 0 || streamedFiles.length > 0;
              if (producedBillableWork) {
                const fallbackCost = Math.min(
                  creditReservation.amount,
                  finalCreditCost ?? creditReservation.amount,
                );
                const remaining = await settleStageCredits(
                  supabase,
                  creditReservation.id,
                  fallbackCost,
                );
                reservationFinalized = remaining != null;
              } else {
                await cancelStageCredits(supabase, creditReservation.id);
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
