/**
 * POST /api/editor-intelligence/initiative
 *
 * Runs LifemarkAI editor intelligence (lib/ai/editor-lenses/orchestrator.ts)
 * on a goal and STREAMS the run as SSE.
 * See full implementation on branch - restoring after bad push.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/editor-intelligence/initiative")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json(
          { error: "Initiative route temporarily unavailable - restore in progress" },
          { status: 503 },
        );
      },
    },
  },
});
