// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { AUTO_FIX_SYSTEM_PROMPT } from "@/lib/ai/system-prompts";

function parseFixResponse(raw: string): {
  files: Array<{ path: string; content: string }>;
  explanation: string;
} {
  const trimmed = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON object in AI response");

  const parsed = JSON.parse(jsonMatch[0]) as {
    files?: Array<{ path: string; content: string }>;
    explanation?: string;
    fix_description?: string;
    diagnosis?: string;
  };

  if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error("AI response missing files array");
  }

  return {
    files: parsed.files,
    explanation:
      parsed.explanation ??
      parsed.fix_description ??
      parsed.diagnosis ??
      "Fixed the error — check the preview.",
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

  const { projectId, error: buildError, files } = await req.json();

  if (!projectId || !buildError) {
    return NextResponse.json({ error: "projectId and error are required" }, { status: 400 });
  }

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  if (!profile || profile.credits < 1) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const fileList = Array.isArray(files) ? files : [];
  const fileContext = fileList
    .slice(0, 10)
    .map((f: { path: string; content: string }) => `=== ${f.path} ===\n${f.content}`)
    .join("\n\n");

  const userPrompt = `Fix this build/runtime error:

\`\`\`
${buildError}
\`\`\`

Current files:
${fileContext}

Return the fixed files as JSON.`;

  try {
    const result = await generateAI({
      model: (process.env.DEFAULT_AI_MODEL as import("@/lib/ai/provider").AIModel) ?? "deepseek/deepseek-chat-v3-0324",
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

    await (supabase as any).rpc("deduct_credits" as never, {
      user_id: user.id,
      amount: 1,
      action: "auto_fix",
      project_id: projectId,
      description: `Auto-fixed: ${buildError.slice(0, 80)}`,
    });

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return NextResponse.json({
      files: parsed.files,
      explanation: parsed.explanation,
      tokensUsed: result.tokensUsed ?? 0,
    });
  } catch (err) {
    console.error("Auto-fix error:", err);
    return NextResponse.json(
      { error: "Failed to auto-fix. Please fix manually." },
      { status: 500 }
    );
  }
}
