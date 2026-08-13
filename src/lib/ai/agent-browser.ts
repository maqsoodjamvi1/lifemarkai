/**
 * Mid-loop browser tools for the ReAct agent (Lovable parity).
 * Prefers Playwright when available; falls back to HTTP fetch + HTML text.
 */
import { buildFallbackHtml } from "../preview/build-fallback-html.ts";
import { loadOptionalPlaywright } from "../optional-playwright.ts";

export type BrowseAction = "navigate" | "click" | "fill" | "screenshot" | "snapshot";

export type BrowsePreviewArgs = {
  action: BrowseAction;
  /** Absolute URL, or "/" / path relative to deployed app / srcdoc */
  url?: string;
  selector?: string;
  value?: string;
  /** Optional deployed URL for live browsing */
  deployedUrl?: string | null;
  /** Used to upload screenshots into the project's previews bucket */
  projectId?: string | null;
  files?: Array<{ path: string; content: string }>;
};

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function resolveTargetUrl(args: BrowsePreviewArgs): { kind: "url" | "srcdoc"; target: string } {
  const raw = (args.url ?? "/").trim() || "/";
  if (/^https?:\/\//i.test(raw)) return { kind: "url", target: raw };
  if (args.deployedUrl) {
    try {
      const base = args.deployedUrl.replace(/\/$/, "");
      const path = raw.startsWith("/") ? raw : `/${raw}`;
      return { kind: "url", target: `${base}${path}` };
    } catch {
      /* fall through */
    }
  }
  const files = args.files ?? [];
  // buildFallbackHtml only needs path/content; cast avoids pulling full ProjectFile rows.
  const html = buildFallbackHtml(
    files.map((f) => ({ path: f.path, content: f.content })) as Parameters<
      typeof buildFallbackHtml
    >[0],
  );
  return { kind: "srcdoc", target: html };
}

async function fetchSnapshot(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "LifemarkAI-AgentBrowser/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  const html = await res.text();
  return [
    `engine=fetch status=${res.status}`,
    `title≈${(html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "").trim()}`,
    htmlToText(html),
  ].join("\n");
}

/**
 * Run one browser interaction against the project's preview (live URL or fallback HTML).
 */
export async function browsePreview(args: BrowsePreviewArgs): Promise<string> {
  const action = args.action;
  if (!action) return "Error: action is required (navigate|click|fill|screenshot|snapshot).";

  const resolved = resolveTargetUrl(args);
  const playwright = await loadOptionalPlaywright();

  if (!playwright) {
    if (action === "navigate" || action === "snapshot") {
      if (resolved.kind === "url") return fetchSnapshot(resolved.target);
      return [
        "engine=static (Playwright unavailable)",
        "Rendered fallback preview HTML (srcdoc).",
        htmlToText(resolved.target),
      ].join("\n");
    }
    return (
      `Error: action "${action}" requires Playwright (set PLAYWRIGHT_ENABLED and install playwright). ` +
      "Use snapshot/navigate with a deployed URL, or read_preview_console / read_preview_network."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromium = (playwright as any).chromium;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", (err: Error) => errors.push(`Uncaught: ${err.message}`));

    if (resolved.kind === "url") {
      await page.goto(resolved.target, { waitUntil: "domcontentloaded", timeout: 20_000 });
    } else {
      await page.setContent(resolved.target, { waitUntil: "domcontentloaded", timeout: 20_000 });
    }
    await page.waitForTimeout(800);

    if (action === "navigate" || action === "snapshot") {
      const title = await page.title().catch(() => "");
      const text = await page.evaluate(() => (document.body?.innerText || "").trim().slice(0, 3500));
      const urlNow = page.url();
      return [
        `engine=playwright action=${action}`,
        `url=${urlNow}`,
        `title=${title}`,
        errors.length ? `runtime_errors=${errors.slice(0, 5).join(" | ")}` : "runtime_errors=none",
        "--- page text ---",
        text || "(empty)",
      ].join("\n");
    }

    if (action === "click") {
      const sel = String(args.selector ?? "").trim();
      if (!sel) return "Error: selector required for click.";
      await page.click(sel, { timeout: 8_000 });
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => (document.body?.innerText || "").trim().slice(0, 2000));
      return `engine=playwright action=click selector=${sel}\nurl=${page.url()}\n--- after click ---\n${text}`;
    }

    if (action === "fill") {
      const sel = String(args.selector ?? "").trim();
      const value = String(args.value ?? "");
      if (!sel) return "Error: selector required for fill.";
      await page.fill(sel, value, { timeout: 8_000 });
      return `engine=playwright action=fill selector=${sel} value_len=${value.length}\nurl=${page.url()}\nFilled successfully.`;
    }

    if (action === "screenshot") {
      const buf: Buffer = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
      let screenshotUrl: string | null = null;
      // Persist to the `previews` STORAGE bucket (migration 032 / 159 — not a
      // Postgres table) so chat can show a thumbnail without stuffing multi-MB
      // base64 into the agent observation.
      if (args.projectId) {
        try {
          const { createAdminClient } = await import("@/lib/supabase/server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const admin = (await createAdminClient()) as any;
          const path = `agent-browse/${args.projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const { error } = await admin.storage
            .from("previews")
            .upload(path, buf, { contentType: "image/jpeg", upsert: true });
          if (!error) {
            const { data } = admin.storage.from("previews").getPublicUrl(path);
            screenshotUrl = data?.publicUrl ?? null;
          }
        } catch {
          /* best-effort */
        }
      }
      return [
        `engine=playwright action=screenshot`,
        `url=${page.url()}`,
        `bytes=${buf.length}`,
        screenshotUrl ? `screenshot_url=${screenshotUrl}` : "screenshot_url=(upload failed — see bytes only)",
        "(Screenshot captured. Chat shows the thumbnail when screenshot_url is present; do not embed image bytes in code.)",
      ].join("\n");
    }

    return `Error: unknown action "${action}".`;
  } catch (err) {
    return `Error browsing preview: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    await browser.close().catch(() => {});
  }
}
