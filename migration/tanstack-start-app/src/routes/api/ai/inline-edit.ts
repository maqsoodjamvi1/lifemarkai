// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { ECONOMY_CODING_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  cancelCreditReservation,
  claimFreeCreditAction,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";


/**
 * Free daily inline-edit quota (Lovable parity): the first N inline edits per
 * user per UTC day cost 0 credits. Usage is still logged to credit_logs via a
 * dedicated self-scoped audit RPC so the count survives
 * restarts and is enforceable server-side. Edit #101+ costs 1 credit as before.
 */
const FREE_INLINE_EDITS_PER_DAY = 100;

/**
 * GET — today's inline-edit quota (Lovable parity: the free-edit counter shown
 * in the visual-edit popover). Returns { used, limit, remaining }.
 */
async function handleGET(_req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const utcMidnight = new Date();
  utcMidnight.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("credit_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("action", "inline_edit")
    .gte("created_at", utcMidnight.toISOString());
  const used = count ?? 0;
  return Response.json({
    used,
    limit: FREE_INLINE_EDITS_PER_DAY,
    remaining: Math.max(0, FREE_INLINE_EDITS_PER_DAY - used),
  });
}

async function readInlineEditUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ used: number; limit: number; remaining: number }> {
  const utcMidnight = new Date();
  utcMidnight.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("credit_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "inline_edit")
    .gte("created_at", utcMidnight.toISOString());
  const used = count ?? 0;
  return {
    used,
    limit: FREE_INLINE_EDITS_PER_DAY,
    remaining: Math.max(0, FREE_INLINE_EDITS_PER_DAY - used),
  };
}

/** Visual-edit path: claim one free edit or immediately settle 1 credit. */
async function claimVisualEditCredit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectId?: string | null,
): Promise<
  | { ok: true; free: boolean; used: number; limit: number; remaining: number }
  | { ok: false; status: number; error: string }
