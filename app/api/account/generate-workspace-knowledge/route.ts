// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";

/**
 * POST /api/account/generate-workspace-knowledge
 *
 * Builds a workspace-level Knowledge draft from the user's recent projects.
 * Looks for repeated tech, naming conventions, and rules that appear across
 * many projects, and turns them into global rules.
 *
 * Returns: { knowledge: string }
 */
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Grab the 10 most recent projects with their per-project knowledge field
  const { data: projects } = await supabase
    .from("projects")
    .select("name, description, framework, knowledge")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  const list = (projects ?? []) as Array<{
    name: string; description?: string | null;
    framework?: string | null; knowledge?: string | null;
  }>;

  if (list.length === 0) {
    return NextResponse.json({
      error: "No projects yet — create a project first, then generate workspace rules from it."
    }, { status: 400 });
  }

  const summary = list.map((p) => {
    const knowledgeSnippet = (p.knowledge ?? "").trim().slice(0, 1200);
    return `## ${p.name} (${p.framework ?? "unknown framework"})
${p.description ?? ""}
${knowledgeSnippet ? `\nProject Knowledge:\n${knowledgeSnippet}` : ""}`;
  }).join("\n\n---\n\n");

  const systemPrompt = `You are a senior engineer drafting a "Workspace Knowledge" document for a Lovable-style AI builder.

Workspace Knowledge applies to EVERY project in the user's workspace. It should capture global rules that the user clearly prefers — but only ones that recur across multiple projects, not project-specific decisions.

From the summaries below, extract:
1. Repeated tech stack choices (e.g., "always uses Next.js + Supabase").
2. Recurring style/UI conventions (e.g., "always Tailwind + shadcn/ui").
3. Coding conventions you can infer (e.g., "TypeScript strict, no inline styles").
4. Things explicitly mentioned multiple times in per-project Knowledge.

Output a compact markdown document, under 800 words, with these sections (use the exact headings):

## Tech Defaults
Bullet list of stacks and libraries the user defaults to across projects.

## Style & UI Conventions
Bullet list of styling, animation, and component-library rules.

## Coding Standards
Bullet list of language/framework conventions (TypeScript strict, error handling, file structure).

## What I Avoid
Bullet list of things the user consistently does NOT use.

Be specific, cite what you observed. Do NOT invent rules. If you can't extract enough for a section, write a single bullet "(no clear pattern across projects)".`;

  const userPrompt = `Recent projects (${list.length}):\n\n${summary}\n\nDraft the Workspace Knowledge document now.`;

  try {
    const aiRes = await generateAI({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
    });
    return NextResponse.json({ knowledge: (aiRes.content ?? "").trim() });
  } catch (err) {
    return NextResponse.json(
      { error: `Generation failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
