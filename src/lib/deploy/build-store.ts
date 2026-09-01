/**
 * Persist and read a published app's production build (see migration 160).
 *
 * Publishing used to be theatre: `provider: "lifemarkai"` slept 2.5s, wrote an
 * `{app_slug}.apps.lifemarkai.com` URL to projects.deployed_url and produced
 * nothing. This module is the missing half — it stores what `vite build`
 * actually emits so a visitor can be served real files.
 *
 * Server-only (service-role client). Never import from a client component.
 */
import { createAdminClient } from "../supabase/server.ts";

export interface StoredBuildFile {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
  contentType: string;
  byteSize: number;
}

/**
 * Asset classification lives in `asset-kind.ts`, not here.
 *
 * It was originally duplicated in this file and in build-project.ts. Two copies
 * of a text/binary extension list is how a `.woff2` ends up base64 on write and
 * utf-8 on read - the mismatch corrupts silently and is miserable to trace back
 * to a list that someone updated in one place. Re-exported so callers that
 * already import from here keep working.
 */
export {
  extensionOf,
  isTextAsset,
  contentTypeFor,
  normaliseBuildPath,
} from "@/lib/deploy/asset-kind";

import { isTextAsset,contentTypeFor,normaliseBuildPath } from "./asset-kind.ts";

/**
 * Store a completed build and make it live.
 *
 * Order matters: rows are inserted BEFORE `live_build_id` is flipped, so a
 * visitor never resolves a build id whose files are still being written. If the
 * insert fails the previous build stays live and the publish is simply
 * unsuccessful — never half-served.
 *
 * The final flip is a compare-and-swap, not a blind UPDATE: two publishes
 * for the same project (a double-click, or a second publish fired while an
 * earlier one is still building) can otherwise race, and whichever one's
 * flip lands LAST wins regardless of which build is actually newer — a
 * slower, older build can silently regress the live site back to stale
 * content even though a newer deployment already completed. `startedAt`
 * (defaults to "now" if the caller doesn't have a better value — see
 * publish-build.ts's `publishStartedAt`) becomes the new `live_build_at`,
 * and the UPDATE only applies `WHERE live_build_at IS NULL OR
 * live_build_at < startedAt` — an older build's flip then matches zero
 * rows instead of overwriting a newer build's already-live pointer.
 */
export async function storeBuild(
  projectId: string,
  buildId: string,
  files: Array<{ path: string; content: string; encoding?: "utf8" | "base64" }>,
  opts: { startedAt?: string } = {},
): Promise<{ ok: true; fileCount: number; wentLive: boolean } | { ok: false; error: string }> {
  if (!files.length) return { ok: false, error: "build produced no files" };

  const admin = createAdminClient();
  const rows = files.flatMap((f) => {
      const path = normaliseBuildPath(f.path);
      if (!path) return [];
      const encoding = f.encoding ?? (isTextAsset(path) ? "utf8" : "base64");
      const byteSize =
        encoding === "base64"
          ? Math.floor((f.content.length * 3) / 4)
          : Buffer.byteLength(f.content, "utf8");
      return [{
        project_id: projectId,
        build_id: buildId,
        path,
        content: f.content ?? "",
        encoding,
        content_type: contentTypeFor(path),
        byte_size: byteSize,
      }];
    });

  if (!rows.length) return { ok: false, error: "no storable files after normalisation" };
  if (!rows.some((r) => r.path === "index.html")) {
    // Without an entry document there is nothing to serve at "/". Failing here
    // is much better than publishing a build that 404s on its own front page.
    return { ok: false, error: "build has no index.html" };
  }

  // Chunked so one oversized request cannot fail the whole publish.
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await admin
      .from("project_builds")
      .insert(rows.slice(i, i + 50));
    if (error) return { ok: false, error: error.message };
  }

  const liveBuildAt = opts.startedAt ?? new Date().toISOString();
  const { error: flipError, data: flippedRows } = await admin
    .from("projects")
    .update({ live_build_id: buildId, live_build_at: liveBuildAt })
    .eq("id", projectId)
    .or(`live_build_at.is.null,live_build_at.lt.${liveBuildAt}`)
    .select("id");
  if (flipError) return { ok: false, error: flipError.message };
  const wentLive = (flippedRows?.length ?? 0) > 0;
  if (!wentLive) {
    // Zero rows matched: either the project doesn't exist, or (far more
    // likely — projectId came from a row we just inserted build files for)
    // a newer build's flip already won the race. Files are stored either
    // way (kept for history/rollback); only distinguish "project missing"
    // as a hard error.
    const { data: existing } = await admin.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (!existing) return { ok: false, error: "project not found" };
  }

  // Old builds are kept for rollback, but not forever — keep the 3 most recent.
  try {
    const { data: olderBuilds } = await admin
      .from("project_builds")
      .select("build_id, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    const seen: string[] = [];
    for (const row of olderBuilds ?? []) {
      if (!seen.includes(row.build_id)) seen.push(row.build_id);
    }
    const doomed = seen.slice(3);
    if (doomed.length) {
      await admin
        .from("project_builds")
        .delete()
        .eq("project_id", projectId)
        .in("build_id", doomed);
    }
  } catch {
    // Pruning is housekeeping. A failure here must not fail a successful publish.
  }

  return { ok: true, fileCount: rows.length, wentLive };
}

