// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/projects/[id]/generate-knowledge
 *
 * Implements Lovable best-practice #1:
 *   "Generate knowledge for my project at T=0 based on the features
 *    I've already implemented."
 *
 * Reads the project's current files, asks the AI to produce a structured
 * Knowledge document (project vision, key features, tech decisions, design
 * system, do-not-touch areas), and returns the markdown for the user to
 * review before saving.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description, framework")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Pull the current files (cap to 25 most relevant by reasonable heuristic)
  const { data: filesRaw } = await supabase
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", id);
  const files = (filesRaw ?? []) as Array<{ path: string; content: string; language?: string }>;

  if (files.length === 0) {
    return NextResponse.json({ error: "Project has no files yet — generate something first" }, { status: 400 });
  }

  // Heuristic: prefer entry points, layouts, pages, key configs over deep utility files
  const SCORE = (p: string): number => {
    let s = 0;
    if (/(app|src)\/(page|layout|index|main|app)\.(tsx?|jsx?|vue|svelte)$/i.test(p)) s += 100;
    if (/(app|src)\/(routes|pages)\//i.test(p)) s += 50;
    if (/(app|src)\/(components|features)\//i.test(p)) s += 30;
    if (/package\.json$/.test(p)) s += 40;
    if (/README/i.test(p)) s += 80;
    if (/tailwind\.config|next\.config|tsconfig|vite\.config/i.test(p)) s += 20;
    if (/\/node_modules\//.test(p)) s -= 1000;
    return s;
  };
  const ranked = [...files].sort((a, b) => SCORE(b.path) - SCORE(a.path)).slice(0, 25);

  const filesDigest = ranked.map((f) => {
    const trimmed = (f.content ?? "").slice(0, 1500);
    return `### ${f.path}\n\`\`\`${f.language ?? ""}\n${trimmed}\n\`\`\``;
  }).join("\n\n");

  const systemPrompt = `You are an expert technical writer producing a "Knowledge file" for a Lovable-style AI app builder.

The Knowledge file is sent with every prompt and tells the AI the project's identity, conventions, and guardrails. Keep it concise — under 1500 words.

Output a markdown document with these sections (use the headings exactly):

## Project Context
One paragraph: what the app does, who it is for, and the core value proposition.

## Tech Decisions
Bullet list of the libraries, services, and patterns the project commits to (and what it deliberately avoids).

## Design System
Bullet list: color/style conventions, component library choices, animation/transition norms, accessibility expectations.

## Key Features
Bullet list of the major features already implemented or planned.

## Do Not Change
Bullet list of files, components, and layouts the AI should treat as stable unless explicitly asked.

Be specific. Cite real file paths and conventions you observe. Do NOT invent features that aren't in the source. Do NOT use code blocks inside the sections — they are sent as context, not displayed as code.`;

  const userPrompt = `Project name: ${project.name}
Project description: ${project.description ?? "(none)"}
Framework: ${project.framework ?? "React"}
Total files: ${files.length}

Top files (ranked for relevance, content truncated):

${filesDigest}

Generate the Knowledge file now.`;

  try {
    const aiRes = await generateAI({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2000,
    });
    const knowledge = (aiRes.content ?? "").trim();
    return NextResponse.json({ knowledge });
  } catch (err) {
    return NextResponse.json(
      { error: `Knowledge generation failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
