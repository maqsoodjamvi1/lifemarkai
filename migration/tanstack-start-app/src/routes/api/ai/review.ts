// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import type { ReviewIssue, ReviewResult } from "@/lib/ai/review-types";

export type { ReviewIssue, ReviewResult } from "@/lib/ai/review-types";

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

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { content, filename, language } = await req.json() as {
    content: string;
    filename: string;
    language?: string;
  };

  if (!content?.trim()) {
    return Response.json({ summary: "Empty file — nothing to review.", issues: [] });
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
      maxTokens: 1500, // review JSON of one file — cap output spend
    }, { userId: user.id, task: "code_review" });

    const text = raw.content;
    const result: ReviewResult = JSON.parse(text);

    // Validate shape
    if (!result.issues) result.issues = [];
    if (!result.summary) result.summary = "Review complete.";

    return Response.json(result);
  } catch {
    return Response.json({ error: "Review failed" }, { status: 502 });
  }
}


export const Route = createFileRoute("/api/ai/review")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
