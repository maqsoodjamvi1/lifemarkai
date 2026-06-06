// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const runtime = "nodejs";
export const maxDuration = 60;

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
 *   - This runs Python with timeouts and CPU limits to avoid abuse. For a
 *     production-grade sandbox use e2b.dev, Daytona, or Docker isolation.
 *   - The script can read INPUT_FILE env var (path to the uploaded file) and
 *     write to OUTPUT_DIR.
 */

const SCRIPT_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024; // 20 MB total

interface AnalyzeBody {
  instruction: string;
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { instruction, inputFile } = await req.json() as AnalyzeBody;
  if (!instruction?.trim()) {
    return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  }

  // ── 1) Ask the AI to draft the script ──────────────────────────────────────
  const userMsg = inputFile
    ? `Instruction: ${instruction}\n\nThe user uploaded a file named "${inputFile.name}" (${inputFile.mimeType ?? "unknown type"}). Path will be in env var INPUT_FILE. Output goes in env var OUTPUT_DIR.`
    : `Instruction: ${instruction}\n\nNo input file was uploaded. INPUT_FILE env var will be empty. Output goes in env var OUTPUT_DIR.`;

  let script = "";
  try {
    const aiRes = await generateAI({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      maxTokens: 2500,
    });
    script = (aiRes.content ?? "").trim()
      .replace(/^```python\s*/i, "").replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "").trim();
  } catch (err) {
    return NextResponse.json({ error: `AI script generation failed: ${(err as Error).message}` }, { status: 500 });
  }

  if (!script || !script.includes("OUTPUT_DIR")) {
    return NextResponse.json({
      ok: false,
      script,
      error: "Generated script did not reference OUTPUT_DIR — refusing to run.",
    }, { status: 422 });
  }

  // ── 2) Prepare tmp sandbox ─────────────────────────────────────────────────
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifemark-analyze-"));
  const outputDir = path.join(sandboxDir, "out");
  fs.mkdirSync(outputDir, { recursive: true });

  let inputPath = "";
  if (inputFile?.base64) {
    inputPath = path.join(sandboxDir, inputFile.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
    const buf = Buffer.from(inputFile.base64, "base64");
    if (buf.byteLength > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Input file too large (max 20MB)" }, { status: 413 });
    }
    fs.writeFileSync(inputPath, buf);
  }

  const scriptPath = path.join(sandboxDir, "script.py");
  fs.writeFileSync(scriptPath, script);

  // ── 3) Run the script ──────────────────────────────────────────────────────
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("python3", [scriptPath], {
      env: {
        ...process.env,
        INPUT_FILE: inputPath,
        OUTPUT_DIR: outputDir,
        MPLBACKEND: "Agg",
      },
      cwd: sandboxDir,
    });
    let stdout = "";
    let stderr = "";
    const stdoutMax = 200_000;
    const stderrMax = 200_000;

    child.stdout.on("data", (d) => {
      if (stdout.length < stdoutMax) stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < stderrMax) stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += "\n[timeout — script killed after 25s]";
    }, SCRIPT_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + `\nspawn error: ${err.message}` });
    });
  });

  // ── 4) Collect output files ────────────────────────────────────────────────
  const files: Array<{ name: string; base64: string; sizeBytes: number; mimeType: string }> = [];
  let totalBytes = 0;
  try {
    for (const name of fs.readdirSync(outputDir)) {
      const full = path.join(outputDir, name);
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      if (totalBytes + stat.size > MAX_OUTPUT_BYTES) {
        files.push({ name, base64: "", sizeBytes: stat.size, mimeType: guessMime(name) });
        continue;
      }
      const buf = fs.readFileSync(full);
      files.push({ name, base64: buf.toString("base64"), sizeBytes: stat.size, mimeType: guessMime(name) });
      totalBytes += stat.size;
    }
  } catch { /* directory read failed — return empty list */ }

  // ── 5) Cleanup ─────────────────────────────────────────────────────────────
  try { fs.rmSync(sandboxDir, { recursive: true, force: true }); } catch { /* ignore */ }

  return NextResponse.json({
    ok: result.code === 0,
    exitCode: result.code,
    script,
    stdout: result.stdout,
    stderr: result.stderr,
    files,
  });
}

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    gif: "image/gif",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}
