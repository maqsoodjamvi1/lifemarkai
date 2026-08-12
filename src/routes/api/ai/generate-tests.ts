import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { BALANCED_CODING_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";
import {
cancelCreditReservation,
reserveCredits,
settleCreditReservation,
} from "@/lib/credits";


const SYSTEM_PROMPT = `You are an expert software engineer specialising in testing.
Given a source file, generate comprehensive Vitest unit tests.

Return a JSON object with this shape:
{
  "testPath": "string",   // e.g. src/utils/__tests__/math.test.ts
  "content": "string",    // full test file content
  "language": "typescript"
}

Rules:
- Use Vitest (import { describe, it, expect, vi } from 'vitest')
- Use React Testing Library for React/JSX components (@testing-library/react)
- Write describe/it blocks that cover happy paths, edge cases, and error states
- Mock external dependencies (fetch, Supabase, etc.) with vi.mock
- Keep tests independent — no shared mutable state between tests
- Put test file next to the source file in a __tests__ folder
- Use TypeScript — add proper type annotations
- Return only the raw JSON object — no markdown, no explanation`;

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const { projectId, filePath, fileContent } = body;

  if (!filePath || !fileContent) {
    return Response.json({ error: "filePath and fileContent required" }, { status: 400 });
  }
  if (fileContent.length > 12000) {
    return Response.json({ error: "File too large (max 12,000 chars)" }, { status: 400 });
  }

  const userMessage = `Generate Vitest tests for the following file.

File path: ${filePath}

File content:
\`\`\`
${fileContent}
\`\`\`

Return only the JSON object.`;

  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  let billableOutput = false;
  let reservationFinalized = false;

  try {
    reservation = await reserveCredits(supabase, {
      userId: user.id,
      amount: 1,
      action: "generate_tests",
      projectId,
    });
    if (!reservation) {
      return Response.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const result = await generateAI(
      {
        // Single-file test generation — balanced tier is enough.
        model: BALANCED_CODING_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        maxTokens: 4000,
        temperature: 0.2,
        stream: false,
        jsonMode: true,
      },
      { projectId, userId: user.id, task: "generate_tests" },
    );
    billableOutput = true;

    let parsed: { testPath: string; content: string; language: string };
    try {
      parsed = JSON.parse(result.content);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    if (!parsed.testPath || !parsed.content) {
      throw new Error("AI returned incomplete data");
    }

    // Upsert into project files
    const { data: file, error } = await supabase
      .from("project_files")
      .upsert(
        {
          project_id: projectId,
          path: parsed.testPath,
          content: parsed.content,
          language: parsed.language ?? "typescript",
        },
        { onConflict: "project_id,path" }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);

    await settleCreditReservation(supabase, reservation.id, 1);
    reservationFinalized = true;

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return Response.json({ file });
  } catch (err) {
    if (reservation && !reservationFinalized) {
      try {
        if (billableOutput) {
          await settleCreditReservation(supabase, reservation.id, 1);
        } else {
          await cancelCreditReservation(supabase, reservation.id);
        }
      } catch (billingError) {
        console.error("[ai/generate-tests] Failed to finalize credit reservation", billingError);
      }
    }

    return Response.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}


export const Route = createFileRoute("/api/ai/generate-tests")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
