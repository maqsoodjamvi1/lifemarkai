import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { AUTOCOMPLETE_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";

// POST /api/ai/complete
// Body: { projectId, prefix, suffix, language, filename }
// Returns: { completion: string }
async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Use a more permissive limit since completions fire frequently
  const rl = await rateLimitAsync(user.id, { ...RATE_LIMITS.ai, limit: 60 });
  if (!rl.success) return Response.json({ completion: "" }, { status: 200 });

  let body: { projectId?: string; prefix?: string; suffix?: string; language?: string; filename?: string };
  try { body = await req.json(); } catch { body = {}; }

  const { projectId, prefix = "", suffix = "", language = "typescript", filename = "" } = body;
  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

  // Verify ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, name, framework")
    .eq("id", projectId)
    .single();

  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Keep context window small — last 1500 chars of prefix, first 200 of suffix
  const trimmedPrefix = prefix.slice(-1500);
  const trimmedSuffix = suffix.slice(0, 200);

  const systemPrompt = `You are an expert ${language} code completion engine.
Complete the code at the cursor position (marked by <CURSOR>).
Rules:
- Output ONLY the completion text — no explanation, no markdown, no code fences
- Keep the completion short: 1–4 lines maximum
- Match the existing indentation and style exactly
- Do not repeat code that already exists before or after the cursor
- If no meaningful completion exists, output an empty string`;

  const userPrompt = `File: ${filename || "untitled"}
Language: ${language}
Framework: ${project.framework ?? "react"}

<PREFIX>${trimmedPrefix}</PREFIX><CURSOR><SUFFIX>${trimmedSuffix}</SUFFIX>`;

  try {
    const response = await generateAI({
      // Latency-critical: dedicated fast PAID model, not the (free) fast tier —
      // autocomplete at keystroke frequency can't ride a 20 req/min shared pool.
      model: AUTOCOMPLETE_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 120,
    }, { projectId, userId: user.id, task: "code_completion" });

    const raw = response.content ?? "";
    // Strip any accidental code fences
    const completion = raw
      .replace(/^```[\w]*\n?/, "")
      .replace(/\n?```$/, "")
      .trimEnd();

    return Response.json({ completion });
  } catch {
    return Response.json({ completion: "" });
  }
}


export const Route = createFileRoute("/api/ai/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
