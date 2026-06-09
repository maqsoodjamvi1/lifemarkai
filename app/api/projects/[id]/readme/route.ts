import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { FAST_CODING_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// POST /api/projects/[id]/readme
// Reads project files, generates a README.md with AI, upserts it as a project file.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: same tier as AI chat
  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  // Verify ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, name, description, user_id, framework")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load project files (limit to relevant ones for context)
  const { data: files } = await (supabase as any)
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", id)
    .not("path", "ilike", "node_modules/%")
    .not("path", "ilike", ".next/%")
    .not("path", "ilike", "dist/%")
    .order("path")
    .limit(40);

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No project files found." }, { status: 400 });
  }

  // Build a concise file summary (keep full content for small files, truncate large ones)
  const fileSummary = (files as Array<{ path: string; content: string; language: string }>)
    .filter((f) => !f.path.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i))
    .map((f) => {
      const content = (f.content ?? "").slice(0, 400);
      return `### ${f.path}\n\`\`\`${f.language ?? ""}\n${content}${(f.content ?? "").length > 400 ? "\n// ... truncated" : ""}\n\`\`\``;
    })
    .join("\n\n");

  const systemPrompt = `You are a technical writer. Generate a professional, concise README.md for a web application project.

The README must include:
1. # Project Name (use the actual project name)
2. A 2-3 sentence description of what the app does
3. ## Features — bullet list of key features inferred from the code
4. ## Tech Stack — technologies identified from the files
5. ## Getting Started — setup instructions (npm install, env vars, npm run dev)
6. ## Project Structure — brief overview of key directories/files
7. ## Environment Variables — list any env vars seen in the code (mask values with placeholders)

Format: Clean Markdown. Be specific and accurate based on what's actually in the code. Keep it under 400 lines.`;

  const userPrompt = `Project name: ${project.name}
Description: ${project.description ?? "Not provided"}
Framework: ${project.framework ?? "Not specified"}

Project files:
${fileSummary}

Generate a complete README.md for this project.`;

  let readme: string;
  try {
    const response = await generateAI({
      model: FAST_CODING_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2000,
    });
    readme = response.content ?? "";
  } catch (e) {
    return NextResponse.json({ error: "AI generation failed: " + String(e) }, { status: 500 });
  }

  if (!readme.trim()) {
    return NextResponse.json({ error: "AI returned empty response." }, { status: 500 });
  }

  // Upsert README.md as a project file
  const { data: existing } = await (supabase as any)
    .from("project_files")
    .select("id")
    .eq("project_id", id)
    .eq("path", "README.md")
    .maybeSingle();

  if (existing) {
    await (supabase as any)
      .from("project_files")
      .update({ content: readme, language: "markdown" })
      .eq("id", existing.id);
  } else {
    await (supabase as any)
      .from("project_files")
      .insert({
        project_id: id,
        path: "README.md",
        content: readme,
        language: "markdown",
      });
  }

  return NextResponse.json({ content: readme, path: "README.md" });
}
