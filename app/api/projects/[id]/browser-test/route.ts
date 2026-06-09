import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { generateAI } from "@/lib/ai/provider";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Autonomous browser-test agent.
 *
 * Streams SSE events as the AI:
 *   1. Plans a test scenario from the user's prompt.
 *   2. Loads the deployed URL — via Playwright (real Chromium) when
 *      PLAYWRIGHT_ENABLED=true AND `playwright` is installed, otherwise via
 *      a plain HTTP fetch + HTML→text inspection.
 *   3. Runs the planned steps as substring assertions against the page text.
 *   4. Reports each step as `step` events.
 *   5. Sends a `done` event at the end with pass/fail counts.
 *
 * The two execution paths share the assertion logic (runSteps below) so a
 * project that gets upgraded from inspection → real browser produces the
 * same step IDs and pass/fail semantics. Only the `engine` field in the
 * `done` payload differs.
 */

interface RunBody {
  url: string;
  scenario?: string;
}

interface TestStep {
  id: string;
  name: string;
  type: "navigate" | "find" | "assert" | "info";
  /** plain-text matcher — substring of expected text on the page */
  expects?: string;
  /** plain-text matcher — substring that should NOT be on the page */
  forbids?: string;
}

interface PageSnapshot {
  /** Status code from the initial response (or 200 for Playwright if we can't get it precisely). */
  status: number;
  /** Lowercased plain text of the page after JS has run (Playwright) or after HTML strip (fetch). */
  text: string;
  /** Document title. */
  title: string;
  /** Which engine produced this snapshot — surfaced in the `done` event. */
  engine: "playwright" | "fetch";
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Strip HTML tags + scripts so we can text-search the page. */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decide whether the real-browser path is available.
 *
 * Two conditions must be true:
 *   1. PLAYWRIGHT_ENABLED env var is set (operator opt-in — so projects on a
 *      host without Chromium don't accidentally try to launch it).
 *   2. The `playwright` package is dynamically importable at request time.
 *
 * We do the import once per request because hot-reload during dev can change
 * package availability mid-process. Failure to import falls back to fetch
 * with a single console warning (operator is presumably looking at logs).
 */
async function tryLoadPlaywright(): Promise<null | { chromium: any }> {
  if (process.env.PLAYWRIGHT_ENABLED !== "true") return null;
  try {
    // Use a string variable for the import so Next/webpack doesn't try to
    // resolve "playwright" at build time on hosts without it installed.
    const modName = "playwright";
    const mod = await import(/* webpackIgnore: true */ modName);
    if (!mod?.chromium?.launch) return null;
    return { chromium: mod.chromium };
  } catch (err) {
    console.warn("[browser-test] Playwright requested but failed to load:", (err as Error).message);
    return null;
  }
}

/**
 * Fetch the page via Playwright Chromium.
 *
 * Configured for a quick smoke test rather than full E2E: 15s navigation
 * timeout, networkidle wait, no auth context, no persistent storage. The
 * caller is responsible for ensuring the URL is publicly reachable (we
 * already block internal hosts in the POST handler).
 */
async function snapshotViaPlaywright(playwright: { chromium: any }, url: string): Promise<PageSnapshot> {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: "LifemarkAI-Browser-Test/1.0 (Playwright)",
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    let status = 200;
    page.on("response", (r: { url: () => string; status: () => number }) => {
      // First response only — the main document. Subsequent assets shouldn't
      // override the page's status code in our reporting.
      if (r.url() === url || r.url().endsWith("/")) {
        if (status === 200) status = r.status();
      }
    });
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
    if (resp) status = resp.status();
    // Grab the rendered body text (post-JS).
    const text = (await page.evaluate(() => document.body?.innerText ?? "")) as string;
    const title = await page.title();
    return { status, text: text.toLowerCase(), title, engine: "playwright" };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Fallback path — plain fetch + HTML strip. */
async function snapshotViaFetch(url: string): Promise<PageSnapshot> {
  const r = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "LifemarkAI-Browser-Test/1.0" },
  });
  const status = r.status;
  const html = await r.text();
  const text = htmlToText(html).toLowerCase();
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  return { status, text, title, engine: "fetch" };
}

