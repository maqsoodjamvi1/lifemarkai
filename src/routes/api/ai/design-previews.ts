import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { DESIGN_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";
import { claimDailyCredits } from "@/lib/credits";
import {
buildDesignPreviewSystemPrompt,
buildFallbackDesignPreviews,
getDesignPreviewContext,
parseDesignPreviewResponse,
shouldOfferDesignPreviews,
} from "@/lib/ai/design-previews";


async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  await claimDailyCredits(supabase, user.id);
  const { data: profile } = await supabase
    .from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits <= 0) {
    return Response.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json();
  const { prompt, projectId, fileCount = 0, force = false } = body as {
    prompt?: string;
    projectId?: string;
    fileCount?: number;
    force?: boolean;
  };

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }
  if (!force && !shouldOfferDesignPreviews(prompt, fileCount)) {
    return Response.json({ skip: true, directions: [] });
  }

  try {
    const result = await generateAI(
      {
        model: DESIGN_MODEL,
        messages: [
          { role: "system", content: buildDesignPreviewSystemPrompt(prompt) },
          { role: "user", content: `Build request:\n${prompt}` },
        ],
        maxTokens: 2800,
        temperature: 0.55,
        stream: false,
        jsonMode: true,
      },
      { projectId, userId: user.id, task: "design_previews" },
    );

    let directions = parseDesignPreviewResponse(result.content ?? "");
    if (directions.length < 3) {
      // Model often breaks JSON on long previewHtml — never surface raw parse errors.
      const fallback = buildFallbackDesignPreviews(prompt, projectId ?? user.id);
      const byId = new Map(fallback.map((d) => [d.id, d]));
      for (const d of directions) byId.set(d.id, d);
      directions = [...byId.values()].slice(0, 3);
      if (directions.length < 3) directions = fallback;
    }

    return Response.json({ directions, ...getDesignPreviewContext(prompt) });
  } catch (err) {
    // Soft-fail: still return usable direction cards so the user can pick/skip.
    console.error("[design-previews]", err instanceof Error ? err.message : err);
    return Response.json({
      directions: buildFallbackDesignPreviews(prompt, projectId ?? user.id),
      degraded: true,
      ...getDesignPreviewContext(prompt),
    });
  }
}


export const Route = createFileRoute("/api/ai/design-previews")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
