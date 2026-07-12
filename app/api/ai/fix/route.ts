// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { AUTO_FIX_SYSTEM_PROMPT } from "@/lib/ai/system-prompts";
import { claimDailyCredits } from "@/lib/credits";
import { parseAIResponse } from "@/lib/ai/code-parser";
import { ensureCommonGeneratedSupportFiles } from "@/lib/ai/generated-support-files";
import { recordEditorIntelligenceBuild } from "@/lib/ai/editor-lenses/persistence";
import { appendPreviewDiagnosis } from "@/lib/preview/diagnose-preview";
import type { PreviewRuntimeError, PreviewErrorKind } from "@/lib/preview/preview-error-bridge";

/**
 * Free daily "Try to fix" quota (Lovable parity — error fixes are Lovable's
 * flagship free action): the first N auto-fix runs per user per UTC day cost
 * 0 credits. Usage is still logged to credit_logs (via `deduct_credits` with
 * amount 0, action "auto_fix") so the count survives restarts and is
 * enforceable server-side. Fix #21+ costs 1 credit as before.
 */
const FREE_FIXES_PER_DAY = 20;

const PREVIEW_ERROR_KINDS = new Set<PreviewErrorKind>([
  "runtime",
  "promise",
  "bundler",
  "empty-root",
  "console",
]);

function normalizeRuntimeErrors(value: unknown, fallbackMessage: string): PreviewRuntimeError[] {
  if (!Array.isArray(value)) {
    return [{ kind: "runtime", message: fallbackMessage, timestamp: Date.now() }];
  }

  const errors = value
    .map((item): PreviewRuntimeError | null => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const message = typeof raw.message === "string" ? raw.message : "";
      if (!message.trim()) return null;
      const kind = typeof raw.kind === "string" && PREVIEW_ERROR_KINDS.has(raw.kind as PreviewErrorKind)
        ? (raw.kind as PreviewErrorKind)
        : "runtime";
      return {
        kind,
        message: message.slice(0, 4000),
        filename: typeof raw.filename === "string" ? raw.filename : undefined,
        lineno: typeof raw.lineno === "number" ? raw.lineno : undefined,
        colno: typeof raw.colno === "number" ? raw.colno : undefined,
        stack: typeof raw.stack === "string" ? raw.stack.slice(0, 4000) : undefined,
        url: typeof raw.url === "string" ? raw.url : undefined,
        timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
      };
    })
    .filter((err): err is PreviewRuntimeError => Boolean(err))
    .slice(0, 12);

  return errors.length > 0 ? errors : [{ kind: "runtime", message: fallbackMessage, timestamp: Date.now() }];
}

