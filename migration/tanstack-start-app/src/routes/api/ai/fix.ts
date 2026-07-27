/**
 * Native Start /api/ai/fix — auth via Start cookies, then shared lib/ai/http
 * logic without importing app/api Next route modules.
 *
 * Heavy modules (generateAI, etc.) load only after auth succeeds.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  cancelCreditReservation,
  claimFreeCreditAction,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { AUTO_FIX_SYSTEM_PROMPT } from "@/lib/ai/prompts/auto-fix";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

const FREE_FIXES_PER_DAY = 20;

/**
 * Output budget for an auto-fix.
 *
 * Auto-fix returns COMPLETE rewritten files, so its budget has to be sized like
 * a build, not like a chat turn. The previous value (4000) was small enough that
 * a routine multi-file fix hit the ceiling exactly — the gateway logged
 * `out=4000`, the JSON was severed mid-object, and the failure presented as
 * "AI response missing files array", pointing suspicion at the model rather than
 * at our own cap.
 *
 * 16000 sits between CHAT_MAX_TOKENS (4096) and BUILD_MAX_TOKENS (32000):
 * comfortably more than a few full files, without paying build-sized latency on
 * every small repair. generateAI clamps this down per-model, so an over-large
 * value is safe.
 */
const AUTO_FIX_MAX_TOKENS = Number(process.env.AUTO_FIX_MAX_TOKENS) || 16000;

export const Route = createFileRoute("/api/ai/fix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = request.headers.get("x-forwarded-for") ?? "local";
          const rl = await rateLimitAsync(ip, RATE_LIMITS.ai);
          if (!rl.success) {
            return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
          }

          const supabase = await createClient();
          const { user } = await getServerUser(supabase);
          if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const body = await request.json();
          const { projectId, error: buildError, files, runtimeErrors } = body ?? {};
          if (!projectId || !buildError) {
            return Response.json(
              { error: "projectId and error are required" },
              { status: 400 },
            );
          }

          const { data: projectRow } = await supabase
            .from("projects")
            .select("id, environment")
            .eq("id", projectId)
            .single();

          if (!projectRow) {
            return Response.json({ error: "Project not found" }, { status: 404 });
          }
          if ((projectRow as { environment?: string }).environment === "live") {
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
            return Response.json(
              { error: "Unable to verify the daily fix quota" },
              { status: 500 },
            );
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

          const [
            { appendPreviewDiagnosis },
            { generateAI },
            { ensureCommonGeneratedSupportFiles },
            { parseAIResponse },
          ] = await Promise.all([
            import("@/lib/preview/diagnose-preview"),
            import("@/lib/ai/generate"),
            import("@/lib/ai/generated-support-files"),
            import("@/lib/ai/code-parser"),
          ]);

          const enrichedError = appendPreviewDiagnosis(
            buildErrorText,
            fileList,
            Array.isArray(runtimeErrors) ? runtimeErrors : [],
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
                // Auto-fix rewrites WHOLE files, so it needs a build-sized budget,
                // not a chat-sized one. At the old 4000 the model hit the cap dead-on
                // (`out=4000` in the gateway log), the JSON was cut mid-structure, and
                // the truncated payload surfaced as the misleading
                // "AI response missing files array" — as if the model had misbehaved,
                // when in fact we cut it off. A single component file can exceed 4000
                // output tokens on its own. Compare: full builds use BUILD_MAX_TOKENS
                // (32000 default).
                maxTokens: AUTO_FIX_MAX_TOKENS,
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
            if (!rawContent.trim()) throw new Error("AI returned empty response");

            const parsed = parseAIResponse(rawContent);
            if (!parsed.files?.length) {
              // Distinguish "the model was cut off" from "the model returned junk".
              // These need opposite responses (raise the budget vs. fix the prompt),
              // and conflating them cost real debugging time before.
              const trimmed = rawContent.trim();
              const looksTruncated =
                trimmed.length > 0 && !/[}\]]\s*$/.test(trimmed);
              throw new Error(
                looksTruncated
                  ? `AI response was truncated at ${AUTO_FIX_MAX_TOKENS} output tokens — the JSON never closed. Raise AUTO_FIX_MAX_TOKENS or ask the fix to touch fewer files.`
                  : "AI response missing files array",
              );
            }
            let outFiles = ensureCommonGeneratedSupportFiles(parsed.files, fileList);

            for (const fixedFile of outFiles) {
              const { data: existing } = await supabase
                .from("project_files")
                .select("id")
                .eq("project_id", projectId)
                .eq("path", fixedFile.path)
                .single();

              if (existing) {
                await supabase
                  .from("project_files")
                  .update({
                    content: fixedFile.content,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", (existing as { id: string }).id);
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
            }

            return Response.json({
              files: outFiles,
              explanation: parsed.message ?? "Fixed the error — check the preview.",
              tokensUsed: result.tokensUsed ?? 0,
              free: isFreeFix,
              freeFixesRemainingToday: Math.max(
                0,
                isFreeFix ? FREE_FIXES_PER_DAY - freeUseNumber : 0,
              ),
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
        } catch (err) {
          console.error("[api/ai/fix]", err);
          return Response.json(
            { error: err instanceof Error ? err.message : "Fix failed" },
            { status: 500 },
          );
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
