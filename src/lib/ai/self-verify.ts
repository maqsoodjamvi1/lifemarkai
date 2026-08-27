/**
 * Self-verification loop — Lovable parity ("agent verifies its own output").
 *
 * After a build, render the generated app and check it actually works:
 *   1. Build the self-contained preview HTML (same engine the editor uses)
 *   2. Render it in headless Chromium when Playwright is available
 *      (PLAYWRIGHT_ENABLED=true + `playwright` importable) and collect
 *      page errors / console errors / empty-root failures.
 *      Without Playwright, fall back to static smoke checks.
 *   3. On failure, generate a fix (AUTO_FIX prompt), apply it, re-verify.
 *      Up to `maxRounds` fix rounds inside a hard time budget.
 *
 * Designed to run inside the chat/agent stream — emits progress strings and
 * never throws: a verification failure is reported, not fatal.
 */
import { z } from "zod";
import { recordEvent } from "../observability/events.ts";

import { buildFallbackHtml } from "../preview/build-fallback-html.ts";
import { verifyPreviewHtml } from "./preview-verify.ts";
import { findContractErrors } from "../preview/export-contract.ts";
import { filesWithSyntaxErrors, findMissingListKeys, findUnresolvedLocalImports, runTypecheckGate } from "../verify/typecheck-gate.ts";
import { typecheckRunningSandbox } from "../preview/typecheck-project.ts";
import { pushFileToRunningSandbox } from "../preview/push-to-sandbox.ts";
import { generateAI } from "./generate.ts";
import { DEFAULT_CODING_MODEL,DIAGNOSIS_MODEL,ECONOMY_CODING_MODEL,envPricedModel,ESCALATION_MODEL,FAST_CODING_MODEL,getDefaultAiModel } from "./model-defaults.ts";
import { applyModelAdapter } from "./model-catalog.ts";
import { AUTO_FIX_EDITS_SYSTEM_PROMPT } from "./prompts/auto-fix.ts";
import { buildPreviewDiagnosis } from "../preview/diagnose-preview.ts";
import { guardFileWrite } from "./guard-file-write.ts";
import { deterministicRepair } from "./deterministic-repair.ts";
import { findDependencyIssues } from "../verify/dependency-gate.ts";
import { fingerprintError } from "./failure-fingerprint.ts";
import { recordRepairOutcome } from "./record-outcome.ts";
import type { ProjectFile } from "../../types/database.ts";
import { loadOptionalPlaywright } from "../optional-playwright.ts";
import { isLadderExhausted,resolveRepairTier,shouldPromoteRepairTier } from "./repair-ladder.ts";
import { buildPriorAttemptsBlock,lookupPriorAttempts,suggestedStartingTier } from "./repair-memory.ts";
import { applyEditBlocks,validateEditBatch } from "./edit-blocks.ts";

export interface SelfVerifyResult {
  engine: "browser" | "static";
  passed: boolean;
  rounds: number;
  fixesApplied: number;
  /** Files rewritten by fix rounds (path → new content) */
  fixedFiles: Array<{ path: string; content: string; language: string }>;
  errors: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// Raised from 55s when verification became a per-route sweep: 8 extra route
// loads (~2s each) plus a fix round must fit, or the sweep gets cut off right
// before the re-verify that would confirm the fix.
// Raised from 90s when the ladder became progress-gated (below). The cap that
// ends a repair sequence should be "it stopped helping", not "the clock ran
// out mid-improvement" — but latency is a real cost too, so this stays a hard
// wall and is env-overridable for tuning without a deploy.
const TIME_BUDGET_MS = Number(process.env.SELF_VERIFY_TIME_BUDGET_MS) || 150_000;
// Ceiling, not a sleep. This was a FIXED 3.5s wait per render — and the
// verification sweep renders every route, so ~8 routes spent ~28 seconds of
// every failed build waiting for pages that had finished painting in 300ms.
// settleRender() below polls for actual readiness (content in the mount node,
// no pending fetches) and returns as soon as the page is genuinely settled;
// this constant is now only the worst-case bound for a page that never stops
// loading, which is exactly the page the empty-render check should then see.
const RENDER_SETTLE_MS = 3_500;
const SETTLE_POLL_MS = 150;

/**
 * Wait until the page is actually ready to be judged, up to RENDER_SETTLE_MS.
 *
 * "Ready" = a mount node has children AND no fetch/XHR started by the page is
 * still in flight (tracked via an init-script counter, so it works on live
 * URLs and srcdoc alike). Two consecutive ready polls are required so a page
 * that mounts a spinner and immediately fetches does not pass between the
 * mount and the fetch.
 *
 * Fail-open by design: if evaluate() throws (navigation race, CSP), fall back
 * to the old fixed sleep — a slower verdict beats a wrong one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settleRender(page: any): Promise<void> {
  const deadline = Date.now() + RENDER_SETTLE_MS;
  let readyStreak = 0;
  while (Date.now() < deadline) {
    let ready = false;
    try {
      ready = await page.evaluate(() => {
        const root =
          document.getElementById("root") ||
          document.getElementById("__next") ||
          document.querySelector("[data-reactroot]") ||
          document.body;
        const mounted = !!root && root.children.length > 0;
        const w = window as unknown as {
          __lmPendingFetches?: number;
          __lmLastMutation?: number;
        };
        const quiet = (w.__lmPendingFetches ?? 0) === 0;
        // Review-caught gap: mounted+quiet passes a setTimeout-driven spinner
        // that never touches fetch. Two further conditions close it:
        //   - the DOM has been STILL for 400ms (MutationObserver timestamp —
        //     absent counter means the init script did not run; treat "no
        //     record" as still, since the fetch counter degrades the same way);
        //   - something VISIBLE actually rendered (text or a sized element),
        //     so a bare container div is not "content".
        const lastMutation = w.__lmLastMutation ?? 0;
        const domStill = Date.now() - lastMutation > 400;
        const hasVisibleContent =
          !!root &&
          ((root.textContent ?? "").trim().length > 0 ||
            root.getBoundingClientRect().height > 8);
        // Second review round: a STABLE spinner defeats the mutation window —
        // render a static "Loading…" shell, schedule the real content with a
        // 1s setTimeout, and mounted+still+visible all pass ~500ms early. So a
        // page ADVERTISING busyness is not ready, whatever else looks settled.
        // Heuristic and best-effort — the first-party signal below is the
        // reliable path.
        const el = root as Element | null;
        const busy =
          !!el &&
          (el.matches?.('[aria-busy="true"]') === true ||
            !!el.querySelector?.(
              '[aria-busy="true"], [role="progressbar"], .animate-spin, [data-loading="true"]',
            ) ||
            /^\s*(loading|please wait|initializing|starting)[.\u2026\s]*$/i.test(
              (el.textContent ?? "").trim(),
            ));
        // First-party bridge: a generated app ends the guessing by dispatching
        // window.dispatchEvent(new Event("lifemark:ready")) when its content is
        // genuinely up. Recorded by the init script; once seen it overrides the
        // busy heuristic (the app knows best) but never the mounted/quiet
        // checks (a lying app still has to have painted).
        const appSaysReady = (w as { __lmAppReady?: boolean }).__lmAppReady === true;
        return (
          mounted && quiet && domStill && hasVisibleContent &&
          (appSaysReady || !busy) &&
          document.readyState !== "loading"
        );
      });
    } catch {
      await page.waitForTimeout(RENDER_SETTLE_MS - Math.max(0, deadline - Date.now() - RENDER_SETTLE_MS));
      return;
    }
    readyStreak = ready ? readyStreak + 1 : 0;
    if (readyStreak >= 2) return;
    await page.waitForTimeout(SETTLE_POLL_MS);
  }
}

/** Injected before any page script: counts in-flight fetch/XHR for settleRender. */
const PENDING_FETCH_COUNTER = `(() => {
  let n = 0;
  try {
    Object.defineProperty(window, "__lmAppReady", { value: false, writable: true, configurable: true });
    window.addEventListener("lifemark:ready", () => { window.__lmAppReady = true; }, { once: true });
  } catch {}
  try {
    let last = Date.now();
    Object.defineProperty(window, "__lmLastMutation", { get: () => last, configurable: true });
    const mo = new MutationObserver(() => { last = Date.now(); });
    const arm = () => { try { mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true }); } catch {} };
    if (document.documentElement) arm(); else document.addEventListener("DOMContentLoaded", arm, { once: true });
  } catch {}
  Object.defineProperty(window, "__lmPendingFetches", { get: () => n, configurable: true });
  const f = window.fetch?.bind(window);
  if (f) window.fetch = (...a) => { n++; return f(...a).finally(() => { n--; }); };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...a) {
    n++;
    this.addEventListener("loadend", () => { n--; }, { once: true });
    return send.apply(this, a);
  };
})();`;

/**
 * Vision QA — send the rendered screenshot to a vision-capable model and get
 * back at most 3 CRITICAL visual defects. Opt-in via VISION_REVIEW=true;
 * model via VISION_REVIEW_MODEL (default: a cheap vision-capable slug).
 */
async function visionDesignReview(screenshotBase64: string): Promise<string[]> {
  // Was openai/gpt-4o-mini. Every OpenAI model was removed from this product on
  // 2026-08-19; gemini-3.1-flash-lite is the same price ($0.25/$1.50), two
  // generations newer, vision-capable, and has 7 provider endpoints against
  // gpt-4o-mini's fewer. Still overridable via VISION_REVIEW_MODEL.
  const model = envPricedModel("VISION_REVIEW_MODEL", "google/gemini-3.1-flash-lite");
  const res = await generateAI({
    model,
    maxTokens: 300,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content:
          'You are a strict UI defect screener. Look at the app screenshot and return ONLY JSON: {"issues": ["..."]} with at most 3 CRITICAL visual defects. Critical = blank/empty sections, unreadable text contrast, overlapping or clipped elements, raw placeholder text (lorem ipsum, "undefined", "NaN", "[object Object]"), or obviously broken layout. Style/taste preferences are NOT defects. Return {"issues": []} when the page looks acceptable. Each issue must be a concrete, fixable instruction naming what and where.',
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Screen this rendered app for CRITICAL visual defects only." },
          { type: "image_url", image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
        ] as unknown as string,
      },
    ],
  });
  try {
    const parsed = JSON.parse(res.content.trim().replace(/^```(?:json)?|```$/g, "")) as { issues?: unknown };
    if (!Array.isArray(parsed.issues)) return [];
    return parsed.issues
      .filter((i): i is string => typeof i === "string" && i.trim().length > 0)
      .slice(0, 3)
      .map((i) => `Visual: ${i.trim()}`);
  } catch {
    return [];
  }
}

