import { NextRequest, NextResponse } from "next/server";
import { verifyPreviewToken } from "@/lib/preview/preview-token";
import { servePreviewHtml } from "@/lib/preview/serve-preview";

/** 403 page shown when a required/invalid preview token blocks access. */
function forbidden(): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><body><p style="padding:2rem;font-family:system-ui">Preview access denied — invalid or expired token.</p></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // ── Signed-token gate ─────────────────────────────────────────────────────
  // A valid project-scoped token authorizes preview access. Enforced when
  // PREVIEW_REQUIRE_TOKEN=true (recommended in prod) OR whenever a token is
  // supplied. Without either, behaviour is unchanged (local/dev friendly).
  const token = req.nextUrl.searchParams.get("token");
  const required = process.env.PREVIEW_REQUIRE_TOKEN === "true";
  if (required || token) {
    if (!token) return forbidden();
    const claims = verifyPreviewToken(token);
    if (!claims || claims.project_id !== projectId) return forbidden();
  }

  return servePreviewHtml(projectId);
}
