/**
 * GET /api/sandbox/status
 *
 * Lightweight check — is Modal (Lovable-style) cloud preview configured?
 * When false, the editor shows "Modal preview required" (not WC/srcdoc).
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
