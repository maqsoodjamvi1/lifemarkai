import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

interface ChangedFile {
  path: string;
  content?: string; // truncated snippet
}

// POST /api/ai/commit-message
// Body: { projectId: string, changedFiles: ChangedFile[] }
// Returns: { message: string }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  let body: { projectId?: string; changedFiles?: ChangedFile[] };
  try { body = await req.json(); } catch { body = {}; }

  const { projectId, changedFiles = [] } = body;
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (changedFiles.length === 0) return NextResponse.json({ error: "No changed files" }, { status: 400 });

  // Verify ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, name, framework")
    .eq("id", projectId)
    .single();

  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build a concise diff summary (max 300 chars per file)
  const fileSummary = changedFiles
    .slice(0, 20) // cap
    .map((f) => {
      const snippet = (f.content ?? "").slice(0, 300);
      return `- ${f.path}${snippet ? `\n  ${snippet.replace(/\n/g, "\n  ")}` : ""}`;
    })
    .join("\n");

  const systemPrompt = `You are a senior software engineer writing git commit messages.
Generate a single, concise commit message following the Conventional Commits format:
  <type>(<scope>): <short description>

Rules:
- type: feat | fix | chore | refactor | style | docs | test | perf
- scope: short component or area name (optional but preferred)
- description: imperative mood, lowercase, no period, max 72 chars total
- Output ONLY the commit message string — no explanation, no quotes, no markdown`;

  const userPrompt = `Project: ${project.name} (${project.framework ?? "web app"})
Changed files:
${fileSummary}

Generate a commit message for these changes.`;

  try {
    const response = await generateAI({
      model: (process.env.FAST_AI_MODEL as import("@/lib/ai/provider").AIModel) ?? "deepseek/deepseek-chat-v3-0324",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 80,
    });

    const message = (response.content ?? "").trim().replace(/^["']|["']$/g, "");
    if (!message) return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });

    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json({ error: "AI generation failed: " + String(e) }, { status: 500 });
  }
}
