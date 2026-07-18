// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { CONTENT_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/generate-file
 *
 * Chat-based standalone file generation (Lovable parity). Produces a single
 * downloadable document from a prompt WITHOUT touching project source files —
 * the client renders the result as a download card (blob URL).
 *
 * Body:    { projectId: string, prompt: string, format: "md"|"csv"|"json"|"txt"|"html" }
 * Returns: { filename, content, mimeType }
 */

const FORMATS: Record<
  string,
  { ext: string; mimeType: string; instructions: string }
> = {
  md: {
    ext: "md",
    mimeType: "text/markdown",
    instructions:
      "Output well-structured Markdown (headings, lists, tables where useful). No surrounding code fences.",
  },
  csv: {
    ext: "csv",
    mimeType: "text/csv",
    instructions:
      "Output ONLY valid CSV. First row is the header. Quote fields containing commas or newlines. No prose, no code fences.",
  },
  json: {
    ext: "json",
    mimeType: "application/json",
    instructions:
      "Output ONLY valid, parseable JSON (an object or array). No comments, no trailing commas, no prose, no code fences.",
  },
  txt: {
    ext: "txt",
    mimeType: "text/plain",
    instructions: "Output plain text only. No Markdown syntax, no code fences.",
  },
  html: {
    ext: "html",
    mimeType: "text/html",
    instructions:
      "Output a single complete, self-contained HTML document (inline CSS allowed, no external assets). No code fences.",
  },
};

/** Derive a safe filename slug from the prompt, e.g. "Q3 sales report" → "q3-sales-report". */
function slugFromPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return slug || "generated-file";
}

/** Strip a wrapping markdown code fence the model may add despite instructions. */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const { projectId, prompt, format } = body as {
    projectId?: string;
    prompt?: string;
    format?: string;
  };

  if (!prompt || typeof prompt !== "string" || prompt.length > 4000) {
    return NextResponse.json({ error: "Invalid prompt" }, { status: 400 });
  }
  const fmt = FORMATS[typeof format === "string" ? format : ""];
  if (!fmt) {
    return NextResponse.json(
      { error: `Invalid format — expected one of: ${Object.keys(FORMATS).join(", ")}` },
      { status: 400 }
    );
  }

  const systemPrompt = `You are a document generator. Produce the CONTENT of a single .${fmt.ext} file that fulfills the user's request.

Rules:
- ${fmt.instructions}
- Return ONLY the raw file content — no explanations before or after.
- Be complete and production-quality; invent sensible realistic details when the request is open-ended.`;

  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  let billableOutput = false;
  let reservationFinalized = false;

  try {
    reservation = await reserveCredits(supabase, {
      userId: user.id,
      amount: 1,
      action: "generate_file",
      projectId: projectId ?? null,
    });
    if (!reservation) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const result = await generateAI(
      {
        // Standalone md/csv/json/txt/html documents are writing work —
        // content tier, not the coding workhorse.
        model: CONTENT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        maxTokens: 8000,
        temperature: 0.4,
        stream: false,
      },
      { projectId, userId: user.id, task: "standalone_file_generation" }
    );
    billableOutput = true;

    const content = stripFence(result.content ?? "");
    if (!content) {
      throw new Error("AI returned empty content");
    }

    await settleCreditReservation(supabase, reservation.id, 1);
    reservationFinalized = true;

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return NextResponse.json({
      filename: `${slugFromPrompt(prompt)}.${fmt.ext}`,
      content,
      mimeType: fmt.mimeType,
    });
  } catch (err) {
    if (reservation && !reservationFinalized) {
      try {
        if (billableOutput) {
          await settleCreditReservation(supabase, reservation.id, 1);
        } else {
          await cancelCreditReservation(supabase, reservation.id);
        }
      } catch (billingError) {
        console.error("[ai/generate-file] Failed to finalize credit reservation", billingError);
      }
    }

    const status = err instanceof Error && err.message === "AI returned empty content" ? 502 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI failed" },
      { status }
    );
  }
}
