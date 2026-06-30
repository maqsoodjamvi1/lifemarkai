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

import { buildFallbackHtml } from "@/lib/preview/build-fallback-html";
import { verifyPreviewHtml } from "@/lib/ai/preview-verify";
import { generateAI } from "@/lib/ai/provider";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { selectModelChain, applyModelAdapter } from "@/lib/ai/model-catalog";
import { AUTO_FIX_SYSTEM_PROMPT } from "@/lib/ai/system-prompts";
import type { ProjectFile } from "@/types/database";

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

const TIME_BUDGET_MS = 55_000;
const RENDER_SETTLE_MS = 3_500;

/** Dynamically load Playwright without letting bundlers resolve it at build time. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryLoadPlaywright(): Promise<{ chromium: any } | null> {
  if (process.env.PLAYWRIGHT_ENABLED !== "true") return null;
  try {
    const modName = "playwright";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import(/* webpackIgnore: true */ modName)) as any;
    return mod?.chromium ? mod : mod?.default?.chromium ? mod.default : null;
  } catch {
    return null;
  }
}

/** Render the preview HTML in headless Chromium; return runtime errors. */
async function renderAndCollectErrors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  playwright: { chromium: any },
  html: string
): Promise<string[]> {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];

    page.on("pageerror", (err: Error) => {
      errors.push(`Uncaught: ${err.message}`);
    });
    page.on("console", (msg: { type: () => string; text: () => string }) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // Ignore network noise (CDN hiccups, favicons) — we care about app errors
      if (/favicon|net::|Failed to load resource/i.test(text)) return;
      errors.push(text);
    });

    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(RENDER_SETTLE_MS);

    // The app must actually mount something
    const rootEmpty = await page.evaluate(() => {
      const root = document.getElementById("root");
      return !root || root.children.length === 0;
    }).catch(() => false);
    if (rootEmpty && errors.length === 0) {
      errors.push("App rendered an empty page — #root has no children after mount.");
    }

    return [...new Set(errors)].slice(0, 4);
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

function parseFixFiles(raw: string): Array<{ path: string; content: string }> {
  const trimmed = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { files?: Array<{ path: string; content: string }> };
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    return [];
  }
}

/** Pick the files most relevant to an error message (entry files + matches). */
function relevantFiles(files: ProjectFile[], errors: string[]): ProjectFile[] {
  const errorBlob = errors.join("\n");
  const scored = files
    .filter((f) => /\.(tsx|jsx|ts|js|css|html)$/.test(f.path))
    .map((f) => {
      let score = 0;
      const name = f.path.split("/").pop() ?? "";
      if (errorBlob.includes(name.replace(/\.\w+$/, ""))) score += 5;
      if (/App\.(t|j)sx$/.test(f.path) || /main\.(t|j)sx$/.test(f.path)) score += 3;
      if (/index\.html$/.test(f.path)) score += 1;
      return { f, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map((s) => s.f);
}

export async function runSelfVerification(opts: {
  supabase: SupabaseClient;
  projectId: string;
  maxRounds?: number;
  emit?: (status: string) => void;
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
    const { data: rows } = await supabase
      .from("project_files")
      .select("path, content, language")
      .eq("project_id", projectId);
    let files = (rows ?? []) as ProjectFile[];
    if (files.length === 0) return null;

    const playwright = await tryLoadPlaywright();
    result.engine = playwright ? "browser" : "static";
    emit(playwright ? "Testing your app in a real browser…" : "Verifying your app…");

    // Hybrid cross-model verify: each fix round uses a different, family-diverse
    // model so a stuck error gets a fresh perspective instead of the same model
    // failing the same way. Final entry anchors to the proven coding tier.
    const fixChain = selectModelChain("fix runtime and build errors in the app", {
      require: ["fixes", "code"],
      maxChain: maxRounds + 1,
      anchor: getDefaultAiModel(),
    });

    for (let round = 0; round <= maxRounds; round++) {
      result.rounds = round + 1;
      const html = buildFallbackHtml(files);

      const errors = playwright
        ? await renderAndCollectErrors(playwright, html)
        : staticVerify(html);

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

      const fixModel = fixChain[Math.min(round, fixChain.length - 1)] ?? getDefaultAiModel();
      if (round > 0) emit("Retrying the fix with a different model…");
      const fix = await generateAI({
        model: fixModel,
        messages: [
          { role: "system", content: applyModelAdapter(AUTO_FIX_SYSTEM_PROMPT, fixModel) },
          {
            role: "user",
            content: `Fix these runtime errors found while rendering the app in a browser:\n\n${errors
              .map((e) => `- ${e}`)
              .join("\n")}\n\nRelevant files:\n${context}\n\nReturn the fixed files as JSON.`,
          },
        ],
        temperature: 0.1,
        maxTokens: 6_000,
        jsonMode: true,
      });

      const fixedFiles = parseFixFiles(fix?.content ?? "");
      if (fixedFiles.length === 0) {
        emit("Couldn't auto-fix — open the preview to review the error.");
        return result;
      }

      for (const f of fixedFiles) {
        const language = f.path.endsWith(".tsx") ? "typescriptreact"
          : f.path.endsWith(".ts") ? "typescript"
          : f.path.endsWith(".css") ? "css"
          : f.path.endsWith(".html") ? "html"
          : "javascript";
        await supabase.from("project_files").upsert(
          { project_id: projectId, path: f.path, content: f.content, language },
          { onConflict: "project_id,path" }
        );
        result.fixedFiles.push({ path: f.path, content: f.content, language });
        // update local copy for the next verification round
        const idx = files.findIndex((pf) => pf.path === f.path);
        if (idx >= 0) files = files.map((pf, i) => (i === idx ? { ...pf, content: f.content } : pf));
        else files = [...files, { path: f.path, content: f.content, language } as ProjectFile];
      }
      result.fixesApplied += 1;
    }

    return result;
  } catch {
    // Verification must never break the build
    return result.rounds > 0 ? result : null;
  }
}
