/**
 * Where the Docker Engine API socket lives.
 *
 * Linux/macOS: `/var/run/docker.sock`.
 * Windows Docker Desktop: named pipes. Current Desktop uses
 * `dockerDesktopLinuxEngine`; older installs used `docker_engine`.
 *
 * `fs.existsSync` is always false for `\\.\pipe\*` on Windows even when the
 * pipe is live. List `\\.\pipe\` instead, and never open a missing pipe
 * (that hang ignores HTTP timeouts).
 */
import { existsSync, readdirSync } from "node:fs";

export const WINDOWS_DOCKER_PIPES = [
  "\\\\.\\pipe\\dockerDesktopLinuxEngine",
  "\\\\.\\pipe\\docker_engine",
] as const;

const WIN_PIPE_PREFIX = /^(?:\\\\\.\\pipe\\|\/\/\.\/pipe\/)/i;

export function isWindowsNamedPipe(path: string): boolean {
  return WIN_PIPE_PREFIX.test(path);
}

export function windowsPipeName(path: string): string {
  return path.replace(WIN_PIPE_PREFIX, "");
}

export function listWindowsNamedPipes(
  readDir: (path: string) => string[] = (p) => readdirSync(p),
): string[] {
  try {
    return readDir("\\\\.\\pipe\\");
  } catch {
    return [];
  }
}

export function dockerSocketIsPresent(
  socketPath: string,
  exists: (path: string) => boolean = defaultSocketExists,
): boolean {
  try {
    return exists(socketPath);
  } catch {
    return false;
  }
}

export function defaultSocketExists(path: string): boolean {
  if (isWindowsNamedPipe(path)) {
    const listed = listWindowsNamedPipes();
    if (listed.length === 0) {
      // Listing failed or Desktop is down. Don't open a missing pipe.
      return false;
    }
    return listed.includes(windowsPipeName(path));
  }
  return existsSync(path);
}

export function resolveDockerSocketPath(opts?: {
  platform?: NodeJS.Platform;
  envSocket?: string | undefined;
  exists?: (path: string) => boolean;
}): string {
  const platform = opts?.platform ?? process.platform;
  const envSocket = (opts?.envSocket ?? process.env.DOCKER_SOCKET ?? "").trim();
  const exists = opts?.exists ?? defaultSocketExists;

  if (platform !== "win32") {
    return envSocket || "/var/run/docker.sock";
  }

  const candidates = [envSocket, ...WINDOWS_DOCKER_PIPES].filter((p): p is string => Boolean(p));
  for (const path of candidates) {
    if (exists(path)) return path;
  }
  return envSocket || WINDOWS_DOCKER_PIPES[0];
}
