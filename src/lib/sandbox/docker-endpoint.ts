/**
 * Which Docker daemon runs live previews, and how much RAM each sandbox gets.
 *
 * Production app stays on Hostinger. Dedicated preview capacity lives on a
 * second host (Oracle Always Free). `SANDBOX_DOCKER_HOST` selects that remote
 * daemon and MUST NOT fall back to the app host — a 2 GB sandbox on Hostinger
 * is what starved Coolify last time. Unreachable remote → instant preview,
 * not a local spawn.
 *
 * Never expose the Docker API on a public address. Tunnel it to localhost
 * on the app host (`SANDBOX_DOCKER_HOST=http://172.17.0.1:2375`).
 */

export type DockerSandboxHostKind = "remote" | "local";

export type DockerSandboxEndpoint = {
  kind: DockerSandboxHostKind;
  /** Empty string means unix socket / named pipe on this machine. */
  tcpHost: string;
  memoryMb: number;
  cpus: number;
};

function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveDockerSandboxEndpoint(
  env: Record<string, string | undefined> = process.env,
): DockerSandboxEndpoint {
  const remoteHost = (env.SANDBOX_DOCKER_HOST || "").trim();
  const cpus = positiveNumber(env.SANDBOX_CPUS, 1);
  if (remoteHost) {
    return {
      kind: "remote",
      tcpHost: remoteHost,
      memoryMb: positiveNumber(env.SANDBOX_REMOTE_MEMORY_MB, 2048),
      cpus,
    };
  }
  return {
    kind: "local",
    tcpHost: (env.DOCKER_HOST || "").trim(),
    memoryMb: positiveNumber(env.SANDBOX_MEMORY_MB, 1024),
    cpus,
  };
}

export function dockerDaemonUnreachableHint(opts: {
  configured: boolean;
  reachable: boolean;
  hostKind: DockerSandboxHostKind;
  platform?: NodeJS.Platform;
}): string | null {
  if (!opts.configured || opts.reachable) return null;
  if (opts.hostKind === "remote") {
    return (
      "The dedicated preview host (SANDBOX_DOCKER_HOST) is not reachable. " +
      "Instant preview stays up; this app server will not run 2 GB sandboxes."
    );
  }
  if ((opts.platform ?? process.platform) === "win32") {
    return "Docker Desktop is not running. Start it, and live preview will boot on its own.";
  }
  return "Docker is configured but the daemon is not reachable. On Coolify, mount /var/run/docker.sock into this app.";
}
