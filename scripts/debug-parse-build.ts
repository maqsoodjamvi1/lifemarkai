/**
 * Debug: capture raw build-mode AI output + parse result for no-files investigation.
 * Logs to debug-06409d.log (session 06409d).
 */
import { appendFileSync, readFileSync } from "fs";
import { generateAI } from "../lib/ai/provider";
import { DEFAULT_CODING_MODEL } from "../lib/ai/model-defaults";
import { buildGenerationPrompt } from "../lib/ai/system-prompts";
import { parseAIResponse, needsBuildContinuation } from "../lib/ai/code-parser";
import { classifyBuildIntent, buildUserDirective } from "../lib/ai/build-intent";

const LOG = "debug-06409d.log";
const SESSION = "06409d";

// Load .env.local for standalone script runs
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i);
  const v = line.slice(i + 1);
  if (!process.env[k]) process.env[k] = v;
}

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = { sessionId: SESSION, timestamp: Date.now(), runId: "parse-debug", location: "debug-parse-build.ts", message, data, hypothesisId };
  appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
  console.log(JSON.stringify(entry));
}

const PROMPT = "Build an ERP inventory management system with dashboard, products, and orders";

async function main() {
  const intent = classifyBuildIntent(PROMPT);
  const systemPrompt = buildGenerationPrompt(PROMPT, []);
  const userMessage = `${PROMPT}\n\n${buildUserDirective(intent)}`;

  log("config", { model: DEFAULT_CODING_MODEL, promptLen: PROMPT.length, appType: intent.appType }, "H1");

  let raw = "";
  const CONT_ROUNDS = 3;
  try {
    const result = await generateAI({
      model: DEFAULT_CODING_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      maxTokens: 16000,
      stream: true,
      jsonMode: true,
      onChunk: (c) => { raw += c; },
    });
    raw = result.content || raw;
    log("generate ok", { contentLen: raw.length, tokensUsed: result.tokensUsed, model: result.model }, "H2");

    let contRounds = 0;
    while (needsBuildContinuation(raw) && contRounds < CONT_ROUNDS) {
      contRounds++;
      let contChunk = "";
      await generateAI({
        model: DEFAULT_CODING_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
          { role: "assistant", content: raw },
          {
            role: "user",
            content:
              "Your previous JSON response was cut off before it finished. Continue from EXACTLY where it stopped and output ONLY the remaining raw characters needed to complete the JSON object. Do not repeat any earlier content, do not restart, no code fences, no commentary.",
          },
        ],
        maxTokens: 16000,
        stream: true,
        jsonMode: false,
        onChunk: (c) => { raw += c; contChunk += c; },
      });
      log("continuation round", { contRounds, contChunkLen: contChunk.length, totalLen: raw.length }, "H4");
      if (!contChunk.trim()) break;
    }
  } catch (e) {
    log("generate failed", { error: String(e) }, "H2");
    process.exit(1);
  }

  const parsed = parseAIResponse(raw);
  let jsonKeys: string[] = [];
  let rawFilesLen: number | null = null;
  try {
    const j = JSON.parse(raw.trim()) as Record<string, unknown>;
    jsonKeys = Object.keys(j);
    rawFilesLen = Array.isArray(j.files) ? j.files.length : null;
  } catch {
    jsonKeys = ["parse_failed"];
  }

  log("parse result", {
    fileCount: parsed.files.length,
    truncated: parsed.truncated ?? false,
    messagePreview: parsed.message.slice(0, 200),
    startsWithBrace: raw.trim().startsWith("{"),
    jsonKeys,
    rawFilesLen,
    hasCodeFences: raw.includes("```"),
    contentHead: raw.slice(0, 400),
    contentTail: raw.slice(-300),
  }, "H3");

  process.exit(parsed.files.length > 0 ? 0 : 1);
}

main();