function parseFixResponse(raw: string): {
  files: Array<{ path: string; content: string }>;
  explanation: string;
} {
  const parsed = parseAIResponse(raw);
  if (!parsed.files?.length) {
    throw new Error("AI response missing files array");
  }
  return {
    files: parsed.files,
    explanation: parsed.message ?? "Fixed the error — check the preview.",
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = await rateLimitAsync(ip, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, error: buildError, files, runtimeErrors } = await req.json();

  if (!projectId || !buildError) {
    return NextResponse.json({ error: "projectId and error are required" }, { status: 400 });
  }

  const { data: projectRow } = await (supabase as any)
    .from("projects")
    .select("environment")
    .eq("id", projectId)
    .single();

  if (projectRow?.environment === "live") {
    return NextResponse.json(
      {
        error: "This project is in the Live environment. Switch to Test to make changes, then publish them to Live.",
        environment_locked: true,
      },
      { status: 423 },
    );
  }

  await claimDailyCredits(supabase, user.id);

  // Count today's (UTC) auto-fix runs — under the free quota, the fix is free
  // and the balance gate is skipped entirely (same pattern as inline-edit).
  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);
  const { count: fixesUsedToday } = await (supabase as any)
    .from("credit_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("action", "auto_fix")
    .gte("created_at", utcDayStart.toISOString());
  const isFreeFix = (fixesUsedToday ?? 0) < FREE_FIXES_PER_DAY;

  if (!isFreeFix) {
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (!profile || profile.credits < 0.5) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }
  }

  const buildErrorText = String(buildError);
  const fileList = Array.isArray(files) ? files : [];
  const fileContext = fileList
    .slice(0, 10)
    .map((f: { path: string; content: string }) => `=== ${f.path} ===\n${f.content}`)
    .join("\n\n");
  const enrichedError = appendPreviewDiagnosis(
    buildErrorText,
    fileList,
    normalizeRuntimeErrors(runtimeErrors, buildErrorText),
  );

  const userPrompt = `Fix this build/runtime error:

\`\`\`
${enrichedError}
\`\`\`

Current files:
${fileContext}

Return the fixed files as JSON.`;

  try {
    const result = await generateAI({
      model: getDefaultAiModel(),
      messages: [
        { role: "system", content: AUTO_FIX_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      maxTokens: 4000,
      jsonMode: true,
    });

    const rawContent = result?.content ?? "";

    if (!rawContent.trim()) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });
    }

    const parsed = parseFixResponse(rawContent);
    parsed.files = ensureCommonGeneratedSupportFiles(parsed.files, fileList);

    for (const fixedFile of parsed.files) {
      const { data: existing } = await (supabase as any)
        .from("project_files")
        .select("id")
        .eq("project_id", projectId)
        .eq("path", fixedFile.path)
        .single();

      if (existing) {
        await (supabase as any)
          .from("project_files")
          .update({ content: fixedFile.content, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await (supabase as any).from("project_files").insert({
          project_id: projectId,
          path: fixedFile.path,
          content: fixedFile.content,
          language: fixedFile.path.endsWith(".tsx")
            ? "typescriptreact"
            : fixedFile.path.endsWith(".ts")
            ? "typescript"
            : "javascript",
        });
      }
    }

    // First FREE_FIXES_PER_DAY fixes/day are free: log usage at cost 0
    // (deduct_credits inserts the credit_logs row we count against the quota,
    // bypassing RLS via SECURITY DEFINER). Beyond the quota, deduct 1 credit.
    await (supabase as any).rpc("deduct_credits" as never, {
      user_id: user.id,
      amount: isFreeFix ? 0 : 1,
      action: "auto_fix",
      project_id: projectId,
      description: `Auto-fixed: ${buildErrorText.slice(0, 80)}`,
    });

    await recordEditorIntelligenceBuild({
      supabase,
      projectId,
      source: "chat",
      mode: "auto_fix",
      prompt: `Auto-fix: ${buildErrorText}`,
      filesChanged: parsed.files.map((file) => file.path),
      verification: {
        engine: "static",
        passed: false,
        rounds: 1,
        fixesApplied: 1,
        fixedFiles: parsed.files.map((file) => ({
          path: file.path,
          content: file.content,
          language: file.path.endsWith(".tsx") ? "typescriptreact" : file.path.endsWith(".ts") ? "typescript" : "javascript",
        })),
        errors: [`Auto-fix generated for: ${buildErrorText.slice(0, 180)}. Re-open preview to verify.`],
      },
    });

    if (!isFreeFix) {
      import("@/lib/stripe/auto-topup")
        .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
        .catch(() => {});
    }

    return NextResponse.json({
      files: parsed.files,
      explanation: parsed.explanation,
      tokensUsed: result.tokensUsed ?? 0,
      free: isFreeFix,
      freeFixesRemainingToday: Math.max(
        0,
        FREE_FIXES_PER_DAY - (fixesUsedToday ?? 0) - 1
      ),
    });
  } catch (err) {
    console.error("Auto-fix error:", err);
    return NextResponse.json(
      { error: "Failed to auto-fix. Please fix manually." },
      { status: 500 }
    );
  }
}
