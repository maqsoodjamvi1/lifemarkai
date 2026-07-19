import { NextResponse } from "next/server";

/** Whether unsandboxed analyze / binary file-gen is enabled on this deploy. */
export async function GET() {
  const enabled = process.env.ALLOW_UNSANDBOXED_ANALYZE === "true";
  return NextResponse.json({
    analyzeEnabled: enabled,
    reason: enabled
      ? null
      : "Data analysis and binary file generation need an isolated sandbox. Set ALLOW_UNSANDBOXED_ANALYZE=true only in trusted environments, or wait for the managed sandbox.",
  });
}
