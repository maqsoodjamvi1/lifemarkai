/**
 * GET /api/sandbox/status
 *
 * Lightweight check — is the live Docker/Modal sandbox engine configured
 * and reachable? When false, the editor shows setup, not a fake preview.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSandboxProviderId,isSandboxEnabled } from "@/lib/sandbox";
import { isDockerDaemonReachable } from "@/lib/sandbox/docker";
import { getPreviewSloSnapshot } from "@/lib/preview/preview-slo";


async function handleGET(_req: Request) {
  const configured = isSandboxEnabled();
  const provider = configured ? getSandboxProviderId() : null;
  const reachable = provider === "docker" ? await isDockerDaemonReachable() : configured;
  const hint =
    provider === "docker" && configured && !reachable
      ? process.platform === "win32"
        ? "Docker Desktop is not running. Start it, and live preview will boot on its own."
        : "Docker is configured but the daemon is not reachable. On Coolify, mount /var/run/docker.sock into this app."
      : null;

  return Response.json({
    enabled: provider === "docker" ? reachable : configured,
    provider,
    configured,
    reachable,
    hint,
    slo: getPreviewSloSnapshot(),
  });
}


export const Route = createFileRoute("/api/sandbox/status")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
    },
  },
});
