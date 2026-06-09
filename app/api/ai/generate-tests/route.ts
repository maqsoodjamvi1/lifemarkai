import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert software engineer specialising in testing.
Given a source file, generate comprehensive Vitest unit tests.

Return a JSON object with this shape:
{
  "testPath": "string",   // e.g. src/utils/__tests__/math.test.ts
  "content": "string",    // full test file content
  "language": "typescript"
}

Rules:
- Use Vitest (import { describe, it, expect, vi } from 'vitest')
- Use React Testing Library for React/JSX components (@testing-library/react)
- Write describe/it blocks that cover happy paths, edge cases, and error states
- Mock external dependencies (fetch, Supabase, etc.) with vi.mock
- Keep tests independent — no shared mutable state between tests
- Put test file next to the source file in a __tests__ folder
- Use TypeScript — add proper type annotations
- Return only the raw JSON object — no markdown, no explanation`;

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
  const { projectId, filePath, fileContent } = body;

  if (!filePath || !fileContent) {
    return NextResponse.json({ error: "filePath and fileContent required" }, { status: 400 });
  }
  if (fileContent.length > 12000) {
    return NextResponse.json({ error: "File too large (max 12,000 chars)" }, { status: 400 });
  }

  const userMessage = `Generate Vitest tests for the following file.

File path: ${filePath}

File content:
\`\`\`
${fileContent}
\`\`\`

Return only the JSON object.`;

  try {
    const result = await generateAI({
      model: getDefaultAiModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 4000,
      temperature: 0.2,
      stream: false,
      jsonMode: true,
    });

    let parsed: { testPath: string; content: string; language: string };
    try {
      parsed = JSON.parse(result.content);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 });
    }

    if (!parsed.testPath || !parsed.content) {
      return NextResponse.json({ error: "AI returned incomplete data" }, { status: 500 });
    }

    // Upsert into project files
    const { data: file, error } = await (supabase as any)
      .from("project_files")
      .upsert(
        {
          project_id: projectId,
          path: parsed.testPath,
          content: parsed.content,
          language: parsed.language ?? "typescript",
        },
        { onConflict: "project_id,path" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Deduct 1 credit
    await (supabase as any).rpc("deduct_credits", {
      user_id: user.id,
      amount: 1,
      action: "generate_tests",
      project_id: projectId,
    });

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return NextResponse.json({ file });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
