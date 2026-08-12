/**
 * DEEP security scan — the agentic second profile.
 *
 * The existing scanner (`scan.ts` + `deps.ts`) is the BASIC profile: regex rules
 * for secrets and PII, plus a dependency audit. It is fast, deterministic, free,
 * and it runs automatically at publish. It is also structurally blind to the whole
 * class of problem that actually gets apps breached — an endpoint with no
 * authorisation check, a Supabase table read without RLS, a query built by string
 * concatenation, an admin route guarded only in the UI. No regex finds those,
 * because they are absences rather than patterns.
 *
 * This profile reads the code and looks for the absences. Two profiles, clearly
 * separated, matching how Lovable split theirs on 1 June:
 *
 *   BASIC  auto-runs at publish, deterministic, free, blocks on critical + PII
 *   DEEP   explicit or scheduled, model-reviewed, costs credits, never auto-blocks
 *
 * WHY DEEP DOES NOT BLOCK A PUBLISH. A model reviewing authorisation logic will
 * sometimes be wrong, and a false critical that stops a deploy trains people to
 * bypass the gate — which costs more security than the finding was worth. Deep
 * findings land in `health_findings` for triage, exactly like the self-healing
 * scans, and can be promoted by a human. The gate stays deterministic.
 *
 * COST. One call per batch on the review tier, batched so a 40-file project is a
 * handful of calls rather than 40. Explicitly opted into, or run on a schedule the
 * owner set — never silently on every publish.
 */

import { generateAI } from "../ai/generate.ts";
import { REVIEW_MODEL } from "../ai/model-defaults.ts";
import type { SecurityFinding } from "./scan.ts";

export type ScanProfile = "basic" | "deep";

/** Files per model call. Big enough to see cross-file auth gaps, small enough to fit. */
const FILES_PER_BATCH = 8;
/** Characters of any single file sent for review. */
const MAX_FILE_CHARS = 8_000;
/** Hard ceiling on batches, so a huge project cannot run away with credits. */
const MAX_BATCHES = 6;

/** Only files where the interesting absences live. */
const REVIEWABLE = /\.(ts|tsx|js|jsx|sql)$/i;
const SKIP = /(^|\/)(node_modules|dist|build|\.next|coverage)\//i;

const DEEP_SYSTEM = `You are a security reviewer examining a web application for exploitable weaknesses. You are looking for what is MISSING, not for patterns.

Review for exactly these five classes:
1. ACCESS CONTROL — an endpoint, server function or mutation that never checks who is calling it; ownership filters absent from a query that returns user data; an admin capability guarded only in the UI.
2. RLS / DATA EXPOSURE — a table created or queried with no row-level security; a service-role key used where a user-scoped client belongs; a select that returns other users' rows.
3. SECRET HANDLING — a secret read on the client; a key interpolated into a URL or a log line; credentials in a code path that reaches the browser.
4. INPUT HANDLING — SQL built by string concatenation; unvalidated input reaching a query, a filesystem path, or a redirect target; user HTML rendered without escaping.
5. AUTH LOGIC — a session trusted without verification; a role read from a client-supplied value; a token compared non-constant-time or not at all.

Rules:
- Report only what you can point at. Every finding needs a file and a line.
- Do NOT report code style, formatting, missing tests, or dependency versions — another scanner covers those.
- Do NOT report a weakness you cannot see the absence of. If authorisation might be enforced in a file you were not shown, say so rather than reporting it.
- Prefer few high-confidence findings over many speculative ones.
- severity: "critical" only for something exploitable right now by an unauthenticated caller. "high" for exploitable by any signed-in user. "medium" for a real weakness needing another condition. "low" for hardening.

Respond with ONLY this JSON:
{"findings":[{"rule":"deep-access-control","severity":"high","title":"one line","file":"src/x.ts","line":42,"evidence":"the specific code, under 20 words","recommendation":"the concrete change"}]}
Return {"findings":[]} if you find nothing. An empty result is a valid and useful answer.`;

interface DeepFindingRaw {
  rule?: string;
  severity?: string;
  title?: string;
  file?: string;
  line?: number;
  evidence?: string;
  recommendation?: string;
}

const ALLOWED_SEVERITY = new Set(["critical", "high", "medium", "low"]);
const ALLOWED_RULES = new Set([
  "deep-access-control",
  "deep-rls",
  "deep-secret-handling",
  "deep-input-handling",
  "deep-auth-logic",
]);

