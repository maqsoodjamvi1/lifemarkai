import { createFileRoute } from "@tanstack/react-router";
import { lookup } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { generateAI } from "@/lib/ai/generate";
import { FAST_CODING_MODEL } from "@/lib/ai/model-defaults";
import { canWriteProjectFiles,getProjectAccess } from "@/lib/project/access";
import { loadOptionalPlaywright } from "@/lib/optional-playwright";


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
  /** Core Web Vitals (Playwright only — Lovable browser-perf parity). */
  vitals?: WebVitals;
  /** Browser runtime failures collected while the page loads. */
  runtimeErrors?: string[];
  /** A compressed, above-the-fold screenshot from the Chromium run. */
  screenshotDataUrl?: string;
}

interface WebVitals {
  /** Time to first byte (ms) */
  ttfb: number | null;
  /** First contentful paint (ms) */
  fcp: number | null;
  /** Largest contentful paint (ms) */
  lcp: number | null;
  /** Cumulative layout shift (unitless) */
  cls: number | null;
  /** DOMContentLoaded (ms) */
  domContentLoaded: number | null;
  /** Transferred bytes for the main document */
  transferSize: number | null;
}

/** Rate a vitals metric against Google's thresholds. (Not exported — Next
 *  route files may only export HTTP handlers/config.) */
function rateVitals(v: WebVitals): Array<{ metric: string; value: string; rating: "good" | "needs-improvement" | "poor" | "n/a" }> {
  const rate = (val: number | null, good: number, poor: number): "good" | "needs-improvement" | "poor" | "n/a" =>
    val == null ? "n/a" : val <= good ? "good" : val <= poor ? "needs-improvement" : "poor";
  return [
    { metric: "TTFB", value: v.ttfb != null ? `${Math.round(v.ttfb)}ms` : "—", rating: rate(v.ttfb, 800, 1800) },
    { metric: "FCP", value: v.fcp != null ? `${Math.round(v.fcp)}ms` : "—", rating: rate(v.fcp, 1800, 3000) },
    { metric: "LCP", value: v.lcp != null ? `${Math.round(v.lcp)}ms` : "—", rating: rate(v.lcp, 2500, 4000) },
    { metric: "CLS", value: v.cls != null ? v.cls.toFixed(3) : "—", rating: rate(v.cls, 0.1, 0.25) },
    { metric: "DCL", value: v.domContentLoaded != null ? `${Math.round(v.domContentLoaded)}ms` : "—", rating: "n/a" },
  ];
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

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

async function validateExternalUrl(value: string): Promise<{ url: string } | { error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "url must be a valid http(s) URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "url must be http(s)" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateIpAddress(hostname)) {
    return { error: "Internal hosts are not allowed" };
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateIpAddress(address))) {
      return { error: "Internal hosts are not allowed" };
    }
  } catch {
    return { error: "The target host could not be resolved safely" };
  }

  return { url: parsed.toString() };
}

async function fetchExternalUrl(url: string): Promise<Response> {
  let current = url;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "LifemarkAI-Browser-Test/1.0" },
    });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    const next = await validateExternalUrl(new URL(location, current).toString());
    if ("error" in next) throw new Error(next.error);
    current = next.url;
  }
  throw new Error("Too many redirects while loading the target URL");
}

