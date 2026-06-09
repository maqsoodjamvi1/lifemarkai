import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export interface ReviewIssue {
  category: "quality" | "security" | "performance" | "bestpractice";
  severity: "error" | "warning" | "info";
  line?: number;
  title: string;
  description: string;
}

export interface ReviewResult {
  issues: ReviewIssue[];
  summary: string;
}

const SYSTEM = `You are a senior software engineer performing a code review.
Analyse the provided file and return a JSON object with this exact shape:
{
  "summary": "<one-sentence overall verdict>",
  "issues": [
    {
      "category": "quality" | "security" | "performance" | "bestpractice",
      "severity": "error" | "warning" | "info",
      "line": <number or null>,
      "title": "<short title>",
      "description": "<one or two sentence explanation>"
    }
  ]
}
Return ONLY valid JSON — no markdown fences, no extra text.
Limit to the 12 most important issues. If the code is clean, return an empty issues array with a positive summary.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { content, filename, language } = await req.json() as {
    content: string;
    filename: string;
    language?: string;
  };

  if (!content?.trim()) {
    return NextResponse.json({ summary: "Empty file — nothing to review.", issues: [] });
  }

  const truncated = content.length > 12000 ? content.slice(0, 12000) + "\n// ... (truncated)" : content;

  try {
    const raw = await generateAI({
      model: getFastAiModel(),
      messages: [
        { role: "user" as const, content: SYSTEM + `\n\nReview this ${language ?? "code"} file (${filename}):\n\n\`\`\`\n${truncated}\n\`\`\`` },
      ],
      jsonMode: true,
      temperature: 0.2,
    });

    const text = raw.content;
    const result: ReviewResult = JSON.parse(text);

    // Validate shape
    if (!result.issues) result.issues = [];
    if (!result.summary) result.summary = "Review complete.";

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Review failed" }, { status: 502 });
  }
}