/**
 * Run the planned steps against a captured page snapshot.
 *
 * Pure function so the same logic backs both engines. Returns the per-step
 * results plus pass/fail counts; the caller streams each result as it goes.
 */
function evaluateStep(step: TestStep, snap: PageSnapshot): { status: "pass" | "fail" | "info"; evidence: string } {
  if (step.type === "navigate") {
    const ok = snap.status >= 200 && snap.status < 400;
    return {
      status: ok ? "pass" : "fail",
      evidence: `HTTP ${snap.status}${snap.title ? ` — title: "${snap.title}"` : ""}`,
    };
  }
  if (step.expects) {
    const found = snap.text.includes(step.expects.toLowerCase());
    return {
      status: found ? "pass" : "fail",
      evidence: found ? `Found "${step.expects}"` : `"${step.expects}" not present on page`,
    };
  }
  if (step.forbids) {
    const present = snap.text.includes(step.forbids.toLowerCase());
    return {
      status: present ? "fail" : "pass",
      evidence: present ? `Forbidden text "${step.forbids}" appeared on page` : `OK — "${step.forbids}" not present`,
    };
  }
  return { status: "info", evidence: "(no assertion specified)" };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  const { data: project } = await supabase
    .from("projects").select("id, name").eq("id", projectId).single();
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json()) as RunBody;
  if (!body.url) {
    return new Response(JSON.stringify({ error: "url is required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Refuse private / internal targets — guards both the fetch path AND the
  // Playwright path. Without this a tester could probe internal services
  // from the deploy host's network.
  const target = body.url.trim();
  if (!/^https?:\/\//i.test(target)) {
    return new Response(JSON.stringify({ error: "url must be http(s)" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  if (/localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\./.test(target)) {
    return new Response(JSON.stringify({ error: "Internal hosts are not allowed" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const scenario = (body.scenario ?? "Smoke-test the page: confirm it loads, has a visible heading, and shows no error state.").trim();

  // Encoder for streaming
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };
      const startedAt = Date.now();
      let passed = 0;
      let failed = 0;

      try {
        send("status", { msg: "Planning test scenario…" });

        // ── 1) Ask the AI to plan 3–6 verifiable steps ─────────────────────────
        const planSystem = `You are a senior QA engineer. Given a target URL and a test scenario, produce a JSON array of 3-6 testable steps.

Each step must be an object with:
- id: short unique string ("s1", "s2", ...)
- name: human-readable step description (under 60 chars)
- type: one of "navigate" | "find" | "assert" | "info"
- expects: (optional) a plain-text snippet that must appear on the page for the step to pass. KEEP IT SHORT (1-5 words), case-insensitive substring match.
- forbids: (optional) a plain-text snippet that must NOT appear on the page (e.g., "error", "undefined").

Rules:
- The FIRST step must always be type "navigate" with the target URL in expects.
- Mix "find" and "assert" steps. Use "info" sparingly for non-checking observations.
- Pick expects/forbids snippets that would survive minor copy changes (avoid full sentences).
- Respond with ONLY the JSON array. No prose, no code fences.`;

        const planUser = `Target URL: ${target}
Scenario: ${scenario}

Return the JSON test plan now.`;

        const planRes = await generateAI({
          model: "claude-haiku-4-5-20251001",
          messages: [
            { role: "system", content: planSystem },
            { role: "user", content: planUser },
          ],
          maxTokens: 800,
        });
        let steps: TestStep[] = [];
        try {
          const txt = (planRes.content ?? "").trim()
            .replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
          const parsed = JSON.parse(txt);
          if (Array.isArray(parsed)) steps = parsed.slice(0, 8) as TestStep[];
        } catch { /* fall through */ }
        if (steps.length === 0) {
          // Minimal default plan
          steps = [
            { id: "s1", name: "Page loads", type: "navigate", expects: "" },
            { id: "s2", name: "No 'undefined' on page", type: "assert", forbids: "undefined" },
            { id: "s3", name: "No error stack visible", type: "assert", forbids: "Error" },
          ];
        }

        send("plan", { steps, scenario });

        // ── 2) Load the page via the best available engine ─────────────────────
        // Real Chromium when PLAYWRIGHT_ENABLED=true AND playwright is importable.
        // Otherwise: plain fetch + HTML→text strip (still useful, just no JS).
        const playwright = await tryLoadPlaywright();
        const loadMsg = playwright
          ? `Launching Chromium and visiting ${target}…`
          : `Fetching ${target}…`;
        // Emit both `msg` (current consumer) and `message` (older panel) so
        // either reader works without further coordination.
        send("status", {
          msg: loadMsg,
          message: loadMsg,
          engine: playwright ? "playwright" : "fetch",
        });

        let snap: PageSnapshot;
        try {
          snap = playwright
            ? await snapshotViaPlaywright(playwright, target)
            : await snapshotViaFetch(target);
        } catch (err) {
          send("step", {
            id: "s1", name: "Page loads", status: "fail",
            error: `Load failed (${playwright ? "playwright" : "fetch"}): ${(err as Error).message}`,
          });
          send("done", {
            passed: 0, failed: 1, total: 1,
            pass: 0, fail: 1, url: target,
            note: `Could not reach ${target}.`,
            durationMs: Date.now() - startedAt,
            summary: `Could not reach ${target}.`,
            engine: playwright ? "playwright" : "fetch",
          });
          controller.close();
          return;
        }

        // ── 3) Execute each step ───────────────────────────────────────────────
        // Emit both the new shape ({id, name, type, expects, forbids, status,
        // evidence}) AND legacy aliases ({index, action, error}) so the older
        // browser-testing panel UI keeps rendering correctly while consumers
        // upgrade.
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const { status: stepStatus, evidence } = evaluateStep(step, snap);
          if (stepStatus === "pass") passed++;
          else if (stepStatus === "fail") failed++;

          send("step", {
            ...step,
            status: stepStatus,
            evidence,
            // Legacy aliases for the existing panel:
            index: i,
            action: step.name,
            error: stepStatus === "fail" ? evidence : undefined,
          });
          // Small delay so the UI can show progress
          await new Promise((res) => setTimeout(res, 80));
        }

        // ── 4) Final summary via AI ────────────────────────────────────────────
        send("status", { msg: "Writing summary…" });
        let summary = `${passed} passed, ${failed} failed.`;
        try {
          const sumRes = await generateAI({
            model: "claude-haiku-4-5-20251001",
            messages: [
              { role: "system", content: "You write very short test summaries — 2 to 3 sentences. State what worked, what didn't, and the most likely cause if anything failed. No headings." },
              { role: "user", content: `URL: ${target}
HTTP status: ${snap.status}
Title: ${snap.title}
Engine: ${snap.engine}
Steps run: ${steps.length}
Passed: ${passed}, Failed: ${failed}
Scenario: ${scenario}

Page text snippet (first 800 chars):
${snap.text.slice(0, 800)}` },
            ],
            maxTokens: 220,
          });
          summary = (sumRes.content ?? summary).trim();
        } catch { /* keep default summary */ }

        send("done", {
          passed, failed, total: steps.length,
          // Legacy aliases:
          pass: passed,
          fail: failed,
          url: target,
          note: summary,
          durationMs: Date.now() - startedAt,
          summary,
          httpStatus: snap.status,
          pageTitle: snap.title,
          engine: snap.engine,
        });
      } catch (err) {
        send("error", { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