/**
 * Fetch one file of a project's live build.
 *
 * Returns null when the project has no live build, which is the caller's signal
 * to fall back rather than to 404 — an unpublished project is not an error.
 */
export async function readLiveBuildFile(
  projectId: string,
  requestedPath: string,
): Promise<StoredBuildFile | null> {
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("live_build_id")
    .eq("id", projectId)
    .maybeSingle();
  const buildId = project?.live_build_id;
  if (!buildId) return null;

  const wanted = normaliseBuildPath(requestedPath) || "index.html";

  const candidates = [wanted];
  // Directory-style URLs ("/about/") map to their index document.
  if (wanted.endsWith("/")) candidates.push(`${wanted}index.html`);
  // SPA fallback: a client-routed path like /dashboard has no file of its own.
  // Only fall back for requests that look like documents — never for an asset,
  // because returning index.html for a missing .js is how you get the
  // "Unexpected token '<'" error that sends people hunting through their code
  // for a syntax error that does not exist.
  const looksLikeAsset = /\.[a-z0-9]+$/i.test(wanted) && !/\.html?$/i.test(wanted);
  if (!looksLikeAsset) candidates.push("index.html");

  for (const path of candidates) {
    const { data } = await admin
      .from("project_builds")
      .select("path, content, encoding, content_type, byte_size")
      .eq("project_id", projectId)
      .eq("build_id", buildId)
      .eq("path", path)
      .maybeSingle();
    if (data) {
      return {
        path: data.path,
        content: data.content,
        encoding: data.encoding === "base64" ? "base64" : "utf8",
        contentType: data.content_type,
        byteSize: data.byte_size,
      };
    }
  }
  return null;
}

/**
 * Rewrite a built index.html's root-absolute asset URLs to sit under `base`.
 *
 * `vite build` emits `<script src="/assets/index-4f3c1b.js">`. Served at
 * `lifemarkai.com/preview-by-slug/my-app`, the browser resolves that against the
 * ORIGIN, requests `lifemarkai.com/assets/index-4f3c1b.js`, and gets the app's
 * own 404 page — HTML where JavaScript was expected, which surfaces as
 * "Unexpected token '<'" and sends you looking for a syntax error that does not
 * exist. The document loads, nothing renders, and the console blames the wrong
 * thing.
 *
 * Prefixing keeps every asset under the one route that exists, and works
 * unchanged whether the app is reached by path or by hostname.
 *
 * Only root-absolute paths are touched. Protocol-relative (`//cdn…`), absolute
 * (`https://…`), `data:`, `blob:`, anchors and already-relative URLs are left
 * exactly as they are — rewriting those would break external resources.
 */
export function rewriteAssetPaths(html: string, base: string): string {
  const prefix = `/${String(base).replace(/^\/+|\/+$/g, "")}`;
  return html.replace(
    /\b(src|href)=("|')\/(?!\/)([^"']*)\2/g,
    (whole, attr: string, quote: string, rest: string) => {
      // Idempotent on purpose. Applying this twice used to yield
      // /preview-by-slug/app/preview-by-slug/app/assets/… — every asset 404s and
      // the page renders blank, from a function that looks obviously correct in
      // isolation. Caught by asserting the second application, not the first.
      if (`/${rest}` === prefix || `/${rest}`.startsWith(`${prefix}/`)) return whole;
      return `${attr}=${quote}${prefix}/${rest}${quote}`;
    },
  );
}

/** Turn a stored file into an HTTP response with correct bytes and headers. */
export function buildFileResponse(file: StoredBuildFile): Response {
  const body =
    file.encoding === "base64" ? Buffer.from(file.content, "base64") : file.content;

  // Hashed assets (app-4f3c1b.js) are immutable; documents must never be cached
  // or a publish would not visibly change anything until the browser expired it.
  const hashed = /\.[0-9a-f]{8,}\.[a-z0-9]+$/i.test(file.path);
  const cacheControl =
    hashed && file.path !== "index.html"
      ? "public, max-age=31536000, immutable"
      : "no-cache";

  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