/**
 * Every static route the generated app declares, straight from its router.
 *
 * WHY. Verification used to visit only "/", and "/" in app-shell projects
 * REDIRECTS to the main working screen — so the one route the check rendered
 * was the one route the model polished, and it passed while /orders and
 * /reports crashed on data-shape bugs the moment a human clicked them
 * (observed live: RangeError from an invalid seed date, an order-items array
 * rendered as a React child, `undefined.map` from a mock whose shape didn't
 * match the page). Multi-pass builds make this LIKELY, not rare: the
 * continuation pass writes data files without re-reading every page.
 *
 * Dynamic segments (:id) and catch-alls are skipped — there is no principled
 * value to substitute — and the list is capped so verification stays inside
 * its time budget.
 */
function extractAppRoutes(files: ProjectFile[]): string[] {
  const router = files.find((f) => /^src\/App\.(tsx|jsx)$/.test(f.path));
  if (!router?.content) return [];
  const routes = new Set<string>();
  for (const m of router.content.matchAll(/path\s*=\s*["']([^"']+)["']/g)) {
    const p = m[1];
    if (!p.startsWith("/")) continue;
    if (p === "/" || p.includes(":") || p.includes("*")) continue;
    routes.add(p);
  }
  return [...routes].slice(0, 8);
}

// Superseded by settleRender() — kept only if a future call site needs a raw bound.
const ROUTE_SETTLE_MS = 1_500;
void ROUTE_SETTLE_MS;

/**
 * Placeholder copy a half-finished page renders instead of its module.
 *
 * Observed on a live ERP build: five modules came out rich and complete while
 * `/inventory` rendered 143 characters — "This generated section is ready to
 * customize." The route was not blank and threw nothing, so a crash-and-blank
 * check passed it, and the user opens the one page they most wanted to see and
 * finds a stub. Continuation passes make this common: the model runs out of
 * budget and leaves a placeholder behind intending to come back.
 */
const STUB_PAGE_RE =
  /\b(ready to customi[sz]e|coming soon|content goes here|placeholder (?:page|content|section)|generated section|under construction|todo:? add|lorem ipsum)\b/i;

/** Below this, a page that isn't blank is still not a page. */
const STUB_TEXT_CHARS = 320;

