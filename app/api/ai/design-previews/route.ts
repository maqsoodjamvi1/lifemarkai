import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { DESIGN_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  DESIGN_PREVIEW_SYSTEM_PROMPT,
  sanitizePreviewHtml,
  shouldOfferDesignPreviews,
  type DesignPreviewDirection,
} from "@/lib/ai/design-previews";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  await (await import("@/lib/credits")).claimDailyCredits(supabase, user.id);
  const { data: profile } = await (supabase as any)
    .from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json();
  const { prompt, projectId, fileCount = 0, force = false } = body as {
    prompt?: string;
    projectId?: string;
    fileCount?: number;
    force?: boolean;
  };

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }
  if (!force && !shouldOfferDesignPreviews(prompt, fileCount)) {
    return NextResponse.json({ skip: true, directions: [] });
  }

  try {
    const result = await generateAI({
      model: DESIGN_MODEL,
      messages: [
        { role: "system", content: DESIGN_PREVIEW_SYSTEM_PROMPT },
        { role: "user", content: `Build request:\n${prompt}` },
      ],
      maxTokens: 3500,
      temperature: 0.7,
      stream: false,
      jsonMode: true,
    });

    const raw = result.content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(raw) as { directions?: DesignPreviewDirection[] };
    const directions = (parsed.directions ?? [])
      .slice(0, 3)
      .map((d) => ({
        ...d,
        previewHtml: sanitizePreviewHtml(d.previewHtml ?? ""),
      }))
      .filter((d) => d.id && d.label && d.previewHtml);

    if (directions.length < 3) {
      return NextResponse.json({ error: "Could not generate three previews" }, { status: 500 });
    }

    // Lovable bundles design guidance into the build flow — no separate credit charge.

    return NextResponse.json({ directions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preview generation failed" },
      { status: 500 },
    );
  }
}
