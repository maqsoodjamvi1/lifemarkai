import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert QA engineer specialising in Playwright end-to-end testing.
Given a description of a web app and its preview URL, generate a comprehensive Playwright test suite.

Return a JSON object with this exact shape:
{
  "testPath": "string",   // e.g. e2e/home.spec.ts
  "content": "string",    // full Playwright test file content
  "language": "typescript",
  "summary": "string"     // 1-sentence description of what's tested
}

Rules:
- Use Playwright (@playwright/test) — import { test, expect } from '@playwright/test'
- Write test.describe blocks with 4-8 individual test cases
- Cover: page load, key UI elements visible, navigation, form interactions, accessibility (tab order, aria labels)
- Use page.goto(baseURL) at the start — baseURL comes from playwright.config.ts
- Use descriptive test names in plain English
- Add realistic expect().toBeVisible(), expect().toHaveText(), expect().toHaveURL() assertions
- Include a test for mobile viewport using page.setViewportSize
- Comment each describe block with what it validates
- Only return the raw JSON — no markdown, no explanation`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Grant today's daily free credits before the balance gate (migration 063)
  await (await import("@/lib/credits")).claimDailyCredits(supabase, user.id);
  const { data: profile } = await (supabase as any)
    .from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json();
  const { projectId, projectName, previewUrl, description, filesSample } = body;

  if (!projectId || !projectName) {
    return NextResponse.json({ error: "projectId and projectName required" }, { status: 400 });
  }

  const userMessage = `Generate Playwright e2e tests for the following web app.

App name: ${projectName}
Preview URL: ${previewUrl || "http://localhost:3000"}
${description ? `App description: ${description}` : ""}
${filesSample ? `\nSource code sample:\n\`\`\`\n${filesSample.slice(0, 6000)}\n\`\`\`` : ""}

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

    let parsed: { testPath: string; content: string; language: string; summary: string };
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
      action: "generate_browser_tests",
      project_id: projectId,
    });

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return NextResponse.json({ file, summary: parsed.summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