/** Render the preview HTML or navigate a live URL in headless Chromium. */
async function renderAndCollectErrors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  playwright: { chromium: any },
  html: string,
  liveUrl?: string | null,
  wantScreenshot = false,
  routes: string[] = [],
): Promise<{ errors: string[]; screenshot: string | null }> {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];

    // Route context on every error: "TypeError: … .map" alone sends the fixer
    // to the wrong file; "[route /reports] TypeError: … .map" names the page.
    let currentRoute = "/";
    const tag = (message: string) =>
      currentRoute === "/" ? message : `[route ${currentRoute}] ${message}`;

    page.on("pageerror", (err: Error) => {
      errors.push(tag(`Uncaught: ${err.message}`));
    });
    page.on("console", (msg: { type: () => string; text: () => string }) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // Ignore network noise (CDN hiccups, favicons) — we care about app errors
      if (/favicon|net::|Failed to load resource/i.test(text)) return;
      errors.push(tag(text));
    });

    try {
      await page.addInitScript(PENDING_FETCH_COUNTER);
    } catch {
      /* settleRender degrades to mount-only readiness without the counter */
    }
    if (liveUrl && /^https?:\/\//i.test(liveUrl)) {
      await page.goto(liveUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    } else {
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15_000 });
    }
    await settleRender(page);

    // Deeper blank-screen / undefined-component detection: not just "is #root
    // empty" but "did anything meaningful actually render". Live Modal/Next
    // previews may use #__next or body children instead of #root.
    const isLive = !!(liveUrl && /^https?:\/\//i.test(liveUrl));
    const diag = await page.evaluate(() => {
      const root =
        document.getElementById("root") ||
        document.getElementById("__next") ||
        document.querySelector("[data-reactroot]");
      const childCount = root
        ? root.children.length
        : document.body
          ? document.body.children.length
          : 0;
      const text = ((document.body && document.body.innerText) || "").trim();
      const missing = (((document.body && document.body.innerText) || "").match(/missing component/gi) || []).length;
      // Symbols the app pulled out of modules that don't exist — recorded by the
      // preview's __Mrequire proxy. These name the exact file+symbol to create.
      const w = window as unknown as {
        __lmMissingExports?: Array<{ module: string; symbol: string }>;
      };
      const missingExports = (w.__lmMissingExports ?? []).slice(0, 12);
      return { hasRoot: !!root, childCount, textLen: text.length, missing, missingExports };
    }).catch(() => ({
      hasRoot: true, childCount: 1, textLen: 999, missing: 0,
      missingExports: [] as Array<{ module: string; symbol: string }>,
    }));

    if (errors.length === 0) {
      if (isLive) {
        if (diag.textLen < 3 && diag.childCount === 0) {
          errors.push("Live preview appears blank — no visible content after mount.");
        }
      } else if (diag.childCount === 0) {
        // childCount already falls back to document.body.children.length when
        // no #root/#__next/[data-reactroot] element exists (see diagnostic
        // collection above), so it's a valid empty-page signal on its own —
        // short-circuiting on !diag.hasRoot rejected every vanilla HTML/CSS/JS
        // app (no root element by design) regardless of real body content.
        errors.push(
          diag.hasRoot
            ? "App rendered an empty page — #root has no children after mount."
            : "App rendered an empty page — no visible content in <body> after mount."
        );
      } else if (diag.textLen < 3 && diag.childCount <= 1) {
        errors.push("App appears to render a blank screen — no visible content after mount.");
      }
    }
    // Name the exact file+symbol rather than just counting placeholders — a count
    // is not something the fixer can act on, but "create src/.../Navbar exporting
    // Navbar" is.
    const byModule = new Map<string, string[]>();
    for (const { module, symbol } of diag.missingExports ?? []) {
      byModule.set(module, [...(byModule.get(module) ?? []), symbol]);
    }
    for (const [module, symbols] of byModule) {
      errors.push(
        `${symbols.join(", ")} ${symbols.length === 1 ? "was" : "were"} imported from "${module}", but that file does not exist in the project — create it and export ${symbols.join(", ")}.`
      );
    }

    if (diag.missing > 0 && byModule.size === 0) {
      errors.push(`${diag.missing} component(s) failed to resolve (shown as "missing component" placeholders) — check imports/exports or create the missing file.`);
    }

    // ── Sweep every declared route, not just "/" ────────────────────────────
    // Full page loads (goto), not pushState: a route whose module fails to
    // even import must still register as THAT route's crash. Navigation
    // failures (container mid-install, tunnel hiccup) are skipped rather than
    // reported — a route we could not LOAD is not a route that crashed.
    if (isLive && routes.length > 0) {
      const base = (liveUrl as string).replace(/\/+$/, "");
      const measured: Array<{ route: string; textLen: number }> = [];
      for (const route of routes) {
        currentRoute = route;
        try {
          await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 12_000 });
        } catch {
          continue;
        }
        await settleRender(page);
        const before = errors.length;
        const routeDiag = await page
          .evaluate(() => {
            const text = ((document.body && document.body.innerText) || "").trim();
            const root = document.getElementById("root");
            return {
              textLen: text.length,
              childCount: root ? root.children.length : 0,
              text: text.slice(0, 400),
            };
          })
          .catch(() => ({ textLen: 999, childCount: 1, text: "" }));
        if (errors.length > before) continue; // already reported a crash here
        if (routeDiag.textLen < 3 && routeDiag.childCount === 0) {
          errors.push(`[route ${route}] Route renders a blank page — the component crashed or renders nothing.`);
          continue;
        }
        // A page that renders placeholder copy is a missing page wearing a
        // page's clothes. Name it so the fixer builds the real module.
        if (STUB_PAGE_RE.test(routeDiag.text)) {
          errors.push(
            `[route ${route}] Route renders placeholder copy instead of a real page. Build this module for real: full data table or content, actions, and realistic seeded rows from the shared data layer.`,
          );
          continue;
        }
        measured.push({ route, textLen: routeDiag.textLen });
      }

      // Relative thinness: one near-empty module beside five full ones is a
      // gap, even without placeholder wording. Compared against the median so
      // a uniformly compact app never trips it.
      if (measured.length >= 3) {
        const lens = measured.map((m) => m.textLen).sort((a, b) => a - b);
        const median = lens[Math.floor(lens.length / 2)];
        for (const m of measured) {
          if (m.textLen < STUB_TEXT_CHARS && m.textLen * 4 < median) {
            errors.push(
              `[route ${m.route}] Route is nearly empty (${m.textLen} characters) while the rest of the app is substantially fuller — this module was left unfinished. Build it out with real content and data.`,
            );
          }
        }
      }
      currentRoute = "/";
    }

    // Optional vision-QA capture — only worth the bytes when the app rendered.
    let screenshot: string | null = null;
    if (wantScreenshot && errors.length === 0) {
      try {
        if (isLive && routes.length > 0) {
          // The route sweep navigated away — return to the app's front door.
          await page.goto(liveUrl as string, { waitUntil: "domcontentloaded", timeout: 12_000 }).catch(() => {});
          await settleRender(page);
        }
        const buf = await page.screenshot({ type: "png", fullPage: false });
        screenshot = Buffer.from(buf).toString("base64");
      } catch { /* non-fatal */ }
    }

    return { errors: [...new Set(errors)].slice(0, 10), screenshot };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Static fallback when Playwright isn't available. */
function staticVerify(html: string): string[] {
  const { checks } = verifyPreviewHtml(html);
  return checks
    .filter((c) => !c.pass)
    .map((c) => (c.detail ? `${c.name}: ${c.detail}` : c.name));
}

const fixFilesSchema = z.object({
  files: z.array(z.object({ path: z.string().min(1), content: z.string() })).default([]),
});

// A repair round asks the model to return complete file contents as JSON.
// Models occasionally emit "smart" typography — curly quotes, em/en dashes,
// zero-width joiners, a stray BOM — where a straight ASCII character belongs,
// most often near the top of a file (an opening string, an import path).
// Those characters are valid inside a JSON string, so they survive JSON.parse
// untouched, but they are not valid inside the *source code* that string
// contains: tsc lexes them as TS1127 "Invalid character" and the repair gets
// rejected as corrupt even though the JSON itself parsed cleanly. Normalizing
// the handful of characters a model actually substitutes closes that class of
// self-inflicted corruption without touching anything else in the file.
const SMART_CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-",
  " ": " ",
  "﻿": "",
  "​": "", "‌": "", "‍": "",
};
const SMART_CHAR_RE = new RegExp(`[${Object.keys(SMART_CHAR_MAP).join("")}]`, "g");

function sanitizeRepairedSource(content: string): string {
  return content.replace(SMART_CHAR_RE, (ch) => SMART_CHAR_MAP[ch] ?? ch);
}

/**
 * Resolve a repair response into concrete file contents.
 *
 * The repair prompt now offers TWO output shapes, cheapest first:
 *
 *   {"edits":[{"path","search","replace"}]}   anchored edits — a one-line fix
 *                                             bills ~a dozen output tokens
 *   {"files":[{"path","content"}]}            whole files — the old contract,
 *                                             still required for new files and
 *                                             near-total rewrites
 *
 * Edits are applied ALL-OR-NOTHING by applyEditBlocks: a search that is absent
 * or ambiguous rejects the batch, the failure reasons are surfaced, and the
 * round scores as failed exactly like a corrupt whole-file repair — which the
 * progress-gated ladder then treats as evidence. A bad edit can therefore
 * never half-land, and the worst case is precisely the old behaviour.
 */
function resolveRepairResponse(
  raw: string,
  current: ReadonlyMap<string, string>,
): { files: Array<{ path: string; content: string }>; editFailures: string[] } {
  const trimmed = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { edits?: unknown };
      if (Array.isArray(parsed.edits) && parsed.edits.length > 0) {
        // STRICT: one malformed edit rejects the whole batch. Filtering the
        // bad ones and applying the rest is a half-applied repair — the exact
        // thing the all-or-nothing contract exists to prevent.
        const batch = validateEditBatch(parsed.edits);
        if (!batch.ok) {
          return { files: [], editFailures: [batch.reason] };
        }
        const applied = applyEditBlocks(batch.blocks, current);
        if (applied.ok) {
          return {
            files: [...applied.files].map(([path, content]) => ({
              path,
              content: sanitizeRepairedSource(content),
            })),
            editFailures: [],
          };
        }
        return { files: [], editFailures: applied.failures };
      }
    } catch {
      /* fall through to the whole-file parser */
    }
  }
  return { files: parseFixFiles(raw), editFailures: [] };
}

