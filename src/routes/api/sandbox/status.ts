/**
 * GET /api/sandbox/status
 *
 * Lightweight check — is the live Docker/Modal sandbox engine configured
 * and reachable? When false, the editor shows setup, not a fake preview.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSandboxProviderId,isSandboxEnabled } from "@/lib/sandbox";
import { getDockerSandboxRuntimeInfo, isDockerDaemonReachable } from "@/lib/sandbox/docker";
import { dockerDaemonUnreachableHint } from "@/lib/sandbox/docker-endpoint";
import { getPreviewSloSnapshot } from "@/lib/preview/preview-slo";


async function handleGET(_req: Request) {
  const configured = isSandboxEnabled();
  const provider = configured ? getSandboxProviderId() : null;
  const runtime = provider === "docker" ? getDockerSandboxRuntimeInfo() : null;
  const reachable = provider === "docker" ? await isDockerDaemonReachable() : configured;
  const hint =
    provider === "docker"
      ? dockerDaemonUnreachableHint({
          configured,
          reachable,
          hostKind: runtime?.hostKind ?? "local",
        })
      : null;

  return Response.json({
    enabled: provider === "docker" ? reachable : configured,
    provider,
    configured,
    reachable,
    host: runtime?.hostKind ?? null,
    memoryMb: runtime?.memoryMb ?? null,
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
