import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient,createClient } from "@/lib/supabase/server";
import { servePreviewHtml } from "@/lib/preview/serve-preview";
import { appSlugFromHost } from "@/lib/deploy/apps-host";
import { injectLifemarkDataSdk } from "@/lib/preview/lifemark-data";
import {
readLiveBuildFile,
buildFileResponse,
rewriteAssetPaths,
} from "@/lib/deploy/build-store";

/**
 * Serves a published app.
 *
 * TWO ways in, and the difference matters:
 *
 *  1. `<slug>.apps.lifemarkai.com/whatever` — Traefik matches the wildcard host
 *     and prefixes the path with `/preview-by-slug`. The slug is in the HOST and
 *     the splat is the app's own path (`/`, `/assets/x.js`, `/about`). Traefik
 *     can rewrite a path but cannot move the host into it, so the host is read
 *     here.
 *  2. `lifemarkai.com/preview-by-slug/<slug>` — the slug is the first path
 *     segment. Kept working because existing links use it.
 *
 * Getting these the wrong way round serves `/assets/index.js` as if "assets"
 * were an app slug, so the host is checked FIRST and decides the interpretation.
 */
function notFoundHtml(): Response {
  return new Response(
    `<!DOCTYPE html><html><body><p style="padding:2rem;font-family:system-ui">App not found.</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function resolveRequest(req: Request, params: any): { slug: string; assetPath: string } | null {
  const splat = String(params?._splat ?? "").replace(/^\/+/, "");
  const hostSlug = appSlugFromHost(req.headers.get("host"));

  if (hostSlug) {
    // Host carries the identity; the whole splat is the app's own path.
    return { slug: hostSlug, assetPath: splat };
  }

  const segments = splat.split("/").filter(Boolean);
  if (!segments.length) return null;
  return { slug: segments[0], assetPath: segments.slice(1).join("/") };
}

async function handleGET(req: Request, params: any): Promise<Response> {
  const resolved = resolveRequest(req, params);
  if (!resolved) return notFoundHtml();
  const { slug, assetPath } = resolved;

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, is_public, visibility, live_build_id")
    .eq("app_slug", slug)
    .maybeSingle();

  if (!project) return notFoundHtml();

  const visibility: "public" | "workspace" | "private" =
    project.visibility === "public" ||
    project.visibility === "workspace" ||
    project.visibility === "private"
      ? project.visibility
      : project.is_public
        ? "public"
        : "workspace";

  if (visibility !== "public") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return notFoundHtml();
    if (user.id !== project.user_id) {
      if (visibility === "private") return notFoundHtml();
      const { data: collab } = await admin
        .from("collaborators")
        .select("id")
        .eq("project_id", project.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!collab) return notFoundHtml();
    }
  }

  // Access has been decided. Serve the stored production build if one exists —
  // this is the whole point of publishing, and it needs no running container.
  if (project.live_build_id) {
    const file = await readLiveBuildFile(project.id as string, assetPath);
    if (file) {
      // The entry document needs its asset URLs pointed back through this route.
      // Vite emits root-absolute paths (`/assets/…`), which would otherwise
      // resolve against the origin and 404. Only the HTML is rewritten; the
      // assets themselves are served byte-for-byte.
      if (file.path === "index.html" && file.encoding === "utf8") {
        // Serve-time LifemarkData injection: stored builds predate the SDK (and
        // Netlify/Vercel deploys inject at build time instead), so the hosted
        // data backend is wired here for every self-hosted app. Idempotent —
        // skips documents that already carry the SDK.
        const withData = injectLifemarkDataSdk(
          rewriteAssetPaths(file.content, `preview-by-slug/${slug}`),
          {
            slug,
            apiBase: process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? null,
          },
        );
        return buildFileResponse({ ...file, content: withData });
      }
      return buildFileResponse(file);
    }
    // A published project missing a requested asset is a genuine 404. Falling
    // through to the live-preview path here would answer a missing `.js` with
    // an HTML page and produce "Unexpected token '<'" in the console.
    return notFoundHtml();
  }

  // Not published yet: fall back to the editor preview behaviour (warm sandbox
  // redirect, or the "no build available" notice).
  return servePreviewHtml(project.id as string);
}

export const Route = createFileRoute("/preview-by-slug/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
      HEAD: async ({ request, params }) => handleGET(request, params),
    },
  },
});
