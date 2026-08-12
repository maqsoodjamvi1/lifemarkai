import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    prompt: string;
    projectId?: string;
    schema?: string; // optional table schema context
  };

  if (!body.prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  // Build schema context from Supabase if projectId given
  let schemaContext = body.schema ?? "";
  if (!schemaContext && body.projectId) {
    // Load .env.local to try to extract DB url hint (just metadata)
    const { data: envFile } = await supabase
      .from("project_files")
      .select("content")
      .eq("project_id", body.projectId)
      .eq("path", "supabase/migrations/001_initial_schema.sql")
      .maybeSingle();
    if (envFile?.content) {
      schemaContext = (envFile.content as string).slice(0, 3000);
    }
  }

  const systemPrompt = `You are a PostgreSQL expert. Convert natural language into a precise SQL query.
${schemaContext ? `\nDatabase schema context:\n\`\`\`sql\n${schemaContext}\n\`\`\`` : ""}

Rules:
- Return ONLY the SQL query, no explanation, no markdown fences
- Use standard PostgreSQL syntax
- Prefer SELECT queries unless the user explicitly asks to INSERT/UPDATE/DELETE
- Use meaningful aliases
- Add LIMIT 100 to SELECT queries unless a specific limit is requested
- Never generate DROP, TRUNCATE, or ALTER TABLE statements`;

  const result = await generateAI({
    // One-shot NL→SQL is light work — fast tier, not the coding workhorse.
    model: getFastAiModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: body.prompt },
    ],
    temperature: 0.1,
    maxTokens: 512,
  }, { projectId: body.projectId, userId: user.id, task: "sql_generation" });

  const sql = result.content?.trim() ?? "";

  // Strip accidental markdown fences
  const cleaned = sql
    .replace(/^```sql\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  return Response.json({ sql: cleaned });
}


export const Route = createFileRoute("/api/ai/sql")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
