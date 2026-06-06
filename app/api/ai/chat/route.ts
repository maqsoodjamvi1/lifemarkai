import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
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
import { applyPatches, parsePatchResponse } from "@/lib/ai/patch-applier";
import { parseAIResponse, validateGeneratedFiles, shouldAutoFix, type ParsedFile } from "@/lib/ai/code-parser";
import { StreamingFileExtractor } from "@/lib/ai/streaming-file-extractor";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateApiKey } from "@/app/api/keys/route";
import { logger } from "@/lib/logger";
import { getProjectSchemaContext } from "@/lib/supabase/schema-reader";
import { matchSkills, renderSkillBlock, type SkillCandidate, type SkillMatch } from "@/lib/ai/skill-matcher";

export const runtime = "nodejs";
export const maxDuration = 60;

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Check credits
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("credits, plan, email, workspace_knowledge")
      .eq("id", userId)
      .single();

    if (!profile || profile.credits <= 0) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    // Fetch project knowledge + recent messages + DB schema in parallel
    const [projectRes, recentMessagesRes, schemaContext] = await Promise.all([
      (supabase as any).from("projects").select("knowledge, name, metadata, disabled_skill_ids").eq("id", projectId).single(),
      (supabase as any).from("messages").select("role, content, mode, metadata").eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(40),
      // Schema reading is best-effort — never blocks the response
      getProjectSchemaContext(projectSupabaseUrl, projectServiceKey).catch(() => ""),
    ]);

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
    const schemaBlock = schemaContext ? `\n\n---\n${schemaContext}\n---` : "";

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
      const { data: skillRows } = await (supabase as any)
        .from("workspace_skills")
        .select("id, name, description, prompt, tags, use_count")
        .eq("user_id", userId)
        .limit(100);
      // Honor per-project skill opt-outs (migration 055). NULL/[] means none disabled.
      const disabledIds = new Set<string>(
        Array.isArray(projectData?.disabled_skill_ids) ? projectData!.disabled_skill_ids! : [],
      );
      const candidates: SkillCandidate[] = (skillRows ?? [])
        .filter((r: any) => !disabledIds.has(r.id))
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          prompt: r.prompt,
          tags: r.tags,
        }));
      attachedSkills = matchSkills(message, candidates, { topN: 2 });
      if (attachedSkills.length > 0) {
        systemPrompt += renderSkillBlock(attachedSkills);
        // Bump use_count for telemetry, fire-and-forget. We do this per-row
        // (rather than via a single bulk SQL increment) because Supabase JS
        // doesn't support `use_count = use_count + 1` natively without an RPC,
        // and the per-row update path is fast enough at our scale (<= 2 rows).
        for (const m of attachedSkills) {
          void (supabase as any)
            .from("workspace_skills")
            .update({ use_count: ((skillRows ?? []).find((r: any) => r.id === m.skill.id)?.use_count ?? 0) + 1 })
            .eq("id", m.skill.id)
            .then(() => null, () => null);
        }
      }
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

    // Build messages array — support image attachments (vision)
    const userContent = imageBase64
      ? [
          { type: "text" as const, text: message },
          { type: "image_url" as const, image_url: { url: imageBase64 } },
        ]
      : message;

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
          try {
            let questionsJson = "";
            await generateAI({
              model: model ?? (process.env.DEFAULT_AI_MODEL as import("@/lib/ai/provider").AIModel) ?? "deepseek/deepseek-chat-v3-0324",
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
            controller.enqueue(clarifyEncoder.encode("data: " + qPayload + "\n\n"));
            controller.enqueue(clarifyEncoder.encode("data: {}\n\n"));
          } catch {
            const errPayload = JSON.stringify({ error: "Failed to generate clarifying questions" });
            controller.enqueue(clarifyEncoder.encode("data: " + errPayload + "\n\n"));
          } finally {
            controller.close();
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
        let fullContent = "";
        let tokensUsed = 0;
        const streamedFilePaths = new Set<string>();

        // Surface auto-attached skills to the client before the model output
        // begins, so the chat panel can render a "using skill: X" chip on the
        // pending assistant message.
        if (attachedSkills.length > 0) {
          controller.enqueue(
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
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ streamedFile: file.path })}\n\n`)
              );
            })
          : null;

        try {
          const result = await generateAI({
            model: model ?? (process.env.DEFAULT_AI_MODEL as import("@/lib/ai/provider").AIModel) ?? "deepseek/deepseek-chat-v3-0324",
            messages,
            maxTokens: 8000,
            stream: true,
            // Force structured JSON output in build mode so parseAIResponse
            // reliably gets a complete JSON object rather than prose + code fence.
            jsonMode: mode === "build",
            onChunk: (chunk) => {
              fullContent += chunk;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
              // Feed chunk into incremental file extractor (build mode only)
              fileExtractor?.feed(chunk);
            },
          });

          tokensUsed = result.tokensUsed;

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
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "patches_applied", count: patchResults.filter((r) => r.applied).length })}\n\n`));
            }
          } else if (mode === "build") {
            const parsed = parseAIResponse(fullContent);
            let finalFiles = parsed.files;

            // ── Validation pass ───────────────────────────────────────────
            if (finalFiles.length > 0) {
              const existingFiles = (files as ParsedFile[]) ?? [];
              const validationErrors = validateGeneratedFiles(finalFiles, existingFiles);

              if (shouldAutoFix(validationErrors) && validationErrors.length > 0) {
                // ── Auto-fix pass — send errors back to AI ────────────────
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ status: "fixing", message: `Auto-fixing ${validationErrors.length} issue(s)…` })}\n\n`)
                );

                logger.info("ai.chat.autofix", {
                  projectId,
                  errorCount: validationErrors.length,
                  errors: validationErrors.map((e) => e.message),
                });

                try {
                  const repairPrompt = buildRepairPrompt(finalFiles, validationErrors.map((e) => e.message));
                  let repairContent = "";
                  await generateAI({
                    model: model ?? (process.env.DEFAULT_AI_MODEL as import("@/lib/ai/provider").AIModel) ?? "deepseek/deepseek-chat-v3-0324",
                    messages: [
                      { role: "system" as const, content: AUTO_FIX_SYSTEM_PROMPT },
                      { role: "user" as const, content: repairPrompt },
                    ],
                    maxTokens: 8000,
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
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ status: "fixing", message: "Model returned prose instead of files — requesting proper file output…" })}\n\n`)
              );
              logger.warn("ai.chat.no_files_parsed", { projectId, model: model ?? process.env.DEFAULT_AI_MODEL });
              try {
                let retryContent = "";
                await generateAI({
                  model: model ?? (process.env.DEFAULT_AI_MODEL as import("@/lib/ai/provider").AIModel) ?? "deepseek/deepseek-chat-v3-0324",
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
                  maxTokens: 8000,
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
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ status: "no_files", message: "The model didn't produce files in the required format. Try again, or switch to a stronger model (e.g. GPT-4o) in the model picker." })}\n\n`)
                  );
                }
              } catch (retryErr) {
                logger.warn("ai.chat.format_retry_failed", { projectId, error: String(retryErr) });
                controller.enqueue(
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

          // Save messages to DB — attach files_changed metadata to build/patch-mode assistant turns
          const assistantMetadata = (mode === "build" || mode === "patch") && parsedFiles.length > 0
            ? { files_changed: parsedFiles.map((f) => f.path) }
            : null;
          // Persist the human-readable message for build/patch turns — raw JSON
          // in chat history reads as garbage on reload. Files live in
          // project_files; files_changed metadata records what was touched.
          const persistedContent =
            mode === "build" || mode === "patch"
              ? parseAIResponse(fullContent).message
              : fullContent;
          await (supabase as any).from("messages").insert([
            { project_id: projectId, role: "user", content: message, mode },
            { project_id: projectId, role: "assistant", content: persistedContent, tokens_used: tokensUsed, model: model ?? (process.env.DEFAULT_AI_MODEL as import("@/lib/ai/provider").AIModel) ?? "deepseek/deepseek-chat-v3-0324", mode, metadata: assistantMetadata },
          ]);

          // Deduct credits (1 for chat, 2 for build)
          const creditCost = mode === "build" ? 2 : 1;
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
                  title: "Build complete \u2713",
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

          // Send final event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                tokensUsed,
                files: finalFilesForClient,
                creditsUsed: creditCost,
                fileCount: finalFilesForClient.length,
                // Human-readable summary for the chat bubble — without this the
                // client renders the raw JSON blob (escaped \n and all).
                displayMessage:
                  mode === "build" || mode === "patch"
                    ? parseAIResponse(fullContent).message
                    : undefined,
              })}\n\n`
            )
          );
        } catch (error) {
          logger.error("ai.chat.stream_error", error instanceof Error ? error : new Error(String(error)), {
            projectId,
            userId,
            mode,
          });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`)
          );
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
