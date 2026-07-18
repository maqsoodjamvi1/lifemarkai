/**
 * GET /api/sandbox/status
 *
 * Lightweight check — is a cloud sandbox provider configured (Modal/E2B)?
 * Lets the preview panel skip browser WebContainer boot when Lovable-style
 * cloud preview is available.
 */
import { NextResponse } from "next/server";
import { getSandboxProviderId, isSandboxEnabled } from "@/lib/sandbox";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    enabled: isSandboxEnabled(),
    provider: isSandboxEnabled() ? getSandboxProviderId() : null,
  });
}
