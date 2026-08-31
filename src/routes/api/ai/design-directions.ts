import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { DESIGN_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";
import {
  buildDesignPreviewSystemPrompt,
  buildFallbackDesignPreviews,
  getDesignPreviewContext,
  parseDesignPreviewResponse,
} from "@/lib/ai/design-previews";


async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const { prompt } = body;

  if (!prompt || typeof prompt !== "string" || prompt.length < 3) {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  try {
    const result = await generateAI(
      {
        // Design ideation belongs on the purpose-built design tier (cheaper
        // than the coding workhorse and better at aesthetics).
        model: DESIGN_MODEL,
        messages: [
          { role: "system", content: buildDesignPreviewSystemPrompt(prompt) },
          { role: "user", content: `App/feature description: ${prompt.slice(0, 500)}` },
        ],
        maxTokens: 4000,
        temperature: 0.7,
        stream: false,
        jsonMode: true,
      },
      { userId: user.id, task: "design_directions" },
    );

    let directions = parseDesignPreviewResponse(result.content ?? "");
    if (directions.length < 3) {
      directions = buildFallbackDesignPreviews(prompt, user.id);
    }
    return Response.json({
      directions: directions.map((direction) => ({
        id: direction.id,
        label: direction.label,
        description: direction.desc,
        html: direction.previewHtml,
        colors: direction.colors,
      })),
      ...getDesignPreviewContext(prompt),
    });
  } catch (err) {
    const fallback = buildFallbackDesignPreviews(prompt, user.id);
    return Response.json({
      directions: fallback.map((direction) => ({
        id: direction.id,
        label: direction.label,
        description: direction.desc,
        html: direction.previewHtml,
        colors: direction.colors,
      })),
      degraded: true,
      warning: err instanceof Error ? err.message : "Generation failed",
      ...getDesignPreviewContext(prompt),
    });
  }
}


export const Route = createFileRoute("/api/ai/design-directions")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
