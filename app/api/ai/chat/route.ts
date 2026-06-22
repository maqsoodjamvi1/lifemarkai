import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
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
import { applyPatches, parsePatchResponse } from "@/lib/ai/patch-applier";
import { parseAIResponse, validateGeneratedFiles, assessGenerationQuality, shouldAutoFix, needsBuildContinuation, type ParsedFile } from "@/lib/ai/code-parser";
import { StreamingFileExtractor } from "@/lib/ai/streaming-file-extractor";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateApiKey } from "@/app/api/keys/route";
import { logger } from "@/lib/logger";
import { getProjectSchemaContext } from "@/lib/supabase/schema-reader";
import { attachSkillsToPrompt } from "@/lib/ai/attach-skills";
import type { SkillMatch } from "@/lib/ai/skill-matcher";
import { shouldUseSubagents, runSubagentInvestigation, type SubagentStep } from "@/lib/ai/subagents";
import { computeCreditCost } from "@/lib/ai/credit-cost";
import { claimDailyCredits } from "@/lib/credits";
import { autoWireBackend, type AutoWireResult } from "@/lib/cloud/auto-wire";
import { runSelfVerification, type SelfVerifyResult } from "@/lib/ai/self-verify";
import { buildCompletedBuildActivity } from "@/lib/ai/build-activity";
import {
  parseCloudToolPermissions,
  buildCloudPermissionsPromptBlock,
  shouldBlockCloudAction,
} from "@/lib/cloud/permissions";
import { ensureDevCredits, getDevProfile } from "@/lib/dev-credits";
import { buildMcpContextBlock } from "@/lib/ai/mcp-context";
import { ENV_FILE_PATH, parseEnvFile } from "@/lib/project/env-file";

export const runtime = "nodejs";
// Generation + backend wiring + self-verification can exceed a minute on
// complex builds (Lovable budgets 15 min for agent runs).
export const maxDuration = 300;

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