> {
  let freeUseNumber: number;
  try {
    freeUseNumber = await claimFreeCreditAction(supabase, {
      userId,
      action: "inline_edit",
      dailyLimit: FREE_INLINE_EDITS_PER_DAY,
      projectId: projectId ?? null,
    });
  } catch (error) {
    console.error("Unable to claim visual-edit quota:", error);
    return { ok: false, status: 500, error: "Unable to verify the daily edit quota" };
  }
  const isFreeEdit = freeUseNumber > 0;
  if (!isFreeEdit) {
    let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
    try {
      reservation = await reserveCredits(supabase, {
        userId,
        amount: 1,
        action: "inline_edit",
        projectId: projectId ?? null,
      });
    } catch (error) {
      console.error("Unable to reserve visual-edit credits:", error);
      return { ok: false, status: 500, error: "Unable to reserve credits" };
    }
    if (!reservation) {
      return { ok: false, status: 402, error: "Insufficient credits" };
    }
    try {
      await settleCreditReservation(supabase, reservation.id, 1);
    } catch (error) {
      console.error("Unable to settle visual-edit credits:", error);
      try {
        await cancelCreditReservation(supabase, reservation.id);
      } catch {
        /* ignore */
      }
      return { ok: false, status: 500, error: "Unable to settle credits" };
    }
  }
  const usage = await readInlineEditUsage(supabase, userId);
  return { ok: true, free: isFreeEdit, ...usage };
}

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Grant today's daily free credits before the balance gate (migration 063)
  const body = await req.json();

  // Visual-edit / popover path: claim one free edit (or 1 credit) without AI work.
  if (body?.claimOnly === true) {
    const claimed = await claimVisualEditCredit(
      supabase,
      user.id,
      typeof body.projectId === "string" ? body.projectId : null,
    );
    if (!claimed.ok) {
      return Response.json({ error: claimed.error }, { status: claimed.status });
    }
    return Response.json({
      free: claimed.free,
      used: claimed.used,
      limit: claimed.limit,
      remaining: claimed.remaining,
    });
  }

  const { filePath, fileContent, selection, instruction, model } = body;
  if (!instruction || typeof instruction !== "string" || instruction.length > 2000) {
    return Response.json({ error: "Invalid instruction" }, { status: 400 });
  }
  if (!fileContent || typeof fileContent !== "string" || fileContent.length > 500_000) {
    return Response.json({ error: "Missing or oversized file content" }, { status: 400 });
  }
  if (typeof filePath !== "string" || filePath.length > 1000) {
    return Response.json({ error: "Invalid file path" }, { status: 400 });
  }
  if (
    !selection
    || !Number.isInteger(selection.startLine)
    || !Number.isInteger(selection.endLine)
    || selection.startLine < 1
    || selection.endLine < selection.startLine
  ) {
    return Response.json({ error: "Invalid selection" }, { status: 400 });
  }

  let freeUseNumber: number;
  let providerReturned = false;
  let reservationSettled = false;
  try {
    freeUseNumber = await claimFreeCreditAction(supabase, {
      userId: user.id,
      action: "inline_edit",
      dailyLimit: FREE_INLINE_EDITS_PER_DAY,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
    });
  } catch (error) {
    console.error("Unable to claim inline-edit quota:", error);
    return Response.json({ error: "Unable to verify the daily edit quota" }, { status: 500 });
  }
  const isFreeEdit = freeUseNumber > 0;
  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  if (!isFreeEdit) {
    try {
      reservation = await reserveCredits(supabase, {
        userId: user.id,
        amount: 1,
        action: "inline_edit",
        projectId: typeof body.projectId === "string" ? body.projectId : null,
      });
    } catch (error) {
      console.error("Unable to reserve inline-edit credits:", error);
      return Response.json({ error: "Unable to reserve credits" }, { status: 500 });
    }
    if (!reservation) {
      return Response.json({ error: "Insufficient credits" }, { status: 402 });
    }
  }

  // Count today's (UTC) inline edits — under the free quota, the edit is free
  // and the zero-credit balance gate is skipped entirely.

  const systemPrompt = `You are an expert code editor. The user will provide:
1. A code file with line numbers
2. The selected lines they want to edit (startLine to endLine)
3. An instruction describing what to change

Your job is to rewrite ONLY the selected lines according to the instruction.

Rules:
- Return ONLY the replacement code for the selected lines, nothing else
- Preserve the same indentation style as the original
- Do not add markdown code fences or explanations
- The replacement can have more or fewer lines than the original
- Keep the same language/framework conventions as the surrounding code`;

  const lines = fileContent.split("\n");
  const { startLine, endLine } = selection; // 1-based
  const selectedCode = lines.slice(startLine - 1, endLine).join("\n");
  const beforeContext = lines.slice(Math.max(0, startLine - 6), startLine - 1).join("\n");
  const afterContext = lines.slice(endLine, Math.min(lines.length, endLine + 5)).join("\n");

  const userMessage = `File: ${filePath}

Context before selection (lines ${Math.max(1, startLine - 5)}-${startLine - 1}):
\`\`\`
${beforeContext}
\`\`\`

Selected code to edit (lines ${startLine}-${endLine}):
\`\`\`
${selectedCode}
\`\`\`

Context after selection (lines ${endLine + 1}-${Math.min(lines.length, endLine + 5)}):
\`\`\`
${afterContext}
\`\`\`

Instruction: ${instruction}

Return ONLY the replacement code for lines ${startLine}-${endLine}:`;

  try {
    const result = await generateAI(
      {
        // A few-line selection edit doesn't need the coding workhorse —
        // economy coder by default; explicit model still wins.
        model: model ?? ECONOMY_CODING_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        maxTokens: 2000,
        temperature: 0.2,
        stream: false,
      },
      { userId: user.id, task: "inline_edit" },
    );
    providerReturned = true;
    if (reservation) {
      await settleCreditReservation(supabase, reservation.id, 1);
      reservationSettled = true;
    }

    if (!isFreeEdit) {
      import("@/lib/stripe/auto-topup")
        .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
        .catch(() => {});
    }

    return Response.json({
      replacement: result.content.trim(),
      free: isFreeEdit,
      freeEditsRemainingToday: Math.max(
        0,
        isFreeEdit ? FREE_INLINE_EDITS_PER_DAY - freeUseNumber : 0,
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
        console.error("Inline-edit reservation cleanup failed:", billingError);
      }
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "AI failed" },
      { status: 500 }
    );
  }
}


export const Route = createFileRoute("/api/ai/inline-edit")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
