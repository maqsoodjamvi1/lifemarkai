/**
 * GET /api/sandbox/status
 *
 * Lightweight check — is Modal (Lovable-style) cloud preview configured?
 * When false, the editor shows "Modal preview required" (not WC/srcdoc).
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSandboxProviderId,isSandboxEnabled } from "@/lib/sandbox";
import { isDockerDaemonReachable } from "@/lib/sandbox/docker";


async function handleGET(_req: Request) {
  const configured = isSandboxEnabled();
  const provider = configured ? getSandboxProviderId() : null;
  const reachable = provider === "docker" ? await isDockerDaemonReachable() : configured;

  return Response.json({
    enabled: provider === "docker" ? reachable : configured,
    provider,
    configured,
    reachable,
  });
}


export const Route = createFileRoute("/api/sandbox/status")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
    },
  },
});
