// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { data: profile } = await (supabase as any)
    .from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json();
  const { filePath, fileContent, selection, instruction, model } = body;

  if (!instruction || typeof instruction !== "string" || instruction.length > 2000) {
    return NextResponse.json({ error: "Invalid instruction" }, { status: 400 });
  }
  if (!fileContent || typeof fileContent !== "string") {
    return NextResponse.json({ error: "Missing file content" }, { status: 400 });
  }

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
    const result = await generateAI({
      model: model ?? getDefaultAiModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      maxTokens: 2000,
      temperature: 0.2,
      stream: false,
    });

    // Deduct 1 credit
    await (supabase as any).rpc("deduct_credits", {
      user_id: user.id,
      amount: 1,
      action: "inline_edit",
      project_id: null,
    });

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return NextResponse.json({ replacement: result.content.trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI failed" },
      { status: 500 }
    );
  }
}
