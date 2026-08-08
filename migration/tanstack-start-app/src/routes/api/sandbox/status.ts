/**
 * GET /api/sandbox/status
 *
 * Lightweight check — is Modal (Lovable-style) cloud preview configured?
 * When false, the editor shows "Modal preview required" (not WC/srcdoc).
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSandboxProviderId,isSandboxEnabled } from "@/lib/sandbox";


async function handleGET(_req: Request) {
  return Response.json({
    enabled: isSandboxEnabled(),
    provider: isSandboxEnabled() ? getSandboxProviderId() : null,
  });
}


export const Route = createFileRoute("/api/sandbox/status")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
    },
  },
});
