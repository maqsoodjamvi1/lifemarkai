import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { FAST_CODING_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";

export const runtime = "nodejs";
export const maxDuration = 30;

const SUMMARISE_SYSTEM = `You are a concise technical summariser for an AI coding assistant.
You will receive a series of chat messages between a user and an AI that discuss a software project.
Your task: produce a dense, factual summary (max 400 words) that captures:
- What was built / changed (component names, files, features)
- Key decisions made (architecture, libraries chosen, API endpoints added)
- Open issues, bugs mentioned, or things left TODO
- The current state of the project at the end of the conversation

Write in present tense. Be specific with names and file paths. No preamble or meta-commentary.`;

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: projectId } = await params;

    const access = await getProjectAccess(supabase, projectId, user.id);
    if (!canWriteProjectFiles(access)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data: project } = await (supabase as any)
      .from("projects")
      .select("id, name, metadata")
      .eq("id", projectId)
      .single();

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    // Rate-limit (reuse AI limiter)
    const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

    // Fetch messages to summarise — everything except the most recent 10
    const { data: allMessages } = await (supabase as any)
      .from("messages")
      .select("role, content, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    const msgs = (allMessages ?? []) as Array<{ role: string; content: string }>;

    if (msgs.length < 15) {
      return NextResponse.json({ summary: null, message: "Not enough messages to summarise" });
    }

    // Summarise everything except the most recent 10 messages
    const toSummarise = msgs.slice(0, -10);

    const conversation = toSummarise
      .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content.slice(0, 800)}`)
      .join("\n\n");

    let summary = "";
    await generateAI({
      model: FAST_CODING_MODEL,
      messages: [
        { role: "system", content: SUMMARISE_SYSTEM },
        {
          role: "user",
          content: `Project: "${project.name}"\n\nConversation history:\n\n${conversation}`,
        },
      ],
      temperature: 0.3,
      stream: true,
      onChunk: (chunk: string) => { summary += chunk; },
    });

    summary = summary.trim();

    // Persist in project metadata
    const existingMeta = (project.metadata as Record<string, unknown>) ?? {};
    await (supabase as any)
      .from("projects")
      .update({
        metadata: {
          ...existingMeta,
          context_summary: summary,
          context_summary_at: new Date().toISOString(),
          context_summary_covers: toSummarise.length,
        },
      })
      .eq("id", projectId);

    return NextResponse.json({ summary, messagesCompressed: toSummarise.length });
  } catch (err) {
    console.error("[summarise]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
