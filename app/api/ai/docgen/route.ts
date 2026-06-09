import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

const SYSTEM = `You are an expert TypeScript/JavaScript developer.
Generate a JSDoc (or TSDoc) comment block for the code snippet provided.
Rules:
- Return ONLY the comment block — no code, no markdown fences, no extra text.
- Start with /** and end with */
- Include @param tags for every parameter with inferred types and a brief description
- Include @returns with inferred return type and description (omit for void functions)
- Include @throws if the function clearly throws
- Include @example with a concise realistic usage example (2-4 lines)
- Keep descriptions short and precise — one sentence per tag
- If the snippet is a React component, add @component and describe its purpose and key props
- If the snippet is a type/interface, describe each property with @property
- Use TypeScript types in JSDoc tags where applicable`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { code, filename, language } = await req.json() as {
    code: string;
    filename?: string;
    language?: string;
  };

  if (!code?.trim()) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  const truncated = code.length > 6000 ? code.slice(0, 6000) + "\n// ... (truncated)" : code;

  try {
    const result = await generateAI({
      model: getFastAiModel(),
      messages: [
        {
          role: "user" as const,
          content: `${SYSTEM}\n\nGenerate a JSDoc comment for this ${language ?? "TypeScript"} code from file "${filename ?? "unknown"}":\n\n${truncated}`,
        },
      ],
      temperature: 0.2,
    });

    let docs = result.content.trim();

    // Ensure it starts/ends correctly even if model wrapped it
    if (!docs.startsWith("/**")) {
      const start = docs.indexOf("/**");
      if (start !== -1) docs = docs.slice(start);
    }
    if (!docs.endsWith("*/")) {
      const end = docs.lastIndexOf("*/");
      if (end !== -1) docs = docs.slice(0, end + 2);
    }

    return NextResponse.json({ docs });
  } catch {
    return NextResponse.json({ error: "Doc generation failed" }, { status: 502 });
  }
}
