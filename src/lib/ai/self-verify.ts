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

import { buildFallbackHtml } from "../preview/build-fallback-html.ts";
import { verifyPreviewHtml } from "./preview-verify.ts";
import { findContractErrors } from "../preview/export-contract.ts";
import { pushFileToRunningSandbox } from "../preview/push-to-sandbox.ts";
import { generateAI } from "./generate.ts";
import { ECONOMY_CODING_MODEL,getDefaultAiModel } from "./model-defaults.ts";
import { selectModelChain,applyModelAdapter } from "./model-catalog.ts";
import { AUTO_FIX_SYSTEM_PROMPT } from "./system-prompts.ts";
import { buildPreviewDiagnosis } from "../preview/diagnose-preview.ts";
import { guardFileWrite } from "./guard-file-write.ts";
import { fingerprintError } from "./failure-fingerprint.ts";
import { recordRepairOutcome } from "./record-outcome.ts";
import type { ProjectFile } from "../../types/database.ts";
import { loadOptionalPlaywright } from "../optional-playwright.ts";

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
const TIME_BUDGET_MS = 90_000;
const RENDER_SETTLE_MS = 3_500;

/**
 * Vision QA — send the rendered screenshot to a vision-capable model and get
 * back at most 3 CRITICAL visual defects. Opt-in via VISION_REVIEW=true;
 * model via VISION_REVIEW_MODEL (default: a cheap vision-capable slug).
 */
async function visionDesignReview(screenshotBase64: string): Promise<string[]> {
  const model = process.env.VISION_REVIEW_MODEL || "openai/gpt-4o-mini";
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

const ROUTE_SETTLE_MS = 1_500;

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

    if (liveUrl && /^https?:\/\//i.test(liveUrl)) {
      await page.goto(liveUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    } else {
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15_000 });
    }
    await page.waitForTimeout(RENDER_SETTLE_MS);

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
      } else if (!diag.hasRoot || diag.childCount === 0) {
        errors.push("App rendered an empty page — #root has no children after mount.");
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
        await page.waitForTimeout(ROUTE_SETTLE_MS);
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
          await page.waitForTimeout(ROUTE_SETTLE_MS);
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

function parseFixFiles(raw: string): Array<{ path: string; content: string }> {
  const trimmed = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    // Improvement #2: schema-validate instead of trusting the cast — a model
    // quirk (files as object, numeric content) can no longer slip through.
    const parsed = fixFilesSchema.safeParse(JSON.parse(jsonMatch[0]));
    return parsed.success ? parsed.data.files : [];
  } catch {
    return [];
  }
}

/** Pick the files most relevant to an error message (entry files + matches). */
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
  const maxRounds = opts.maxRounds ?? 2;
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

    // Hybrid cross-model verify: each fix round uses a different, family-diverse
    // model so a stuck error gets a fresh perspective instead of the same model
    // failing the same way. Final entry anchors to the proven coding tier.
    const fixChain = selectModelChain("fix runtime and build errors in the app", {
      require: ["fixes", "code"],
      preferCheap: true,
      maxChain: maxRounds + 1,
      anchor: ECONOMY_CODING_MODEL,
    });

    // A repair attempt cannot be scored at the moment it is made — only the
    // next render says whether it worked. So each attempt is held here and
    // settled at the top of the following round, against what that render
    // found. This is what makes the recorded outcome an observation rather
    // than the model's own opinion of its work.
    let pending: {
      before: ReturnType<typeof fingerprintError>[];
      round: number;
      model?: string;
      written: string[];
      rejected: string[];
      startedAt: number;
    } | null = null;

    const settle = (after: string[]) => {
      if (!pending) return;
      recordRepairOutcome({
        projectId,
        userId: opts.userId,
        stage: "self_verify",
        round: pending.round,
        model: pending.model,
        // Labels come from a render, so they only cover the routes the sweep
        // actually reached. Stored explicitly because a success rate measured
        // this way is not comparable with one measured by the compiler.
        signal: "runtime",
        before: pending.before,
        after: after.map((message) => fingerprintError(message, "runtime")),
        filesWritten: pending.written,
        filesRejected: pending.rejected,
        durationMs: Date.now() - pending.startedAt,
      });
      pending = null;
    };

    for (let round = 0; round <= maxRounds; round++) {
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

      const visionEnabled = process.env.VISION_REVIEW === "true";
      const appRoutes = extractAppRoutes(files);
      let rendered: { errors: string[]; screenshot: string | null };
      if (playwright) {
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

      let errors = [...new Set([...contractErrors, ...runtimeErrors])].slice(0, 6);

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
      settle(errors);

      if (errors.length === 0) {
        result.passed = true;
        result.errors = [];
        emit("Verified — your app runs without errors ✓");
        return result;
      }

      result.errors = errors;
      if (round === maxRounds || Date.now() - startedAt > TIME_BUDGET_MS) {
        emit(`Verification found ${errors.length} issue${errors.length === 1 ? "" : "s"} — open the preview to review.`);
        return result;
      }

      // ── Fix round ───────────────────────────────────────────────────────────
      emit(`Found: ${errors[0].slice(0, 110)} — fixing…`);
      const context = relevantFiles(files, errors)
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

      const fixModel = fixChain[Math.min(round, fixChain.length - 1)] ?? ECONOMY_CODING_MODEL ?? getDefaultAiModel();
      if (round > 0) emit("Retrying the fix with a different model…");
      const fix = await generateAI(
        {
          model: fixModel,
          messages: [
            { role: "system", content: applyModelAdapter(AUTO_FIX_SYSTEM_PROMPT, fixModel) },
            {
              role: "user",
              content: `Fix these runtime errors found while rendering the app in a browser:\n\n${errors
                .map((e) => `- ${e}`)
                .join("\n")}${diagnosis ? `\n\nPreview diagnosis (fix these first):\n${diagnosis}` : ""}\n\nRelevant files:\n${context}\n\nReturn the fixed files as JSON.`,
            },
          ],
          temperature: 0.1,
          maxTokens: 6_000,
          jsonMode: true,
        },
        { projectId, userId: opts.userId, task: "self_verify.autofix" },
      );

      const fixedFiles = parseFixFiles(fix?.content ?? "");
      if (fixedFiles.length === 0) {
        emit("Couldn't auto-fix — open the preview to review the error.");
        return result;
      }

      const written: string[] = [];
      const rejected: string[] = [];

      for (const f of fixedFiles) {
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
        before: errors.map((message) => fingerprintError(message, "runtime")),
        round: round + 1,
        model: fix?.model,
        written,
        rejected,
        startedAt: roundStartedAt,
      };
      // Let the sandbox push (1.2s debounce) and Vite's reload land before the
      // next round re-renders the live preview, or round N+1 tests round N's code.
      if (!opts.candidateFiles) await new Promise((resolve) => setTimeout(resolve, 4_000));
    }

    return result;
  } catch (err) {
    // Verification must never break the build — but a silently swallowed
    // exception here is indistinguishable from a legitimate "verification
    // found real errors" rejection to everything downstream (the generic
    // "candidate verification could not complete" fallback in
    // http/agent.ts). Log the real cause so it shows up in server logs.
    console.error("[self-verify] verification threw and was suppressed:", err);
    return result.rounds > 0 ? result : null;
  }
}
