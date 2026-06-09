import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Returns 3 real rendered HTML/Tailwind previews (like Lovable's design-before-build feature)
const SYSTEM_PROMPT = `You are a senior UI designer. Given a brief description of an app or feature,
generate exactly 3 distinct design directions as self-contained HTML snippets.

Each snippet is a small card/section preview (not a full page) — roughly a hero section, a dashboard card, or a landing section —
that shows the visual direction: colours, typography, layout, and style.

Return ONLY valid JSON in this exact shape:
{
  "directions": [
    {
      "id": "minimal",
      "label": "Clean & Minimal",
      "description": "One sentence describing this direction",
      "html": "<!-- FULL self-contained HTML using Tailwind CDN + inline styles -->"
    },
    {
      "id": "bold",
      "label": "Bold & Vibrant",
      "description": "One sentence describing this direction",
      "html": "..."
    },
    {
      "id": "dark",
      "label": "Dark & Modern",
      "description": "One sentence describing this direction",
      "html": "..."
    }
  ]
}

Rules for each HTML snippet:
- Load Tailwind via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Self-contained: no external imports beyond Tailwind CDN
- 280px wide, ~200px tall — compact preview card only (not a full page)
- Use <body class="m-0 p-0 overflow-hidden">
- Each direction must look meaningfully different (colour, font, spacing, style)
- Use realistic dummy content matching the user's description
- No JavaScript — static HTML only
- Direction 1: light/minimal — white bg, subtle borders, muted colours
- Direction 2: bold/colourful — saturated accents, strong contrast
- Direction 3: dark/glass — dark background (#0f0f1a), glassmorphism cards
- Only return the raw JSON — no markdown, no explanation`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const { prompt } = body;

  if (!prompt || typeof prompt !== "string" || prompt.length < 3) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  try {
    const result = await generateAI({
      model: getDefaultAiModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `App/feature description: ${prompt.slice(0, 500)}` },
      ],
      maxTokens: 4000,
      temperature: 0.7,
      stream: false,
      jsonMode: true,
    });

    let parsed: {
      directions: Array<{ id: string; label: string; description: string; html: string }>;
    };

    try {
      const raw = result.content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.directions) || parsed.directions.length !== 3) {
        throw new Error("Invalid structure");
      }
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
