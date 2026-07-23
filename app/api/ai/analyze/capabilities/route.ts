import { NextResponse } from "next/server";
import {
  analyzeUnavailableReason,
  isAnalyzeExecutionEnabled,
} from "@/lib/ai/analyze-runner";

/** Whether analyze / binary file-gen execution is available on this deploy. */
export async function GET() {
  const enabled = isAnalyzeExecutionEnabled();
  const engine = process.env.E2B_API_KEY
    ? "e2b"
    : process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET
      ? "modal"
      : process.env.ALLOW_UNSANDBOXED_ANALYZE === "true"
        ? "local"
        : null;
  return NextResponse.json({
    analyzeEnabled: enabled,
    engine,
    reason: analyzeUnavailableReason(),
  });
}
