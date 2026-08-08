import { createClientFromRequest } from "../../supabase/request-client.ts";
import { getServerUser } from "../../supabase/server-user.ts";
import { getDefaultAiModel } from "../model-defaults.ts";
import { rateLimitAsync,RATE_LIMITS } from "../../rate-limit.ts";
import { AUTO_FIX_SYSTEM_PROMPT } from "../prompts/auto-fix.ts";
import {
cancelCreditReservation,
claimFreeCreditAction,
reserveCredits,
settleCreditReservation,
} from "@/lib/credits";
import type { PreviewRuntimeError,PreviewErrorKind } from "../../preview/preview-error-bridge.ts";
import { pushFileToRunningSandbox } from "../../preview/push-to-sandbox.ts";
import { guardFileWrite } from "../guard-file-write.ts";
import { logger } from "../../logger.ts";
import {
typecheckRunningSandbox,
SANDBOX_PUSH_SETTLE_MS,
} from "@/lib/preview/typecheck-project";
import { fingerprintDiagnostic,scoreRepair } from "../failure-fingerprint.ts";
import { recordRepairOutcome } from "../record-outcome.ts";
import { isFatal } from "../../sandbox/tsc-diagnostics.ts";

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

async function parseFixResponse(
  raw: string,
  currentFiles: Array<{ path: string; content: string }> = [],
): Promise<{
  files: Array<{ path: string; content: string }>;
  explanation: string;
}> {
  const { parseAIResponse, buildFixExplanation } = await import("@/lib/ai/code-parser");
  const parsed = parseAIResponse(raw);
  const files: Array<{ path: string; content: string }> = [...(parsed.files ?? [])];

  // ── <file_update> with <search>/<replace> ───────────────────────────────────
  // This route is the main consumer of the preview healing prompt, which used to
  // ask for exactly that format. parseAIResponse cannot resolve a search/replace
  // pair on its own — it needs the file's current content, which only the caller
  // has — so it returns them as `xmlPatches`. Before this they were dropped, the
  // route saw zero files and threw "missing files array": a fix the user paid a
  // credit for, that the client had already applied to its local state, and that
  // was never written to the database.
  if (parsed.xmlPatches?.length) {
    const { applyPatches, collapsePatchResults } = await import("@/lib/ai/patch-applier");
    const base = new Map(currentFiles.map((f) => [f.path, f.content]));
    for (const f of files) base.set(f.path, f.content);

    const results = applyPatches(
      parsed.xmlPatches.map((p) => ({ path: p.path, find: p.find, replace: p.replace })),
      [...base].map(([path, content]) => ({ path, content })),
    );

    const byPath = new Map(files.map((f) => [f.path, f]));
    for (const pr of collapsePatchResults(results)) {
      byPath.set(pr.path, { path: pr.path, content: pr.content });
    }
    files.length = 0;
    files.push(...byPath.values());

    const failed = results.filter((r) => !r.applied);
    if (failed.length > 0) {
      console.warn(
        "auto-fix: unapplied <file_update> patches:",
        failed.map((f) => `${f.path}: ${f.error}`).join("; "),
      );
    }
  }

  if (!files.length) {
    throw new Error("AI response missing files array");
  }
  return {
    files,
    explanation: buildFixExplanation(parsed),
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

  const { data: projectRow } = await supabase
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

    const parsed = await parseFixResponse(rawContent, fileList);
    parsed.files = ensureCommonGeneratedSupportFiles(parsed.files, fileList);

    // Snapshot the compiler's view BEFORE touching anything. This is the only
    // objective label available for "did the fix help" — the runtime error that
    // triggered this repair only reports the first thing that crashed, and the
    // regex validators cannot see across a package boundary at all.
    const beforeCheck = await typecheckRunningSandbox(supabase, projectId);
    const fixStartedAt = Date.now();

    // Enough to put back what this attempt overwrites, if it turns out to have
    // made things worse. Only files that actually get written are recorded.
    const restorePoints = new Map<
      string,
      { id: string | null; previous: string | null }
    >();
    const written: string[] = [];
    const rejected: string[] = [];

    for (const fixedFile of parsed.files) {
      const { data: existing } = await supabase
        .from("project_files")
        .select("id, content")
        .eq("project_id", projectId)
        .eq("path", fixedFile.path)
        .single();

      // An auto-fix is triggered BY a broken preview, so a bad fix does not
      // merely fail — it feeds itself. The damaged file becomes the context for
      // the next fix, and each round is handed something worse. Two separate
      // corruptions in one evening came through this exact write: a package.json
      // that reached three concatenated copies of itself, and a working root
      // route rewritten to import an API removed before TanStack Router 1.0.
      // Skipping a suspect write costs one retry; taking it can cost the file.
      const verdict = guardFileWrite({
        path: fixedFile.path,
        next: fixedFile.content,
        previous: existing?.content ?? null,
      });
      if (!verdict.ok) {
        logger.warn("ai.fix.write_rejected", {
          projectId,
          path: fixedFile.path,
          code: verdict.code,
          reason: verdict.reason,
        });
        rejected.push(fixedFile.path);
        continue;
      }

      restorePoints.set(fixedFile.path, {
        id: existing?.id ?? null,
        previous: existing?.content ?? null,
      });
      written.push(fixedFile.path);

      if (existing) {
        await supabase
          .from("project_files")
          .update({ content: fixedFile.content, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("project_files").insert({
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

      // The whole point of an auto-fix is replacing the file the preview is
      // currently choking on — so the fix must reach the RUNNING container,
      // not just the database. This was the observed stale-preview bug: the
      // repair saved to the DB while the sandbox kept serving the broken file
      // until the container was destroyed by hand.
      pushFileToRunningSandbox(supabase, projectId, fixedFile.path, fixedFile.content);
    }

    // ── Verify, then keep ────────────────────────────────────────────────────
    //
    // The gap the write guard could not close. That guard is a structural check
    // on one file at a time, and it says so in its own header: it cannot know
    // that `@tanstack/react-router` stopped exporting `Body`, because only
    // something holding the installed .d.ts files can. This can, and it is
    // looking at the project as a whole after the write landed.
    //
    // A repair that introduces a compile error the project did not have is not
    // a partial success — it is the ratchet, and every later round is handed
    // the damage as context. Putting the old content back costs one failed fix
    // the user can retry; leaving it costs the project.
    if (beforeCheck && written.length > 0) {
      await new Promise((r) => setTimeout(r, SANDBOX_PUSH_SETTLE_MS));
      const afterCheck = await typecheckRunningSandbox(supabase, projectId);

      if (afterCheck) {
        const before = beforeCheck.diagnostics.map(fingerprintDiagnostic);
        const after = afterCheck.diagnostics.map(fingerprintDiagnostic);
        const score = scoreRepair(before, after);

        // Only NEW app-breaking diagnostics trigger a rollback. A fix that
        // leaves a new implicit-any behind while clearing a missing import is
        // still a fix; one that leaves a new missing module behind is not.
        const brokeSomething = afterCheck.diagnostics.some(
          (d) => isFatal(d) && score.introduced.includes(fingerprintDiagnostic(d).fingerprint),
        );

        if (brokeSomething) {
          logger.warn("ai.fix.rolled_back", {
            projectId,
            files: written,
            introduced: score.introduced.slice(0, 5),
          });
          for (const [path, point] of restorePoints) {
            if (point.previous == null) continue; // nothing to go back to
            if (point.id) {
              await supabase
                .from("project_files")
                .update({ content: point.previous, updated_at: new Date().toISOString() })
                .eq("id", point.id);
            }
            pushFileToRunningSandbox(supabase, projectId, path, point.previous);
          }
        }

        recordRepairOutcome({
          projectId,
          userId: user.id,
          stage: "autofix",
          model: result?.model,
          signal: "typecheck",
          before,
          after,
          filesWritten: brokeSomething ? [] : written,
          filesRejected: rejected,
          durationMs: Date.now() - fixStartedAt,
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
