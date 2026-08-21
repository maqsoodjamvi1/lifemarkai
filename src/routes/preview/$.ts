import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPreviewToken } from "@/lib/preview/preview-token";
import { servePreviewHtml } from "@/lib/preview/serve-preview";

/**
 * Native /preview/$ — TRUE NATIVE (no worker).
 * Merges the two former Next handlers:
 *   /preview/:projectId            -> token-gated HTML (app/preview/[projectId])
 *   /preview/:projectId/*filePath  -> project asset  (app/preview/[projectId]/[...path])
 */
const MIME: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  ts: "application/javascript; charset=utf-8",
  jsx: "application/javascript; charset=utf-8",
  tsx: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
};

function forbidden(): Response {
  return new Response(
    `<!DOCTYPE html><html><body><p style="padding:2rem;font-family:system-ui">Preview access denied — invalid or expired token.</p></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function handleGET(req: Request, params: { _splat?: string }) {
  const splat = String(params?._splat ?? "").replace(/^\/+/, "");
  const segments = splat.split("/").filter(Boolean);
  const projectId = segments[0];
  if (!projectId) return new Response("Not found", { status: 404 });

  const filePath = segments.slice(1).join("/");

  // ── asset request: /preview/:projectId/<path> ──
  if (filePath) {
    const supabase = createAdminClient();
    const { data: file } = await supabase
      .from("project_files")
      .select("content, path")
      .eq("project_id", projectId)
      .in("path", [filePath, `/${filePath}`, filePath.replace(/^\//, "")])
      .maybeSingle();

    if (!file?.content) {
      return new Response(JSON.stringify({ error: "file not found", path: filePath }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    return new Response(file.content, {
      headers: {
        "Content-Type": MIME[ext] ?? "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  }

  // ── HTML request: /preview/:projectId (signed-token gate) ──
  const token = new URL(req.url).searchParams.get("token");
  const required = process.env.PREVIEW_REQUIRE_TOKEN === "true";
  if (required || token) {
    if (!token) return forbidden();
    const claims = verifyPreviewToken(token);
    if (!claims || claims.project_id !== projectId) return forbidden();
  }
  return servePreviewHtml(projectId);
}

export const Route = createFileRoute("/preview/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
      HEAD: async ({ request, params }) => handleGET(request, params),
    },
  },
});
