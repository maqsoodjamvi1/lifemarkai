// @ts-nocheck
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { getServerUser } from "@/lib/supabase/server-user";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { AUTO_FIX_SYSTEM_PROMPT } from "@/lib/ai/prompts/auto-fix";
import {
  cancelCreditReservation,
  claimFreeCreditAction,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";
import type { PreviewRuntimeError, PreviewErrorKind } from "@/lib/preview/preview-error-bridge";

/**
 * Free daily "Try to fix" quota (Lovable parity — error fixes are Lovable's
 * flagship free action): the first N auto-fix runs per user per UTC day cost
 * 0 credits. Usage is still logged to credit_logs via a dedicated self-scoped
 * audit RPC so the count survives restarts and is
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
      const kind =
        typeof raw.kind === "string" && PREVIEW_ERROR_KINDS.has(raw.kind as PreviewErrorKind)
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

  return errors.length > 0
    ? errors
    : [{ kind: "runtime", message: fallbackMessage, timestamp: Date.now() }];
}

async function parseFixResponse(raw: string): Promise<{
  files: Array<{ path: string; content: string }>;
  explanation: string;
}> {
  const { parseAIResponse } = await import("@/lib/ai/code-parser");
  const parsed = parseAIResponse(raw);
  if (!parsed.files?.length) {
    throw new Error("AI response missing files array");
  }
  return {
    files: parsed.files,
    explanation: parsed.message ?? "Fixed the error — check the preview.",
  };
}

export async function handleAiFix(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = await rateLimitAsync(ip, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = createClientFromRequest(req);
  const { user } = await getServerUser(supabase);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, error: buildError, files, runtimeErrors } = await req.json();

  if (!projectId || !buildError) {
    return Response.json({ error: "projectId and error are required" }, { status: 400 });
  }

  const { data: projectRow } = await (supabase as any)
    .from("projects")
    .select("id, environment")
    .eq("id", projectId)
    .single();

  if (!projectRow) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (projectRow.environment === "live") {
    return Response.json(
      {
        error:
          "This project is in the Live environment. Switch to Test to make changes, then publish them to Live.",
        environment_locked: true,
      },
      { status: 423 },
    );
  }

  let freeUseNumber: number;
  try {
    freeUseNumber = await claimFreeCreditAction(supabase, {
      userId: user.id,
      action: "auto_fix",
      dailyLimit: FREE_FIXES_PER_DAY,
      projectId,
    });
  } catch (error) {
    console.error("Unable to claim auto-fix quota:", error);
    return Response.json({ error: "Unable to verify the daily fix quota" }, { status: 500 });
  }

  const isFreeFix = freeUseNumber > 0;
  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  if (!isFreeFix) {
    try {
      reservation = await reserveCredits(supabase, {
        userId: user.id,
        amount: 1,
        action: "auto_fix",
        projectId,
      });
    } catch (error) {
      console.error("Unable to reserve auto-fix credits:", error);
      return Response.json({ error: "Unable to reserve credits" }, { status: 500 });
    }
    if (!reservation) {
      return Response.json({ error: "Insufficient credits" }, { status: 402 });
    }
  }

  const buildErrorText = String(buildError);
  const fileList = Array.isArray(files) ? files : [];
  const fileContext = fileList
    .slice(0, 10)
    .map((f: { path: string; content: string }) => `=== ${f.path} ===\n${f.content}`)
    .join("\n\n");

  const [{ appendPreviewDiagnosis }, { generateAI }, { ensureCommonGeneratedSupportFiles }] =
    await Promise.all([
      import("@/lib/preview/diagnose-preview"),
      import("@/lib/ai/generate"),
      import("@/lib/ai/generated-support-files"),
    ]);

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

  let providerReturned = false;
  let reservationSettled = false;
  try {
    const result = await generateAI(
      {
        model: getDefaultAiModel(),
        messages: [
          { role: "system", content: AUTO_FIX_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        // See the note in src/routes/api/ai/fix.ts: 4000 was small enough that a
        // normal multi-file fix hit the ceiling exactly (`out=4000`) and the
        // truncated JSON surfaced as "missing files array". Auto-fix emits whole
        // files, so it needs a build-sized budget. generateAI clamps per-model.
        maxTokens: Number(process.env.AUTO_FIX_MAX_TOKENS) || 16000,
        jsonMode: true,
      },
      { projectId, userId: user.id, task: "auto_fix" },
    );
    providerReturned = true;

    if (reservation) {
      await settleCreditReservation(supabase, reservation.id, 1);
      reservationSettled = true;
    }

    const rawContent = result?.content ?? "";

    if (!rawContent.trim()) {
      throw new Error("AI returned empty response");
    }

    const parsed = await parseFixResponse(rawContent);
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

    const { recordEditorIntelligenceBuild } = await import(
      "@/lib/ai/editor-lenses/persistence"
    );
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
          language: file.path.endsWith(".tsx")
            ? "typescriptreact"
            : file.path.endsWith(".ts")
              ? "typescript"
              : "javascript",
        })),
        errors: [
          `Auto-fix generated for: ${buildErrorText.slice(0, 180)}. Re-open preview to verify.`,
        ],
      },
    });

    if (!isFreeFix) {
      import("@/lib/stripe/auto-topup")
        .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
        .catch(() => {});
    }

    return Response.json({
      files: parsed.files,
      explanation: parsed.explanation,
      tokensUsed: result.tokensUsed ?? 0,
      free: isFreeFix,
      freeFixesRemainingToday: Math.max(0, isFreeFix ? FREE_FIXES_PER_DAY - freeUseNumber : 0),
    });
  } catch (err) {
    if (reservation && !reservationSettled) {
      try {
        if (providerReturned) {
          await settleCreditReservation(supabase, reservation.id, 1);
        } else {
          await cancelCreditReservation(supabase, reservation.id);
        }
      } catch (billingError) {
        console.error("Auto-fix reservation cleanup failed:", billingError);
      }
    }
    console.error("Auto-fix error:", err);
    return Response.json(
      { error: "Failed to auto-fix. Please fix manually." },
      { status: 500 },
    );
  }
}

/** Thin alias for Next route re-export */
export const POST = handleAiFix;
