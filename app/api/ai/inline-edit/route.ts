// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  cancelCreditReservation,
  claimFreeCreditAction,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Free daily inline-edit quota (Lovable parity): the first N inline edits per
 * user per UTC day cost 0 credits. Usage is still logged to credit_logs via a
 * dedicated self-scoped audit RPC so the count survives
 * restarts and is enforceable server-side. Edit #101+ costs 1 credit as before.
 */
const FREE_INLINE_EDITS_PER_DAY = 100;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Grant today's daily free credits before the balance gate (migration 063)
  const body = await req.json();
  const { filePath, fileContent, selection, instruction, model } = body;
  if (!instruction || typeof instruction !== "string" || instruction.length > 2000) {
    return NextResponse.json({ error: "Invalid instruction" }, { status: 400 });
  }
  if (!fileContent || typeof fileContent !== "string" || fileContent.length > 500_000) {
    return NextResponse.json({ error: "Missing or oversized file content" }, { status: 400 });
  }
  if (typeof filePath !== "string" || filePath.length > 1000) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }
  if (
    !selection
    || !Number.isInteger(selection.startLine)
    || !Number.isInteger(selection.endLine)
    || selection.startLine < 1
    || selection.endLine < selection.startLine
  ) {
    return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  }

  let freeUseNumber: number;
  let providerReturned = false;
  let reservationSettled = false;
  try {
    freeUseNumber = await claimFreeCreditAction(supabase, {
      userId: user.id,
      action: "inline_edit",
      dailyLimit: FREE_INLINE_EDITS_PER_DAY,
    });
  } catch (error) {
    console.error("Unable to claim inline-edit quota:", error);
    return NextResponse.json({ error: "Unable to verify the daily edit quota" }, { status: 500 });
  }
  const isFreeEdit = freeUseNumber > 0;
  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  if (!isFreeEdit) {
    try {
      reservation = await reserveCredits(supabase, {
        userId: user.id,
        amount: 1,
        action: "inline_edit",
      });
    } catch (error) {
      console.error("Unable to reserve inline-edit credits:", error);
      return NextResponse.json({ error: "Unable to reserve credits" }, { status: 500 });
    }
    if (!reservation) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
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
        model: model ?? getDefaultAiModel(),
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

    return NextResponse.json({
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI failed" },
      { status: 500 }
    );
  }
}
