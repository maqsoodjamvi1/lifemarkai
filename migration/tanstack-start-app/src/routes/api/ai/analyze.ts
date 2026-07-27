// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";
import {
  analyzeUnavailableReason,
  isAnalyzeExecutionEnabled,
  runAnalyzeScript,
} from "@/lib/ai/analyze-runner";


/**
 * POST /api/ai/analyze
 *
 * Generate-files / data-analysis sandbox — mirrors Lovable's chat-based
 * "analyze data, transform files, generate documents" capability.
 *
 * Flow:
 *   1. AI writes a Python script from the user's request + uploaded file context.
 *   2. We spawn the script in an isolated tmp dir with the uploaded file present.
 *   3. Capture stdout + any files written to OUTPUT_DIR.
 *   4. Return the script, stdout/stderr, and base64 of each generated file.
 *
 * Body: {
 *   instruction: string,   // what the user asked
 *   inputFile?: { name, base64, mimeType }  // optional uploaded source data
 * }
 *
 * Response: {
 *   ok: true,
 *   script: string,        // the AI-written python
 *   stdout, stderr,
 *   files: [{ name, base64, sizeBytes, mimeType }]   // generated outputs
 * }
 *
 * Notes:
 *   - Prefers E2B isolated execution when E2B_API_KEY is set.
 *   - Host python only when ALLOW_UNSANDBOXED_ANALYZE=true (trusted/local).
 *   - The script can read INPUT_FILE env var and write to OUTPUT_DIR.
 */

const MAX_INPUT_BYTES = 20 * 1024 * 1024;

interface AnalyzeBody {
  instruction: string;
  projectId?: string;
  inputFile?: { name: string; base64: string; mimeType?: string };
}