/** Keep the model inside the contract: unknown rule or severity is not trusted. */
function normalize(raw: DeepFindingRaw, knownPaths: Set<string>): SecurityFinding | null {
  const file = typeof raw.file === "string" ? raw.file.replace(/^\.?\//, "") : "";
  // A finding about a file we never sent is a hallucination; drop it silently.
  if (!file || !knownPaths.has(file)) return null;

  const severity = ALLOWED_SEVERITY.has(String(raw.severity)) ? String(raw.severity) : "medium";
  const rule = ALLOWED_RULES.has(String(raw.rule)) ? String(raw.rule) : "deep-review";
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null;
  if (!title) return null;

  return {
    rule,
    severity: severity as SecurityFinding["severity"],
    kind: "risky",
    title,
    file,
    line: Number.isFinite(raw.line) && Number(raw.line) > 0 ? Number(raw.line) : 1,
    // Reuse the snippet field, truncated — deep findings quote code, and the whole
    // scanner contract is that a snippet is never a full secret value.
    snippet: (raw.evidence ?? "").slice(0, 200),
    recommendation:
      (raw.recommendation ?? "Review this path and add the missing check.").slice(0, 400),
  };
}

function parseFindings(raw: string, knownPaths: Set<string>): SecurityFinding[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { findings?: DeepFindingRaw[] };
    if (!Array.isArray(parsed.findings)) return [];
    return parsed.findings
      .map((f) => normalize(f, knownPaths))
      .filter((f): f is SecurityFinding => f !== null);
  } catch {
    return [];
  }
}

export interface DeepScanResult {
  profile: "deep";
  findings: SecurityFinding[];
  /** Batches actually sent to a model — the cost signal. */
  batches: number;
  /** Files that were reviewed, so the caller can say what was and was not covered. */
  filesReviewed: string[];
  /** Files skipped because the project exceeded MAX_BATCHES. */
  filesSkipped: string[];
  errors: string[];
}

/**
 * Run the deep scan.
 *
 * Batches are reviewed CONCURRENTLY — the batches are independent, and a serial
 * loop over six model calls is a minute of latency for no benefit. Each batch is
 * settled on its own; one failure costs that batch's findings, not the scan.
 */
export async function runDeepScan(
  files: Array<{ path: string; content: string }>,
  ctx: { projectId?: string; userId?: string } = {},
): Promise<DeepScanResult> {
  const reviewable = files.filter((f) => REVIEWABLE.test(f.path) && !SKIP.test(f.path));

  // Review the files most likely to hold an authorisation decision first, so a
  // project that exceeds the batch cap loses the least important coverage.
  const priority = (p: string) =>
    /(^|\/)(routes|api|server|middleware|auth)\//i.test(p) || /\.sql$/i.test(p) ? 0 : 1;
  const ordered = [...reviewable].sort((a, b) => priority(a.path) - priority(b.path));

  const batches: Array<Array<{ path: string; content: string }>> = [];
  for (let i = 0; i < ordered.length; i += FILES_PER_BATCH) {
    batches.push(ordered.slice(i, i + FILES_PER_BATCH));
  }
  const used = batches.slice(0, MAX_BATCHES);
  const skipped = batches.slice(MAX_BATCHES).flat().map((f) => f.path);

  const settled = await Promise.allSettled(
    used.map(async (batch) => {
      const knownPaths = new Set(batch.map((f) => f.path));
      const block = batch
        .map((f) => `=== ${f.path} ===\n${f.content.slice(0, MAX_FILE_CHARS)}`)
        .join("\n\n");
      const res = await generateAI(
        {
          model: REVIEW_MODEL,
          messages: [
            { role: "system" as const, content: DEEP_SYSTEM },
            { role: "user" as const, content: block },
          ],
          maxTokens: 2000,
          temperature: 0,
          jsonMode: true,
        },
        { ...ctx, task: "security.deep_scan" },
      );
      return parseFindings(res?.content ?? "", knownPaths);
    }),
  );

  const findings: SecurityFinding[] = [];
  const errors: string[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") findings.push(...r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }

  // Deduplicate on rule+file+line: two batches can surface the same cross-file gap.
  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    const key = `${f.rule}|${f.file}|${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const order = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
  deduped.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  return {
    profile: "deep",
    findings: deduped,
    batches: used.length,
    filesReviewed: used.flat().map((f) => f.path),
    filesSkipped: skipped,
    errors,
  };
}

/** Credit cost estimate, so the caller can quote before spending. */
export function estimateDeepScanBatches(files: Array<{ path: string }>): number {
  const reviewable = files.filter((f) => REVIEWABLE.test(f.path) && !SKIP.test(f.path));
  return Math.min(MAX_BATCHES, Math.ceil(reviewable.length / FILES_PER_BATCH));
}