function parseFixFiles(raw: string): Array<{ path: string; content: string }> {
  const trimmed = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    // Improvement #2: schema-validate instead of trusting the cast — a model
    // quirk (files as object, numeric content) can no longer slip through.
    const parsed = fixFilesSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return [];
    return parsed.data.files.map((f) => ({ ...f, content: sanitizeRepairedSource(f.content) }));
  } catch {
    return [];
  }
}

/** Pick the files most relevant to an error message (entry files + matches). */
/**
 * Files named EXPLICITLY by a compiler diagnostic — "src/App.tsx:2:77 — TS2304".
 *
 * A compile error carries an exact path, so guessing is unnecessary. The
 * heuristic scorer below exists for RUNTIME errors, where the stack trace names
 * minified vendor code and the real file has to be inferred from route tags and
 * filename fragments — it ships up to 8 files at 6,000 chars each, roughly
 * 12,000 input tokens, because it genuinely does not know which one is wrong.
 *
 * Paying that for an error that already states the file is the single most
 * wasteful thing in the repair path.
 */
function filesNamedByCompiler(files: ProjectFile[], errors: string[]): ProjectFile[] {
  const paths = new Set<string>();
  for (const e of errors) {
    // Matches both gate formats: "src/App.tsx:2:77 — TS2304: …" (typecheck)
    // and "src/App.tsx:4 — imports \"./X\"…" (unresolved import).
    const m = e.match(/^([\w./-]+\.\w+):\d+/);
    if (m) paths.add(m[1]);
  }
  if (paths.size === 0) return [];
  return files.filter((f) => paths.has(f.path));
}