export async function POST(req: NextRequest) {
  try {
    // ── Auth: cookie session OR API key ─────────────────────────────────────
    let userId: string;
    const apiKeyHeader = req.headers.get("x-lifemark-api-key");

    if (apiKeyHeader) {
      const result = await validateApiKey(apiKeyHeader);
      if (!result) return NextResponse.json({ error: "Invalid or expired API key" }, { status: 401 });
      if (!result.scopes.includes("ai:chat")) {
        return NextResponse.json({ error: "API key missing ai:chat scope" }, { status: 403 });
      }
      userId = result.userId;
    } else {
      const supabase = await createClient();
      const { user } = await getServerUser(supabase);
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;
    }

    const supabase = apiKeyHeader ? await createAdminClient() : await createClient();

    // Rate limiting
    const rl = await rateLimitAsync(userId, RATE_LIMITS.ai);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait before sending another message." },
        { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
      );
    }

    const body = await req.json();
    const {
      projectId,
      message,
      mode = "chat",
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
    } = body;

    // Input validation
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > 16000) {
      return NextResponse.json({ error: "Message too long (max 16,000 characters)" }, { status: 400 });
    }
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }
    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 5MB)" }, { status: 413 });
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
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const cloudPermissionsRaw = (
      await (supabase as any)
        .from("profiles")
        .select("cloud_tool_permissions")
        .eq("id", userId)
        .maybeSingle()
    ).data?.cloud_tool_permissions;

    // Fetch project knowledge + recent messages + DB schema in parallel
    const [projectRes, recentMessagesRes, schemaContext] = await Promise.all([
      // select("*") — NOT an explicit column list: cloud_* columns arrive with
      // migration 064 and an explicit list would make this query fail (and
      // degrade chat) on databases that haven't run it yet.
      (supabase as any).from("projects").select("*").eq("id", projectId).single(),
      (supabase as any).from("messages").select("role, content, mode, metadata").eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(40),
      // Schema reading is best-effort — never blocks the response
      getProjectSchemaContext(projectSupabaseUrl, projectServiceKey).catch(() => ""),
    ]);

    // Cloud-managed backend (migration 064): when the project has a dedicated
    // Supabase backend and the client didn't supply integration credentials,
    // read the schema context from the managed backend server-side.
    let cloudSchemaContext = schemaContext;
    const cloudCreds = projectRes.data as { cloud_supabase_url?: string | null; cloud_service_key?: string | null } | null;
    if (!cloudSchemaContext && cloudCreds?.cloud_supabase_url && cloudCreds?.cloud_service_key) {
      cloudSchemaContext = await getProjectSchemaContext(
        cloudCreds.cloud_supabase_url,
        cloudCreds.cloud_service_key
      ).catch(() => "");
    }

    // Test/Live environments (migration 046): when the project is Live, block
    // code-writing modes so production isn't changed accidentally (Lovable
    // behaviour). Read-only chat/plan conversations stay allowed.
    const projectEnvironment = (projectRes.data as { environment?: string } | null)?.environment;
    if (projectEnvironment === "live" && mode !== "chat" && mode !== "plan") {
      return NextResponse.json(
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
      metadata?: Record<string, unknown> | null;
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
    const contextSummary = (projectData?.metadata as Record<string, unknown> | null)?.context_summary as string | undefined;
    const summaryCovers = (projectData?.metadata as Record<string, unknown> | null)?.context_summary_covers as number | undefined;
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
      await (supabase as any).from("messages").insert([
        { project_id: projectId, role: "user", content: message, mode },
        { project_id: projectId, role: "assistant", content: blockText, mode },
      ]);
      return new Response(blockStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    // Build system prompt based on mode + framework
    // Chat/plan modes get full codebase context (up to 60k chars); build mode embeds up to 80k.
    let systemPrompt: string;
    if (mode === "build") {
      // Route to the right generator based on target framework
      const suffix = schemaBlock + summaryBlock + fileChangesBlock + workspaceKnowledgeBlock + knowledgeBlock;
      if (framework === "react-native") {
        systemPrompt = buildReactNativePrompt(message, files) + suffix;
      } else if (framework === "nextjs") {
        // SSR-first Next.js App Router — proper generateMetadata, Server Components
        systemPrompt = buildNextJSPrompt(message, files) + suffix;
      } else {
        systemPrompt = buildGenerationPrompt(message, files) + suffix;
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
          `\n\n---\n# INCREMENTAL EDIT — preserve existing work\n` +
          `This is an edit to an EXISTING app, not a rebuild. Strict rules:\n` +
          `- Change ONLY what the user asked for; return all other files and content exactly as they already are.\n` +
          `- PRESERVE every real asset URL already in the project (img src, background-image, logos, og images, any https image URL). NEVER swap a real image for a placeholder, emoji, icon-font glyph, gradient, or solid color.\n` +
          `- Keep existing copy, data, routes, and component structure unless the request specifically requires changing them.\n` +
          `- If the request is a restyle, change colors / typography / spacing / layout / theme, but keep the SAME content and the SAME real images.\n` +
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
      systemPrompt = PATCH_SYSTEM_PROMPT + workspaceKnowledgeBlock + knowledgeBlock;
      const patchContext = buildProjectContext(files, 40000, message);
      if (patchContext) systemPrompt += `\n\n${patchContext}`;
      systemPrompt += schemaBlock;
    } else if (mode === "plan") {
      systemPrompt = PLAN_SYSTEM_PROMPT + summaryBlock + fileChangesBlock + workspaceKnowledgeBlock + knowledgeBlock;
      // Inject a compact codebase snapshot for plan mode so AI knows what already exists
      const planContext = buildProjectContext(files, 30000, message);
      if (planContext) systemPrompt += `\n\n${planContext}`;
      systemPrompt += schemaBlock;
    } else {
      systemPrompt = CHAT_SYSTEM_PROMPT;
      // Full codebase injection for chat mode — 60k char budget; BM25-rank by user message
      const projectContext = buildProjectContext(files, 60000, message);
      if (projectContext) systemPrompt += `\n\n${projectContext}`;
      systemPrompt += schemaBlock + summaryBlock + fileChangesBlock + workspaceKnowledgeBlock + knowledgeBlock;
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
      systemPrompt += `\n\n---\n# Connected Backend (Lifemark Cloud)\nThis project has a managed Supabase backend${credsReady ? ` at ${backendCreds.cloud_supabase_url}` : " (still provisioning — credentials connect automatically)"}.\nRules:\n- Use the shared client: \`import { supabase } from "./lib/supabase"\` (src/lib/supabase.ts — auto-scaffolded; never create another client or hardcode keys).\n- Credentials live in .env.local as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — already configured, do not ask the user for them.\n- Auth: use supabase.auth (signUp, signInWithPassword, signOut, onAuthStateChange).\n- Database schema changes: write SQL files at supabase/migrations/NNN_description.sql — they are applied to the backend automatically after the build.\n- Always enable RLS on new tables and add owner-scoped policies.\n---`;
    }

    // MCP context — inject catalogue blocks when matching keys exist in .env.local
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
      const mcpBlock = buildMcpContextBlock(envKeys);
      if (mcpBlock) systemPrompt += mcpBlock;

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
    }

    // ── Subagents: read-only parallel investigation (Lovable-style) ─────────
    let subagentSteps: SubagentStep[] = [];
    if (shouldUseSubagents(message, mode, files.length)) {
      const investigation = runSubagentInvestigation(message, files);
      subagentSteps = investigation.steps;
      if (investigation.contextBlock) systemPrompt += investigation.contextBlock;
    }

    // Build messages array — support image attachments (vision)
    const userContent = imageBase64
      ? [
          { type: "text" as const, text: userMessage },
          { type: "image_url" as const, image_url: { url: imageBase64 } },
        ]
      : userMessage;

    const messages: import("@/lib/ai/provider").AIMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: userContent as string },
    ];

    // ── Clarify-first mode: ask AI for clarifying questions before building ──────
    if (mode === "build" && clarifyFirst) {
      const clarifySystemPrompt = [
        "You are an expert software architect helping a developer before they build a feature.",
        "Given a user's build request, generate 2-4 targeted clarifying questions that would help produce better output.",
        'Return ONLY a JSON array of question objects, no prose, no code fences.',
        'Each object must have: id (string), question (string), type ("text" | "choice"), options (string[] only for choice type).',
        "Keep questions specific and practical.",
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
          try {
            let questionsJson = "";
            await generateAI({
              model: model ?? getDefaultAiModel(),
              messages: [
                { role: "system", content: clarifySystemPrompt },
                { role: "user", content: "Build request: " + message + "\n\nProject has " + files.length + " existing files." },
              ],
              maxTokens: 600,
              stream: true,
              jsonMode: true,
              onChunk: (chunk) => { questionsJson += chunk; },
            });

            let questions: unknown[] = [];
            try { questions = JSON.parse(questionsJson); } catch { questions = []; }
            if (!Array.isArray(questions)) questions = [];

            const qPayload = JSON.stringify({ clarifying_questions: questions, originalPrompt: message });
            clarifyEnqueue(clarifyEncoder.encode("data: " + qPayload + "\n\n"));
            clarifyEnqueue(clarifyEncoder.encode("data: {}\n\n"));
          } catch {
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


        // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const { safeEnqueue, safeClose, isClientGone } = createStreamSink(controller, encoder, req.signal);
        let fullContent = "";
        let tokensUsed = 0;
        let usedAutoFix = false;
        const streamedFilePaths = new Set<string>();

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
          const result = await generateAI({
            model: model ?? getDefaultAiModel(),
            messages,
            maxTokens: mode === "build" ? BUILD_MAX_TOKENS : CHAT_MAX_TOKENS,
            stream: true,
            // Force structured JSON output in build mode so parseAIResponse
            // reliably gets a complete JSON object rather than prose + code fence.
            jsonMode: mode === "build",
            onChunk: (chunk) => {
              fullContent += chunk;
              safeEnqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
              // Feed chunk into incremental file extractor (build mode only)
              fileExtractor?.feed(chunk);
            },
          });

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
                  model: model ?? getDefaultAiModel(),
                  messages: [
                    ...messages,
                    { role: "assistant" as const, content: fullContent },
                    {
                      role: "user" as const,
                      content:
                        "Your previous JSON response was cut off before it finished. Continue from EXACTLY where it stopped and output ONLY the remaining raw characters needed to complete the JSON object. Do not repeat any earlier content, do not restart, no code fences, no commentary.",
                    },
                  ],
                  maxTokens: BUILD_MAX_TOKENS,
                  stream: true,
                  jsonMode: false, // raw continuation of the existing object, not a new one
                  onChunk: (chunk) => {
                    fullContent += chunk;
                    contChunk += chunk;
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
                    fileExtractor?.feed(chunk);
                  },
                });
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
          if (mode === "patch") {
            const patches = parsePatchResponse(fullContent);
            if (patches.length > 0) {
              const patchResults = applyPatches(patches, files as Array<{ path: string; content: string }>);
              for (const pr of patchResults) {
                if (!pr.applied) {
                  logger.warn("ai.chat.patch_failed", { projectId, path: pr.path, error: pr.error });
                  continue;
                }
                const lang = pr.path.split(".").pop()?.toLowerCase() ?? "text";
                const langMap: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", css: "css", html: "html", json: "json", md: "markdown" };
                parsedFiles.push({ path: pr.path, content: pr.content, language: langMap[lang] ?? lang });
                await (supabase as any).from("project_files").upsert({
                  project_id: projectId, path: pr.path, content: pr.content, language: langMap[lang] ?? lang,
                }, { onConflict: "project_id,path" });
              }
              safeEnqueue(encoder.encode(`data: ${JSON.stringify({ status: "patches_applied", count: patchResults.filter((r) => r.applied).length })}\n\n`));
            }
          } else if (mode === "build") {
            const parsed = parseAIResponse(fullContent);
            let finalFiles = parsed.files;

            // ── Validation pass ───────────────────────────────────────────
            if (finalFiles.length > 0) {
              const existingFiles = (files as ParsedFile[]) ?? [];
              // Correctness errors (broken imports, missing config) + type-agnostic
              // RICHNESS errors (too thin / sparse) — both feed the auto-fix loop,
              // so a structurally-valid-but-empty app gets enriched, not shipped.
              const correctnessErrors = validateGeneratedFiles(finalFiles, existingFiles);
              const richnessErrors = assessGenerationQuality(finalFiles, existingFiles, {
                minFiles: buildIntent?.minFiles,
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
                  await generateAI({
                    model: model ?? getDefaultAiModel(),
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
                    maxTokens: BUILD_MAX_TOKENS,
                    stream: true,
                    jsonMode: true,
                    onChunk: (chunk) => { repairContent += chunk; },
                  });

                  const repaired = parseAIResponse(repairContent);
                  if (repaired.files.length > 0) {
                    // Merge repaired files on top of originals
                    const mergedMap = new Map(finalFiles.map((f) => [f.path, f]));
                    for (const rf of repaired.files) mergedMap.set(rf.path, rf);
                    finalFiles = Array.from(mergedMap.values());
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
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ status: "fixing", message: "Model returned prose instead of files — requesting proper file output…" })}\n\n`)
              );
              logger.warn("ai.chat.no_files_parsed", { projectId, model: model ?? process.env.DEFAULT_AI_MODEL });
              try {
                let retryContent = "";
                await generateAI({
                  model: model ?? getDefaultAiModel(),
                  messages: [
                    ...messages,
                    { role: "assistant" as const, content: fullContent },
                    {
                      role: "user" as const,
                      content:
                        "Your previous response did not contain any files in the required output format. " +
                        "Respond ONLY with the required JSON object containing the COMPLETE file contents for this request — " +
                        "no explanations, no installation steps, no markdown fences.",
                    },
                  ],
                  maxTokens: BUILD_MAX_TOKENS,
                  stream: true,
                  jsonMode: true,
                  onChunk: (chunk) => { retryContent += chunk; },
                });
                const retryParsed = parseAIResponse(retryContent);
                if (retryParsed.files.length > 0) {
                  finalFiles = retryParsed.files;
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

            parsedFiles = finalFiles;

            // ── Save files to DB ──────────────────────────────────────────
            if (parsedFiles.length > 0) {
              // Auto-snapshot current state before overwriting
              const { data: currentFiles } = await (supabase as any)
                .from("project_files")
                .select("path, content, language")
                .eq("project_id", projectId);

              if (currentFiles && currentFiles.length > 0) {
                void (supabase as any).from("project_snapshots").insert({
                  project_id:  projectId,
                  user_id:     userId,
                  label:       `Auto-save before: ${message.slice(0, 60)}`,
                  is_baseline: true,
                  files:       currentFiles,
                  patches:     null,
                  parent_id:   null,
                });
              }

              // Only upsert files that weren't already saved by the streaming extractor.
              // The streamer does fire-and-forget upserts mid-stream so post-validation
              // repairs (auto-fix pass) or new files added by repair need a final write.
              for (const file of parsedFiles) {
                const alreadyStreamed = streamedFilePaths.has(file.path);
                // Always write if content was repaired (auto-fix may have changed it)
                // or if the file wasn't streamed at all
                if (!alreadyStreamed || streamedFilePaths.size !== parsedFiles.length) {
                  await (supabase as any).from("project_files").upsert({
                    project_id: projectId,
                    path: file.path,
                    content: file.content,
                    language: file.language,
                  }, { onConflict: "project_id,path" });
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
              backendWiring = await autoWireBackend({
                supabase,
                projectId,
                userId,
                prompt: message,
                generatedFiles: parsedFiles,
                cloudToolPermissionsRaw: cloudPermissionsRaw,
                emit: emitStatus("wiring_status"),
              });
            } catch { backendWiring = null; }

            // 2. Self-verification — render the app, auto-fix runtime errors
            try {
              verification = await runSelfVerification({
                supabase,
                projectId,
                emit: emitStatus("verify_status"),
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

          const assistantMetadata: Record<string, unknown> | null =
            (mode === "build" || mode === "patch") && parsedFiles.length > 0
              ? {
                  files_changed: parsedFiles.map((f) => f.path),
                  ...(buildActivity ? { build_activity: buildActivity } : {}),
                }
              : buildActivity
                ? { build_activity: buildActivity }
                : null;

          const creditCost = computeCreditCost({
            mode,
            filesGenerated: parsedFiles.length,
            tokensUsed,
            usedSubagents: subagentSteps.length > 0,
            usedAutoFix,
          });

          // Save messages to DB — attach files_changed + credits metadata
          const persistedContent =
            mode === "build" || mode === "patch"
              ? parseAIResponse(fullContent).message
              : fullContent;
          const { data: insertedMessages } = await (supabase as any)
            .from("messages")
            .insert([
              { project_id: projectId, role: "user", content: message, mode },
              {
                project_id: projectId,
                role: "assistant",
                content: persistedContent,
                tokens_used: tokensUsed,
                model: model ?? getDefaultAiModel(),
                mode,
                metadata: assistantMetadata
                  ? { ...assistantMetadata, credits_used: creditCost }
                  : { credits_used: creditCost },
              },
            ])
            .select("id, role");
          const assistantMessageId = (insertedMessages as Array<{ id: string; role: string }> | null)?.find(
            (row) => row.role === "assistant",
          )?.id;

          await (supabase as any).rpc("deduct_credits", {
            user_id: userId,
            amount: creditCost,
            action: `${mode}_message`,
            project_id: projectId,
          });

          // Warn user when credits drop low (fire-and-forget)
          const remainingCredits = (profile.credits ?? 0) - creditCost;
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
              const lastSummaryAt = (projectData?.metadata as Record<string, unknown> | null)?.context_summary_at as string | undefined;
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
                fileCount: finalFilesForClient.length,
                assistantMessageId,
                build_activity: buildActivity ?? undefined,
                backend_wired: backendWiring ?? undefined,
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
