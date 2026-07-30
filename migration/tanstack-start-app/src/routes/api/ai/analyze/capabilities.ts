// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { analyzeUnavailableReason, isAnalyzeExecutionEnabled } from "@/lib/ai/analyze-runner";

/**
 * Native /api/ai/analyze/capabilities — whether analyze / binary file-gen
 * execution is available on this deploy. TRUE NATIVE (no worker).
 */
export const Route = createFileRoute("/api/ai/analyze/capabilities")({
  server: {
    handlers: {
      GET: async () => {
        const enabled = isAnalyzeExecutionEnabled();
        const engine = process.env.E2B_API_KEY
          ? "e2b"
          : process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET
            ? "modal"
            : process.env.ALLOW_UNSANDBOXED_ANALYZE === "true"
              ? "local"
              : null;
        return Response.json({
          analyzeEnabled: enabled,
          engine,
          reason: analyzeUnavailableReason(),
        });
      },
    },
  },
});