function relevantFiles(files: ProjectFile[], errors: string[]): ProjectFile[] {
  const errorBlob = errors.join("\n");
  // Route tags ("[route /reports] …") name the crashing page and, usually, the
  // data module it consumes — surface both so the fixer sees the page AND the
  // mock it disagrees with, not just whichever file the stack trace mentioned.
  const routeTokens = [...errorBlob.matchAll(/\[route \/([\w-]+)\]/g)].map((m) => m[1].toLowerCase());
  // The "CSS covers markup classes" static check (preview-verify.ts) names the
  // *class names* that lack a rule ("… never styled: nav-link, app-shell"), not
  // any file path — so the generic `errorBlob.includes(name)` match below never
  // fires for the stylesheet itself (a file named "styles.css" doesn't contain
  // the substring "styles" in an error that only lists class names). Without an
  // explicit boost here, `styles.css` silently misses the top-8 cut and the fix
  // round never sees the file it's supposed to edit — the model then patches
  // blind, which is why fix rounds for this error historically produced no
  // visible change even though they clearly "ran" (see prod incident: .nav-link
  // still missing from styles.css after a full fix round completed).
  const cssCoverageIssue = /never styled/i.test(errorBlob);
  const scored = files
    .filter((f) => /\.(tsx|jsx|ts|js|css|html)$/.test(f.path))
    .map((f) => {
      let score = 0;
      const name = f.path.split("/").pop() ?? "";
      const stem = name.replace(/\.\w+$/, "").toLowerCase();
      if (errorBlob.includes(name.replace(/\.\w+$/, ""))) score += 5;
      for (const token of routeTokens) {
        if (stem === token || stem === token.replace(/s$/, "") || `${stem}s` === token) {
          score += /^src\/(pages|data|stores)\//.test(f.path) ? 6 : 4;
        }
      }
      if (routeTokens.length > 0 && /^src\/data\//.test(f.path)) score += 2;
      if (/App\.(t|j)sx$/.test(f.path) || /main\.(t|j)sx$/.test(f.path)) score += 3;
      if (/index\.html$/.test(f.path)) score += 1;
      if (cssCoverageIssue && /\.css$/.test(f.path)) score += 7;
      return { f, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map((s) => s.f);
}

export async function runSelfVerification(opts: {
  supabase: SupabaseClient;
  projectId: string;
  userId?: string;
  maxRounds?: number;
  emit?: (status: string) => void;
  /** Live Modal/WC/deploy URL — preferred over srcdoc fallback when Playwright is available. */
  previewUrl?: string | null;
  /** Complete in-memory candidate; canonical project files remain untouched. */
  candidateFiles?: ProjectFile[];
  /** Defaults false for candidate mode and true for legacy live verification. */
  persistFixes?: boolean;
}): Promise<SelfVerifyResult | null> {
  const { supabase, projectId } = opts;
  const emit = opts.emit ?? (() => {});
  // HARD CAP on repair rounds. `opts.maxRounds ?? 2` was only a default, so any
  // caller could raise it; the Math.min below keeps it a ceiling.
  //
  // Raised 2 -> 4 on 2026-08-27, on measured behaviour rather than taste.
  // repair_outcomes over 11 days (n=46 typecheck attempts):
  //
  //   round 1  deepseek-v4-flash  138 errors in -> 97 resolved, 43 introduced,
  //                               41 remaining
  //   round 2  gpt-5.6-terra       82 errors in -> 34 resolved,  9 introduced,
  //                               48 remaining
  //
  // Two things fall out of that. The cheap tier is NOT failing — it clears ~70%
  // of the errors it is handed. And two rounds does not converge: the sequence
  // hit the cap with 48 errors still standing and shipped a broken build
  // anyway. So the cap was ending runs that were still making progress, and the
  // escalation it forced (92% of repairs reached round 2) was buying a WORSE
  // resolution rate than the tier it escalated past, at ~200x the price
  // ($0.104 vs $0.0005 per call).
  //
  // The fix is not more escalation, it is more turns for whatever is working —
  // see repairTiers below, which now promotes on lack of progress rather than
  // on round number. TIME_BUDGET_MS remains the real backstop.
  const MAX_REPAIR_ROUNDS = 4;
  const maxRounds = Math.min(opts.maxRounds ?? MAX_REPAIR_ROUNDS, MAX_REPAIR_ROUNDS);
  const startedAt = Date.now();

  const result: SelfVerifyResult = {
    engine: "static",
    passed: false,
    rounds: 0,
    fixesApplied: 0,
    fixedFiles: [],
    errors: [],
  };

  try {
    // Load the full project (verification needs every file, not just this build's)
    let files: ProjectFile[];
    if (opts.candidateFiles) {
      files = opts.candidateFiles.map((file) => ({ ...file }));
    } else {
      const { data: rows } = await supabase
        .from("project_files")
        .select("path, content, language")
        .eq("project_id", projectId);
      files = (rows ?? []) as ProjectFile[];
    }
    if (files.length === 0) return null;

    let liveUrl =
      typeof opts.previewUrl === "string" && /^https?:\/\//i.test(opts.previewUrl.trim())
        ? opts.previewUrl.trim()
        : null;
    if (!liveUrl && !opts.candidateFiles) {
      const { data: proj } = await supabase
        .from("projects")
        .select("preview_url, deployed_url")
        .eq("id", projectId)
        .maybeSingle();
      const preview = (proj as { preview_url?: string | null } | null)?.preview_url;
      const deployed = (proj as { deployed_url?: string | null } | null)?.deployed_url;
      if (typeof preview === "string" && /^https?:\/\//i.test(preview)) liveUrl = preview;
      else if (typeof deployed === "string" && /^https?:\/\//i.test(deployed)) liveUrl = deployed;
    }

    let playwright = await loadOptionalPlaywright();
    result.engine = playwright ? "browser" : "static";
    emit(
      playwright
        ? liveUrl
          ? "Testing your live preview in a real browser…"
          : "Testing your app in a real browser…"
        : "Verifying your app…",
    );

    // ── The repair ladder ───────────────────────────────────────────────────
    // Explicit, not inferred. selectModelChain() used to pick these by scoring
    // a synthetic prompt, which meant the models doing your repairs changed
    // whenever the scoring heuristics were tuned.
    //
    //   tier 0  FAST_CODING_MODEL      mechanical, precisely-located defects
    //   tier 1  DEFAULT_CODING_MODEL   the generator repairs its own build,
    //                                  briefed by DIAGNOSIS_MODEL
    //   tier 2  ESCALATION_MODEL       a different lab entirely, last resort
    //
    // THE PROMOTION RULE IS THE POINT. A tier used to be chosen by round index,
    // so round 1 escalated unconditionally — including when round 0 had just
    // resolved 70% of the errors and was plainly working. Promotion is now
    // driven by OBSERVED PROGRESS: a tier that reduced the error count keeps
    // the next turn, and only a tier that stalled (or made things worse) hands
    // off to the one above it.
    //
    // That inverts the economics. The old shape paid $0.104 to escalate away
    // from a tier that costs $0.0005 and was succeeding; the new shape spends
    // ~$0.0015 on three cheap turns and escalates only against evidence. It is
    // also strictly safer: a stalled tier still escalates, just on a real
    // signal instead of a counter.
    //
    // `repairTier` only ever moves UP — a tier that stalled once does not get
    // re-tried after a more capable one unsticks the build, because the thing
    // it stalled on is still in the file.
    const repairTiers: string[] = [
      FAST_CODING_MODEL,
      DEFAULT_CODING_MODEL,
      ESCALATION_MODEL,
    ];
    let repairTier = 0;
    /** Error count seen at the START of the previous round, or null on round 0. */
    let lastErrorCount: number | null = null;

    // A repair attempt cannot be scored at the moment it is made — only the
    // next render says whether it worked. So each attempt is held here and
    // settled at the top of the following round, against what that render
    // found. This is what makes the recorded outcome an observation rather
    // than the model's own opinion of its work.
    let pending: {
      before: ReturnType<typeof fingerprintError>[];
      round: number;
      model?: string;
      /** Which check produced the BEFORE labels — see the note in settle(). */
      signal: "typecheck" | "runtime";
      written: string[];
      rejected: string[];
      startedAt: number;
    } | null = null;

    const settle = (after: string[], afterSignal: "typecheck" | "runtime") => {
      if (!pending) return;
      recordRepairOutcome({
        projectId,
        userId: opts.userId,
        stage: "self_verify",
        round: pending.round,
        model: pending.model,
        // Which check produced these labels, recorded explicitly because the
        // two are NOT comparable. Runtime labels only cover the routes the
        // browser sweep actually reached and stop at the first crash; compiler
        // labels cover every file and every error in them. Averaging a success
        // rate across both would produce a number that means nothing — and now
        // that the typecheck gate runs first, most rounds carry compiler labels.
        signal: pending.signal,
        before: pending.before,
        after: after.map((message) => fingerprintError(message, afterSignal)),
        filesWritten: pending.written,
        filesRejected: pending.rejected,
        durationMs: Date.now() - pending.startedAt,
      });
      pending = null;
    };

    // Rounds absorbed by the FREE deterministic pass do not spend the model
    // budget: a string rewrite that fixes an import costs nothing, and charging
    // it against maxRounds would mean a free fix REDUCES how many paid attempts
    // the build gets. Capped so the loop stays bounded even if a later paid
    // round keeps introducing deterministically-fixable breakage.
    let freeRounds = 0;
    const MAX_FREE_ROUNDS = 2;

    for (let round = 0; round <= maxRounds + freeRounds; round++) {
      result.rounds = round + 1;
      const roundStartedAt = Date.now();
      const html = buildFallbackHtml(files);

      // Broken module contracts — a file imported but never created, or a symbol
      // imported but never exported — surface at runtime only as an opaque
      // "Cannot read properties of undefined" deep inside React, naming neither
      // the symbol nor the file. Worse, the FIRST such crash masks all the
      // others, so a browser-only check finds one bug per round.
      //
      // Detect them statically from source instead: we get ALL of them at once,
      // each as a precise, directly actionable instruction. That's what makes
      // the auto-fix round actually succeed rather than flailing on a stack
      // trace that points into minified react-dom.
      const contractErrors = findContractErrors(files);

      // ── Deterministic type-check, BEFORE the browser ───────────────────────
      // A compile error found here names the file, line and column. The same
      // error found by rendering arrives as an opaque runtime stack trace deep
      // inside react-dom, and the first crash masks all the others — so a
      // browser-only pass finds one bug per round however many exist.
      //
      // Ordered first for a second reason: if the code cannot compile, the
      // render is guaranteed to be uninformative, so paying for a browser
      // launch before knowing that is wasted latency on every broken build.
      //
      // `available: false` means the compiler could not run (missing, timed
      // out). That is NOT a pass — it is unknown — so the browser check still
      // happens exactly as before and nothing regresses.
      // Unresolved LOCAL imports run first — pure string work, no child
      // process, so it costs nothing and it catches the one class tsc cannot
      // report distinguishably. `import { Card } from "./Card"` where Card.tsx
      // was never created raises TS2307, the exact code tsc also raises for
      // `import from "react"` in a project with no node_modules — so the type
      // gate has to filter TS2307 wholesale and this defect would vanish with
      // it. Resolving relative specifiers against the real file set separates
      // the two: a missing local file is a bug, a missing package is sandbox.
      //
      // findContractErrors() above is the sibling check — it catches a symbol
      // that is imported but not exported, and explicitly skips modules it
      // cannot resolve. This covers precisely that skipped case.
      const importErrors = findUnresolvedLocalImports(files).map((u) => u.formatted);

      // The npm twin of the check above, and just as free. An import of a
      // package the allowlist REFUSES will never install, so it can only be
      // fixed by rewriting the code — but until now nothing said so anywhere:
      // the installer refused silently and the repair model was left to infer
      // "this library does not exist here" from an opaque resolve error. Each
      // one is now a located, self-explanatory instruction. (Allowed-but-
      // missing packages are the deterministic tier's job — it writes them
      // into package.json at pinned versions before any model is called.)
      const dependencyErrors = findDependencyIssues(files).disallowed.map((d) => d.formatted);

      // React logs a missing list `key` through console.error, so it reaches the
      // preview's error stream and the user sees a red console on an app that
      // otherwise works fine. Measured once in a 50-build smoke run — the only
      // render failure whose app was genuinely usable. Free to detect, so it
      // never justifies a model call.
      const keyWarnings = findMissingListKeys(files).map((k) => k.formatted);

      // ── Which compiler ────────────────────────────────────────────────────
      // Two type-checkers exist and they are NOT equivalent:
      //
      //   sandbox (preview/typecheck-project.ts) runs `tsc` INSIDE the running
      //     container, where the project's real dependency tree is installed.
      //     It is strictly stronger — it is the only check in the system that
      //     can see `import { Body } from "@tanstack/react-router"` where that
      //     export does not exist (TS2305). Valid-looking text to every regex.
      //
      //   local (verify/typecheck-gate.ts) runs tsc in a temp dir with NO
      //     node_modules, so it must discard every module-resolution
      //     diagnostic and is therefore blind to that whole class.
      //
      // Prefer the sandbox one — but ONLY when the sandbox actually holds the
      // files being verified. In candidate mode the candidate has not been
      // pushed: the container still has the PREVIOUS version, so a sandbox
      // check would compile the old code and report a false clean on a broken
      // candidate. That is the worst possible failure for a verification step,
      // so candidate mode always uses the local gate.
      let typeErrorList: string[] = [];
      let compilerUsed: "sandbox" | "local" | "none" = "none";

      if (!opts.candidateFiles) {
        const sandboxCheck = await typecheckRunningSandbox(supabase, projectId, { timeoutSec: 25 }).catch(
          () => null,
        );
        if (sandboxCheck) {
          compilerUsed = "sandbox";
          typeErrorList = sandboxCheck.diagnostics
            .filter((d) => d.category === "error")
            .slice(0, 6)
            .map((d) =>
              d.file
                ? `${d.file}:${d.line ?? 0}:${d.column ?? 0} — TS${d.code}: ${d.message}`
                : `TS${d.code}: ${d.message}`,
            );
        }
      }

      if (compilerUsed === "none") {
        const typecheck = await runTypecheckGate(files, { timeoutMs: 30_000, maxErrors: 6 });
        if (typecheck.available) {
          compilerUsed = "local";
          typeErrorList = typecheck.errors.map((e) => e.formatted);
        } else if (typecheck.skippedReason) {
          console.warn(`[self-verify] typecheck gate skipped: ${typecheck.skippedReason}`);
        }
      }

      const typeErrors = [...importErrors, ...dependencyErrors, ...typeErrorList, ...keyWarnings];

      // Which compiler ran is worth knowing in production. "local" on a live
      // build means the sandbox check silently returned null — no container,
      // DISABLE_SANDBOX_TYPECHECK set, the provider lacking the capability, or
      // a timeout — and the weaker checker has quietly taken over. That looks
      // identical in the logs to the strong one passing, which is exactly how a
      // whole class of errors starts sailing through unnoticed.
      if (round === 0) {
        console.info(
          `[self-verify] compiler=${compilerUsed} typeErrors=${typeErrorList.length} importErrors=${importErrors.length} candidate=${Boolean(opts.candidateFiles)}`,
        );
      }

      // Compile errors short-circuit the render. There is nothing a browser can
      // add about code that does not build, and skipping the launch here is
      // what turns the gate into a latency SAVING rather than an extra step.
      if (typeErrors.length > 0) {
        const what = importErrors.length > 0 && typeErrorList.length === 0 ? "Missing file" : "Compile";
        emit(`${what} check found ${typeErrors.length} error${typeErrors.length === 1 ? "" : "s"} — fixing before preview…`);
      }

      const visionEnabled = process.env.VISION_REVIEW === "true";
      const appRoutes = extractAppRoutes(files);
      let rendered: { errors: string[]; screenshot: string | null };
      if (typeErrors.length > 0) {
        rendered = { errors: [], screenshot: null };
      } else if (playwright) {
        try {
          rendered = await renderAndCollectErrors(playwright, html, liveUrl, visionEnabled && round === 0, appRoutes);
        } catch (renderErr) {
          // The playwright PACKAGE can import successfully while its browser
          // BINARY is missing from the image (e.g. `npx playwright install`
          // never ran in this container) — the loader only checks the
          // former. That mismatch used to throw here, escape the round loop,
          // and get silently eaten by the outer catch, rejecting every
          // candidate with a content-free "could not complete" message. Once
          // a real browser launch fails it will keep failing for the rest of
          // this run, so stop trying it and use static checks for every
          // remaining round instead of just this one.
          console.error("[self-verify] real-browser render failed, falling back to static checks:", renderErr);
          playwright = null;
          rendered = { errors: staticVerify(html), screenshot: null };
        }
      } else {
        rendered = { errors: staticVerify(html), screenshot: null };
      }
      const runtimeErrors = rendered.errors;

      // Type errors lead: they carry a file:line:column, so the repair model can
      // go straight to the defect instead of inferring a location from a stack.
      let errors = [...new Set([...typeErrors, ...contractErrors, ...runtimeErrors])].slice(0, 6);
      const roundSignal: "typecheck" | "runtime" = typeErrors.length > 0 ? "typecheck" : "runtime";

      // ── Vision design review (env-gated, Lovable "agent looks at the result") ──
      // Only when the app renders cleanly: a vision model screens the actual
      // screenshot for CRITICAL visual defects (blank sections, unreadable
      // contrast, overlap, raw placeholder text) — taste is out of scope.
      if (errors.length === 0 && visionEnabled && rendered.screenshot) {
        const visualIssues = await visionDesignReview(rendered.screenshot).catch(() => [] as string[]);
        if (visualIssues.length > 0) {
          emit(`Visual check found ${visualIssues.length} issue${visualIssues.length === 1 ? "" : "s"} — fixing…`);
          errors = visualIssues.slice(0, 3);
        }
      }

      // Settle the previous round's attempt against what this render found,
      // before any early return can skip it.
      settle(errors, roundSignal);

      if (errors.length === 0) {
        result.passed = true;
        result.errors = [];
        emit("Verified — your app runs without errors ✓");
        return result;
      }

      result.errors = errors;

      // ── Did the previous round actually help? ─────────────────────────────
      // `errors` here is the state AFTER the previous round's repair, freshly
      // observed by this round's typecheck/render — not the repair model's own
      // opinion of its work. That is what makes this a measurement.
      //
      // Strictly fewer errors = progress = the current tier keeps its turn.
      // Equal or more = stalled = promote. Note that "made things worse" lands
      // in the same bucket as "changed nothing", which is deliberate: both mean
      // this tier has stopped being the right tool, and both should escalate.
      if (shouldPromoteRepairTier(errors.length, lastErrorCount)) repairTier += 1;
      lastErrorCount = errors.length;

      // Running out of LADDER is a real stop condition, not just a cap. Once the
      // most capable tier has itself stalled, another round buys another bill
      // and the same errors — the old shape had no way to express this and
      // simply burned its remaining rounds.
      const ladderExhausted = isLadderExhausted(repairTier, repairTiers.length);

      if (round - freeRounds === maxRounds || ladderExhausted || Date.now() - startedAt > TIME_BUDGET_MS) {
        emit(`Verification found ${errors.length} issue${errors.length === 1 ? "" : "s"} — open the preview to review.`);
        return result;
      }

      // ── Deterministic repair — the free tier, before any model ────────────
      // The same fixers the build path runs (import repointing + generated
      // support files), applied to the CURRENT file set. A broken import that
      // slipped through — or that a previous paid round introduced — is fixed
      // here as a string rewrite: no tokens, no latency, no model variance.
      // Only fires on the error classes it can address; everything else falls
      // through to the ladder untouched. See deterministic-repair.ts.
      if (freeRounds < MAX_FREE_ROUNDS) {
        const det = deterministicRepair(files, errors);
        const detTouched = [...det.changedPaths, ...det.createdPaths];
        if (detTouched.length > 0) {
          const written: string[] = [];
          const rejected: string[] = [];
          const persistFixes = opts.persistFixes ?? !opts.candidateFiles;
          const nextByPath = new Map(det.files.map((f) => [f.path, f]));
          for (const path of detTouched) {
            const nf = nextByPath.get(path);
            if (!nf || typeof nf.content !== "string") continue;
            // Same write guard as the paid path: this loop is driven by a
            // failing preview, and "deterministic" is not a licence to blank a
            // working file if a fixer ever misbehaves.
            const verdict = guardFileWrite({
              path,
              next: nf.content,
              previous: files.find((pf) => pf.path === path)?.content ?? null,
            });
            if (!verdict.ok) {
              rejected.push(path);
              continue;
            }
            written.push(path);
            const language =
              nf.language ??
              (path.endsWith(".tsx") ? "typescriptreact"
                : path.endsWith(".ts") ? "typescript"
                : path.endsWith(".css") ? "css"
                : path.endsWith(".html") ? "html"
                : "javascript");
            if (persistFixes) {
              await supabase.from("project_files").upsert(
                { project_id: projectId, path, content: nf.content, language },
                { onConflict: "project_id,path" },
              );
              pushFileToRunningSandbox(supabase, projectId, path, nf.content);
            }
            result.fixedFiles.push({ path, content: nf.content, language });
            const idx = files.findIndex((pf) => pf.path === path);
            files = idx >= 0
              ? files.map((pf, i) => (i === idx ? { ...pf, content: nf.content } : pf))
              : [...files, { path, content: nf.content, language } as ProjectFile];
          }
          if (written.length > 0) {
            result.fixesApplied += 1;
            freeRounds += 1;
            emit(`Fixed ${written.length} file${written.length === 1 ? "" : "s"} locally (no AI) — re-verifying…`);
            // Scored exactly like a paid attempt: held open and settled against
            // what the NEXT round's checks observe, under model "deterministic",
            // so the fingerprint report shows what the free tier absorbed.
            pending = {
              before: errors.map((message) => fingerprintError(message, roundSignal)),
              round: round + 1,
              signal: roundSignal,
              model: "deterministic",
              written,
              rejected,
              startedAt: roundStartedAt,
            };
            // A deterministic round must not move the LADDER: if the rewrite
            // did not help, the fast tier still deserves its first turn — the
            // null baseline never promotes (repair-ladder contract).
            lastErrorCount = null;
            if (!opts.candidateFiles) await new Promise((resolve) => setTimeout(resolve, 4_000));
            continue;
          }
        }
      }

      // ── Fix round ───────────────────────────────────────────────────────────
      emit(`Found: ${errors[0].slice(0, 110)} — fixing…`);
      // ── Context selection: precise when we can be, broad only when we must ─
      // Compiler errors name their file. Sending only those files instead of
      // the heuristic top-8 typically cuts repair INPUT tokens by ~4-6x, and
      // input is what dominates a repair call: the fix itself is a few hundred
      // tokens, the context is thousands.
      //
      // Falls back to the heuristic whenever the compiler named nothing we
      // still hold (a deleted file, an odd path), so a narrower context can
      // never mean an emptier one.
      const namedByCompiler = filesNamedByCompiler(files, errors);
      const usePreciseContext = roundSignal === "typecheck" && namedByCompiler.length > 0;
      const contextFiles = usePreciseContext ? namedByCompiler : relevantFiles(files, errors);
      const context = contextFiles
        .map((f) => `=== ${f.path} ===\n${(f.content ?? "").slice(0, 6_000)}`)
        .join("\n\n");
      const diagnosis = buildPreviewDiagnosis(
        files,
        errors.map((message) => ({
          kind: /vite|compile|syntax|transform|unexpected token/i.test(message) ? "bundler" : "runtime",
          message,
          timestamp: Date.now(),
        })),
      );

      // ── Which model repairs ───────────────────────────────────────────────
      // A compiler error is a LOCALISED, mechanical defect: a missing import, a
      // wrong argument count, a name that does not exist. The compiler has
      // already done the hard part — finding it — and with precise context the
      // prompt is small, which is exactly the regime the fast tier handles well
      // (measured 7/7 on edit-precision and surgical-restraint, ~1.7s on short
      // prompts). Using the generator here would pay 2.4x the input rate and 7x
      // the output rate to add a missing import.
      //
      // The fast tier is used ONLY when the context is genuinely small. It
      // collapses on large inputs — measured 175s on a 250-line file against
      // 16s for the generator — so a big context must never land here.
      //
      // The `round === 0` clause is GONE, and that is the behavioural change.
      // It meant a small, precisely-located compile error was handed to the
      // fast tier once and then, whatever the outcome, escalated — so a tier
      // that was resolving ~70% of what it saw never got a second turn on the
      // remainder. Eligibility is now about the SHAPE of the work (located,
      // small) rather than about which round happens to be running.
      const PRECISE_CONTEXT_CHAR_BUDGET = 12_000;
      const cheapRepairEligible =
        usePreciseContext && context.length <= PRECISE_CONTEXT_CHAR_BUDGET;

      // A tier floor, not a tier choice: a broad or bulky context must never
      // reach the fast tier however well the ladder is going, because that is
      // the regime it is measured to collapse in. Promotion still only ever
      // moves upward, so the floor can raise the tier for a round but never
      // lower it back.
      const tierFloor = cheapRepairEligible ? 0 : 1;
      // ── What has already been tried on THIS failure? ──────────────────────
      // repair_outcomes has graded every prior attempt since migration 161 and
      // nothing read one back, so the ladder would re-run an approach that had
      // already failed on the identical fingerprint. Memory raises the floor by
      // at most one tier (see suggestedStartingTier) and, more usefully, tells
      // the repair model what not to repeat.
      //
      // Best-effort throughout: a lookup failure yields [] and the round runs
      // exactly as before. Memory improves a repair; it is never a precondition
      // for one — the same rule record-outcome.ts follows on the write side.
      const priorAttempts = await lookupPriorAttempts(
        supabase,
        errors.map((message) => fingerprintError(message, roundSignal)),
        { projectId, signal: roundSignal },
      );
      const memoryFloor = suggestedStartingTier(
        priorAttempts,
        (model) => {
          const i = model ? repairTiers.indexOf(model) : -1;
          return i >= 0 ? i : null;
        },
        repairTiers.length,
      );

      const tier = resolveRepairTier(
        repairTier,
        Math.max(tierFloor, memoryFloor),
        repairTiers.length,
      );
      const fixModel = repairTiers[tier] ?? ECONOMY_CODING_MODEL ?? getDefaultAiModel();

      // ── AI diagnosis, round 0 only ────────────────────────────────────────
      // buildPreviewDiagnosis() above is a DETERMINISTIC reading of the error
      // list — it is kept, because it is free and it never hallucinates. This
      // adds a second, reasoning pass on top of it from a DIFFERENT vendor than
      // the model about to do the repair.
      //
      // It runs once, before the first repair, and deliberately not before the
      // second: by round 1 the escalation model is reading the round-0 diagnosis
      // AND the errors that survived the round-0 repair, which is strictly more
      // information than a fresh diagnosis would give it.
      //
      // Prose only, no code, ~400 tokens. If it fails or times out the repair
      // proceeds without it rather than failing the build — a missing diagnosis
      // makes the repair worse, not impossible.
      let aiDiagnosis = "";
      // SKIPPED for compiler errors, deliberately. A diagnosis call exists to
      // turn a vague runtime stack trace into a located cause. When the error
      // already reads "src/App.tsx:2:77 — TS2304: Cannot find name 'Dashboard'",
      // there is nothing left to diagnose — paying a reasoning model at
      // $1.44/M input to restate a compiler message is pure cost, and it also
      // adds seconds of latency to the cheapest kind of fix there is.
      //
      // This matters because the type-check gate finds MORE errors than the
      // browser ever did. Without this branch, the gate would have increased
      // spend: every compile error it surfaced would have triggered a paid
      // diagnosis that the compiler had already performed for free.
      if (round === 0 && roundSignal !== "typecheck") {
        emit("Working out what went wrong…");
        const diag = await generateAI(
          {
            model: DIAGNOSIS_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "You are diagnosing a failed web app build. Explain the ROOT CAUSE of the errors below in at most 5 short bullets. " +
                  "Name the exact file and symbol at fault where you can. Do NOT write any code, do NOT suggest a rewrite, " +
                  "and do NOT restate the error text — say what is actually wrong and why it produces that error.",
              },
              {
                role: "user",
                content: `Errors:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nRelevant files:\n${context}`,
              },
            ],
            temperature: 0,
            maxTokens: 400,
          },
          { projectId, userId: opts.userId, task: "self_verify.diagnose" },
        ).catch(() => null);
        aiDiagnosis = (diag?.content ?? "").trim();
      }

      // Message follows the TIER, not the round — the two came apart when
      // promotion stopped being keyed on round number. A round that is still on
      // the same tier is another attempt, not an escalation, and saying
      // "escalating" there would be a lie to the user about what they are being
      // charged for.
      if (tier > 0 && round > 0) emit("Previous fix didn't hold — escalating…");
      else if (round > 0) emit("Still fixing…");
      const fix = await generateAI(
        {
          model: fixModel,
          messages: [
            { role: "system", content: applyModelAdapter(AUTO_FIX_EDITS_SYSTEM_PROMPT, fixModel) },
            {
              role: "user",
              // Name the errors' actual provenance. Most rounds now carry
              // compiler/static-gate errors that were caught BEFORE any render,
              // and telling the model they were "found while rendering in a
              // browser" pointed it at runtime hypotheses (state, effects,
              // timing) for what is a mechanical compile-time defect.
              content: `${
                roundSignal === "typecheck"
                  ? "Fix these errors found by static checks (compiler, import resolution, module contracts) before the app was rendered:"
                  : "Fix these runtime errors found while rendering the app in a browser:"
              }\n\n${errors
                .map((e) => `- ${e}`)
                .join("\n")}${diagnosis ? `\n\nPreview diagnosis (fix these first):\n${diagnosis}` : ""}${
                aiDiagnosis ? `\n\nRoot-cause analysis from a second model — treat this as the brief, not a suggestion:\n${aiDiagnosis}` : ""
              }${buildPriorAttemptsBlock(priorAttempts)}\n\nRelevant files:\n${context}\n\nPREFERRED: return targeted edits as {"edits":[{"path":"...","search":"<exact current lines, copied verbatim, unique in the file>","replace":"<replacement lines>"}]} — several small edits beat one large one, and search text must be copied exactly from the files above. Return whole files as {"files":[{"path":"...","content":"..."}]} ONLY for a file that must be created or almost entirely rewritten.`,
            },
          ],
          temperature: 0.1,
          // Was a flat 6,000 tokens — well under the 16,000 the sibling
          // standalone repair route (src/lib/ai/http/fix.ts, AUTO_FIX_MAX_TOKENS)
          // allows for the same "return complete, never-truncated files" prompt.
          // A tight ceiling here doesn't fail loudly: the response is valid JSON
          // that closes cleanly at the cap, but the *file content* inside it is
          // cut short, which reads to the syntax checker as corruption and gets
          // rejected below. Matching the sibling route's budget/override gives a
          // multi-file repair the same room to actually finish.
          maxTokens: Number(process.env.AUTO_FIX_MAX_TOKENS) || 16_000,
          jsonMode: true,
        },
        { projectId, userId: opts.userId, task: "self_verify.autofix" },
      );

      const currentByPath = new Map(files.map((f) => [f.path, f.content ?? ""]));
      const resolved = resolveRepairResponse(fix?.content ?? "", currentByPath);
      if (resolved.editFailures.length > 0) {
        // The model proposed anchored edits and they did not apply cleanly.
        // Refusing outright (rather than guessing) is the contract that makes
        // cheap edits safe; the round scores as failed and the ladder reacts.
        console.warn(
          `[self-verify] rejected edit batch: ${resolved.editFailures.join("; ")}`,
        );
      }
      const fixedFiles = resolved.files;
      if (fixedFiles.length === 0) {
        emit("Couldn't auto-fix — open the preview to review the error.");
        return result;
      }

      // ── Reject a repair that does not parse ───────────────────────────────
      // guardFileWrite() below refuses a blanking write and a repetition loop,
      // but it cannot see TRUNCATION: a repair that hit its 6,000-token ceiling
      // returns a file that is syntactically incomplete yet neither empty nor
      // repetitive, so it passes every existing guard and lands on top of a
      // working file. That is the "a failed build must never replace the last
      // working version" rule, and until now nothing enforced it.
      //
      // Syntax only. A repair that leaves a TYPE error behind is still progress
      // and the next round settles it; a repair that leaves a SYNTAX error is
      // corruption, and a file that does not parse cannot be an improvement on
      // one that does.
      const repairCandidate = new Map(files.map((f) => [f.path, f]));
      for (const rf of fixedFiles) {
        repairCandidate.set(rf.path, {
          ...(repairCandidate.get(rf.path) ?? {}),
          path: rf.path,
          content: rf.content,
        } as ProjectFile);
      }
      const corrupted = await filesWithSyntaxErrors([...repairCandidate.values()]).catch(
        () => new Map<string, string>(),
      );

      const written: string[] = [];
      const rejected: string[] = [];

      for (const f of fixedFiles) {
        const corruption = corrupted.get(f.path);
        if (corruption) {
          // Keep the previous content. Recorded as rejected so the round scores
          // honestly as "still broken" rather than silently claiming success.
          console.warn(`[self-verify] rejected corrupt repair of ${f.path}: ${corruption}`);
          rejected.push(f.path);
          continue;
        }

        // Same reasoning as the auto-fix route: this loop is driven by a
        // failing preview, so an unvalidated write turns one bad model response
        // into a ratchet that every later round makes worse. Refusing a suspect
        // write leaves the last working version in place and lets the round be
        // reported as "still broken", which is the truth.
        const verdict = guardFileWrite({
          path: f.path,
          next: f.content,
          previous: files.find((pf) => pf.path === f.path)?.content ?? null,
        });
        if (!verdict.ok) {
          emit(`Skipped an unsafe fix to ${f.path} — ${verdict.reason ?? verdict.code}`);
          rejected.push(f.path);
          continue;
        }
        written.push(f.path);

        const language = f.path.endsWith(".tsx") ? "typescriptreact"
          : f.path.endsWith(".ts") ? "typescript"
          : f.path.endsWith(".css") ? "css"
          : f.path.endsWith(".html") ? "html"
          : "javascript";
        const persistFixes = opts.persistFixes ?? !opts.candidateFiles;
        if (persistFixes) {
          await supabase.from("project_files").upsert(
            { project_id: projectId, path: f.path, content: f.content, language },
            { onConflict: "project_id,path" }
          );
        // The next verification round renders the LIVE preview — a fix that
        // only reached the database would be re-tested against the old file
        // and reported as "still broken" forever.
          pushFileToRunningSandbox(supabase, projectId, f.path, f.content);
        }
        result.fixedFiles.push({ path: f.path, content: f.content, language });
        // update local copy for the next verification round
        const idx = files.findIndex((pf) => pf.path === f.path);
        if (idx >= 0) files = files.map((pf, i) => (i === idx ? { ...pf, content: f.content } : pf));
        else files = [...files, { path: f.path, content: f.content, language } as ProjectFile];
      }
      result.fixesApplied += 1;
      // Hold the attempt open. It cannot be scored yet — the label is whatever
      // the NEXT round's render finds, and the only honest verdict on a repair
      // is what the code does afterwards, not what the model claimed.
      pending = {
        before: errors.map((message) => fingerprintError(message, roundSignal)),
        round: round + 1,
        signal: roundSignal,
        model: fix?.model,
        written,
        rejected,
        startedAt: roundStartedAt,
      };
      // Let the sandbox push (1.2s debounce) and Vite's reload land before the
      // next round re-renders the live preview, or round N+1 tests round N's code.
      if (!opts.candidateFiles) await new Promise((resolve) => setTimeout(resolve, 4_000));
    }

    recordEvent("build_verification_completed", {
      engine: result.engine,
      passed: result.passed,
      rounds: result.rounds,
      fixesApplied: result.fixesApplied,
      errorCount: result.errors.length,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (err) {
    // Verification must never break the build — but a silently swallowed
    // exception here is indistinguishable from a legitimate "verification
    // found real errors" rejection to everything downstream (the generic
    // "candidate verification could not complete" fallback in
    // http/agent.ts). Log the real cause so it shows up in server logs.
    console.error("[self-verify] verification threw and was suppressed:", err);
    recordEvent("build_verification_completed", {
      engine: result.engine,
      passed: result.passed,
      rounds: result.rounds,
      fixesApplied: result.fixesApplied,
      errorCount: result.errors.length,
      crashed: true,
      durationMs: Date.now() - startedAt,
    });
    return result.rounds > 0 ? result : null;
  }
}
