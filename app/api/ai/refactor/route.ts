import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export type RefactorType =
  | "extract-function"
  | "add-types"
  | "simplify"
  | "add-error-handling"
  | "add-comments"
  | "convert-async";

const REFACTOR_PROMPTS: Record<RefactorType, string> = {
  "extract-function":
    "Extract the selected code into a well-named helper function. Place the function definition immediately before the usage site and replace the original code with a call to it. Preserve all existing logic exactly.",
  "add-types":
    "Add full TypeScript type annotations to all parameters, return types, and variables that currently lack them. Do not change any logic.",
  "simplify":
    "Simplify and clean up the code: remove redundancy, use modern JS/TS idioms, shorten verbose patterns. Preserve behaviour exactly.",
  "add-error-handling":
    "Wrap the code in proper try/catch (or .catch) error handling. For async code use try/catch. Log or re-throw errors appropriately. Preserve the happy path.",
  "add-comments":
    "Add concise inline comments and a JSDoc block explaining what the code does. Do not change any logic.",
  "convert-async":
    "Convert callback-style or Promise-chain code to async/await. Preserve behaviour exactly.",
};

const SYSTEM = `You are an expert TypeScript/React developer performing a precise code refactoring.
Return ONLY the refactored code — no markdown fences, no explanation, no surrounding text.
Preserve indentation and formatting of the original code exactly (match the leading whitespace).
Do not add or remove blank lines at the start or end of the output.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { code, refactorType, filename, language, context } = await req.json() as {
    code: string;
    refactorType: RefactorType;
    filename?: string;
    language?: string;
    context?: string; // surrounding lines for better understanding
  };

  if (!code?.trim()) return NextResponse.json({ error: "No code provided" }, { status: 400 });
  if (!REFACTOR_PROMPTS[refactorType]) return NextResponse.json({ error: "Unknown refactor type" }, { status: 400 });

  const instruction = REFACTOR_PROMPTS[refactorType];
  const truncatedContext = context ? context.slice(0, 3000) : "";
  const truncatedCode = code.length > 8000 ? code.slice(0, 8000) + "\n// ... (truncated)" : code;

  const prompt = [
    SYSTEM,
    `\nFile: ${filename ?? "unknown"} (${language ?? "TypeScript"})`,
    truncatedContext ? `\nSurrounding context:\n\`\`\`\n${truncatedContext}\n\`\`\`` : "",
    `\nRefactor instruction: ${instruction}`,
    `\nCode to refactor:\n${truncatedCode}`,
  ].join("\n");

  try {
    const result = await generateAI({
      model: getFastAiModel(),
      messages: [{ role: "user" as const, content: prompt }],
      temperature: 0.15,
    });

    let refactored = result.content.trim();

    // Strip accidental markdown fences
    if (refactored.startsWith("```")) {
      refactored = refactored.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
    }

    return NextResponse.json({ refactored });
  } catch {
    return NextResponse.json({ error: "Refactor failed" }, { status: 502 });
  }
}