const SYSTEM_PROMPT = `You are a data analyst writing a single Python script to fulfill a user's request.

CRITICAL RULES:
- Write ONE Python script. No prose, no explanation, no code fences.
- The script may read an input file from the path in env var INPUT_FILE (may be empty if the user didn't upload one).
- The script MUST write its output files into the env var OUTPUT_DIR.
- Allowed libraries: pandas, numpy, matplotlib (use Agg backend), Pillow, openpyxl, reportlab, python-docx, python-pptx, json, csv, requests, beautifulsoup4.
- For visualizations: save as PNG into OUTPUT_DIR.
- For documents: PDF via reportlab, DOCX via python-docx, XLSX via openpyxl, CSV via pandas.to_csv.
- Print a concise summary (≤500 chars) to stdout so the user sees what happened.
- NEVER network-call internal hosts. NEVER read files outside INPUT_FILE / OUTPUT_DIR / /tmp.
- If the request is unclear, write a script that prints a short clarifying question to stdout and exits.

Output: the Python script source, nothing else.`;

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAnalyzeExecutionEnabled()) {
    return Response.json(
      { error: analyzeUnavailableReason() ?? "Analyze unavailable" },
      { status: 503 },
    );
  }

  const { instruction, inputFile, projectId } = await req.json() as AnalyzeBody;
  if (!instruction?.trim()) {
    return Response.json({ error: "instruction is required" }, { status: 400 });
  }

  // Validate and decode the upload before reserving credits or calling a
  // provider. The encoded-length guard avoids allocating an oversized buffer.
  let inputBuffer: Buffer | null = null;
  if (inputFile?.base64) {
    const maxEncodedLength = Math.ceil(MAX_INPUT_BYTES / 3) * 4 + 4;
    if (inputFile.base64.length > maxEncodedLength) {
      return Response.json({ error: "Input file too large (max 20MB)" }, { status: 413 });
    }
    inputBuffer = Buffer.from(inputFile.base64, "base64");
    if (inputBuffer.byteLength > MAX_INPUT_BYTES) {
      return Response.json({ error: "Input file too large (max 20MB)" }, { status: 413 });
    }
  }

  const creditReservation = await reserveCredits(supabase, {
    userId: user.id,
    amount: 1,
    action: "analyze",
    projectId: projectId ?? null,
  });
  if (!creditReservation) {
    return Response.json(
      { error: "Insufficient credits", requiredCredits: 1 },
      { status: 402 },
    );
  }

  // ── 1) Ask the AI to draft the script ──────────────────────────────────────
  const userMsg = inputFile
    ? `Instruction: ${instruction}\n\nThe user uploaded a file named "${inputFile.name}" (${inputFile.mimeType ?? "unknown type"}). Path will be in env var INPUT_FILE. Output goes in env var OUTPUT_DIR.`
    : `Instruction: ${instruction}\n\nNo input file was uploaded. INPUT_FILE env var will be empty. Output goes in env var OUTPUT_DIR.`;

  let script = "";
  let providerReturned = false;
  let reservationFinalized = false;
  try {
    const aiRes = await generateAI(
      {
        // Small analysis-script generation — fast tier is plenty.
        model: getFastAiModel(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        maxTokens: 2500,
      },
      { projectId, userId: user.id, task: "data_analysis_script" },
    );
    providerReturned = true;
    script = (aiRes.content ?? "").trim()
      .replace(/^```python\s*/i, "").replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "").trim();

    // Provider output is billable even when validation, sandbox execution, or
    // later persistence fails. Settle before any of those fallible steps.
    const remainingCredits = await settleCreditReservation(
      supabase,
      creditReservation.id,
      1,
    );
    if (remainingCredits == null) throw new Error("Unable to settle reserved analysis credits");
    reservationFinalized = true;
  } catch (err) {
    if (!reservationFinalized) {
      try {
        if (providerReturned) {
          await settleCreditReservation(supabase, creditReservation.id, 1);
        } else {
          await cancelCreditReservation(supabase, creditReservation.id);
        }
      } catch {
        // Fail closed: a provider result may already have been produced.
      }
    }
    return Response.json({ error: `AI script generation failed: ${(err as Error).message}` }, { status: 500 });
  }

  if (!script || !script.includes("OUTPUT_DIR")) {
    return Response.json({
      ok: false,
      script,
      error: "Generated script did not reference OUTPUT_DIR — refusing to run.",
    }, { status: 422 });
  }

  // ── 2) Run in E2B (preferred) or trusted local sandbox ─────────────────────
  let result: Awaited<ReturnType<typeof runAnalyzeScript>>;
  try {
    result = await runAnalyzeScript({
      script,
      inputFile:
        inputFile?.base64 && inputBuffer
          ? { name: inputFile.name, buffer: inputBuffer }
          : undefined,
    });
  } catch (err) {
    return Response.json(
      { error: `Analyze execution failed: ${(err as Error).message}` },
      { status: 503 },
    );
  }

  const files = result.files;
  const fileManifest = files.map((f) => ({
    name: f.name,
    base64: f.base64,
    sizeBytes: f.sizeBytes,
    mimeType: f.mimeType,
  }));

  let persistedMessages: Array<{ id: string; role: string; content: string; metadata: unknown }> = [];
  if (projectId) {
    const summary =
      result.stdout?.trim().slice(0, 500) ||
      `Generated ${files.length} file${files.length === 1 ? "" : "s"} from your data analysis request.`;
    const { data: inserted, error: msgErr } = await (supabase as any)
      .from("messages")
      .insert([
        {
          project_id: projectId,
          role: "user",
          content: instruction.trim(),
          mode: "chat",
          metadata: { kind: "analyze_request" },
        },
        {
          project_id: projectId,
          role: "assistant",
          content: summary,
          mode: "chat",
          metadata: {
            kind: "analyze",
            instruction: instruction.trim(),
            stdout: result.stdout?.slice(0, 4000) ?? "",
            stderr: result.stderr?.slice(0, 2000) ?? "",
            files: fileManifest,
          },
        },
      ])
      .select("id, role, content, metadata, created_at");
    if (!msgErr && inserted) persistedMessages = inserted;

  }

  return Response.json({
    ok: result.code === 0,
    exitCode: result.code,
    engine: result.engine,
    script,
    stdout: result.stdout,
    stderr: result.stderr,
    files,
    messages: persistedMessages,
  });
}


export const Route = createFileRoute("/api/ai/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