function normalizeTestPlan(value: unknown): TestStep[] {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set<TestStep["type"]>(["navigate", "find", "assert", "info"]);
  const normalizeText = (text: unknown, maxLength: number) =>
    typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, maxLength) : undefined;

  return value.slice(0, 6).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const type = record.type;
    if (typeof type !== "string" || !allowedTypes.has(type as TestStep["type"])) return [];
    const expects = normalizeText(record.expects, 140);
    const forbids = normalizeText(record.forbids, 140);
    if ((type === "find" || type === "assert") && !expects && !forbids) return [];
    return [{
      id: normalizeText(record.id, 40)?.replace(/[^a-zA-Z0-9_-]/g, "-") || `s${index + 1}`,
      name: normalizeText(record.name, 80) || `Browser check ${index + 1}`,
      type: type as TestStep["type"],
      ...(expects ? { expects } : {}),
      ...(forbids ? { forbids } : {}),
    }];
  });
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
    const runtimeErrors: string[] = [];
    const addRuntimeError = (message: string) => {
      const normalized = message.replace(/\s+/g, " ").trim();
      if (normalized && !runtimeErrors.includes(normalized)) runtimeErrors.push(normalized.slice(0, 300));
    };
    page.on("pageerror", (error: Error) => addRuntimeError(error.message));
    page.on("console", (message: { type: () => string; text: () => string }) => {
      if (message.type() === "error") addRuntimeError(message.text());
    });
    await page.route("**/*", async (route: { request: () => { isNavigationRequest: () => boolean; frame: () => unknown; url: () => string }; abort: () => Promise<void>; continue: () => Promise<void> }) => {
      const request = route.request();
      if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) {
        await route.continue();
        return;
      }
      const validation = await validateExternalUrl(request.url());
      if ("error" in validation) {
        addRuntimeError(`Blocked unsafe navigation: ${validation.error}`);
        await route.abort();
        return;
      }
      await route.continue();
    });
    let status = 200;
    page.on("response", (r: { url: () => string; status: () => number }) => {
      // First response only — the main document. Subsequent assets shouldn't
      // override the page's status code in our reporting.
      if (r.url() === url || r.url().endsWith("/")) {
        if (status === 200) status = r.status();
      }
    });
    // Observe paint/LCP/CLS from document start — must be installed before goto.
    await page.addInitScript(() => {
      const w = window as unknown as { __lmVitals: { lcp: number | null; cls: number } };
      w.__lmVitals = { lcp: null, cls: 0 };
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1] as PerformanceEntry | undefined;
          if (last) w.__lmVitals.lcp = last.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
            if (!e.hadRecentInput) w.__lmVitals.cls += e.value ?? 0;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch { /* older engines — vitals stay null */ }
    });
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (resp) status = resp.status();
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
    // Grab the rendered body text (post-JS).
    const text = (await page.evaluate(() => document.body?.innerText ?? "")) as string;
    const title = await page.title();
    // Core Web Vitals (Lovable browser-performance parity)
    let vitals: WebVitals | undefined;
    try {
      vitals = (await page.evaluate(() => {
        const w = window as unknown as { __lmVitals?: { lcp: number | null; cls: number } };
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const fcpEntry = performance.getEntriesByName("first-contentful-paint")[0];
        return {
          ttfb: nav ? nav.responseStart : null,
          fcp: fcpEntry ? fcpEntry.startTime : null,
          lcp: w.__lmVitals?.lcp ?? null,
          cls: w.__lmVitals ? Math.round(w.__lmVitals.cls * 1000) / 1000 : null,
          domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
          transferSize: nav ? (nav as PerformanceNavigationTiming & { transferSize?: number }).transferSize ?? null : null,
        };
      })) as WebVitals;
    } catch { /* vitals are best-effort */ }
    let screenshotDataUrl: string | undefined;
    try {
      const screenshot = await page.screenshot({ type: "jpeg", quality: 60 });
      screenshotDataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
    } catch { /* screenshots are best-effort */ }
    return {
      status,
      text: text.toLowerCase(),
      title,
      engine: "playwright",
      vitals,
      runtimeErrors,
      screenshotDataUrl,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Fallback path — plain fetch + HTML strip. */
async function snapshotViaFetch(url: string): Promise<PageSnapshot> {
  const r = await fetchExternalUrl(url);
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

async function handlePOST(req: Request, params: { id: string }) {
  const { id: projectId } = params;
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
  const targetValidation = await validateExternalUrl(body.url.trim());
  if ("error" in targetValidation) {
    return new Response(JSON.stringify({ error: targetValidation.error }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  const target = targetValidation.url;

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
- The FIRST step must always be type "navigate". It does not need an expects value.
- Mix "find" and "assert" steps. Use "info" sparingly for non-checking observations.
- Pick expects/forbids snippets that would survive minor copy changes (avoid full sentences).
- Respond with ONLY the JSON array. No prose, no code fences.`;

        const planUser = `Target URL: ${target}
Scenario: ${scenario}

Return the JSON test plan now.`;

        const planRes = await generateAI({
          model: FAST_CODING_MODEL,
          messages: [
            { role: "system", content: planSystem },
            { role: "user", content: planUser },
          ],
          maxTokens: 800,
        }, { projectId, userId: user.id, task: "browser_test_plan" });
        let steps: TestStep[] = [];
        try {
          const txt = (planRes.content ?? "").trim()
            .replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
          const parsed = JSON.parse(txt);
          steps = normalizeTestPlan(parsed);
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
        const playwright = await loadOptionalPlaywright();
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

        if (snap.screenshotDataUrl) {
          send("screenshot", {
            index: 0,
            label: "Initial page state",
            dataUrl: snap.screenshotDataUrl,
          });
        }

        if (snap.runtimeErrors?.length) {
          steps.push({
            id: "runtime-errors",
            name: "No browser runtime errors",
            type: "assert",
            forbids: "__lifemark_runtime_errors__",
          });
        }

        // ── 3) Execute each step ───────────────────────────────────────────────
        // Emit both the new shape ({id, name, type, expects, forbids, status,
        // evidence}) AND legacy aliases ({index, action, error}) so the older
        // browser-testing panel UI keeps rendering correctly while consumers
        // upgrade.
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const result = step.id === "runtime-errors"
            ? {
                status: "fail" as const,
                evidence: snap.runtimeErrors?.join(" | ") ?? "Browser runtime errors detected",
              }
            : evaluateStep(step, snap);
          const { status: stepStatus, evidence } = result;
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
            model: FAST_CODING_MODEL,
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
          }, { projectId, userId: user.id, task: "browser_test_summary" });
          summary = (sumRes.content ?? summary).trim();
        } catch { /* keep default summary */ }

        // Core Web Vitals (Playwright engine) — Lovable browser-performance
        // parity: rated against Google's good/needs-improvement/poor bands.
        if (snap.vitals) {
          send("vitals", { metrics: rateVitals(snap.vitals), raw: snap.vitals });
        }

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
          ...(snap.vitals ? { vitals: snap.vitals, vitalsRated: rateVitals(snap.vitals) } : {}),
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


export const Route = createFileRoute("/api/projects/$id/browser-test")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handlePOST(request, params),
    },
  },
});
