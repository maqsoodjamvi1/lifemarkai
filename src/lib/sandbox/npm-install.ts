/**
 * Sandbox `npm install` is a cold Docker Desktop fetch of hundreds of packages.
 * npm's default fetch idle timeout (~5 min) surfaces as EIDLETIMEOUT against
 * registry.npmjs.org and used to fail the core-loop preview on an otherwise
 * healthy host.
 */
export const NPM_INSTALL_FLAGS =
  "--no-audit --no-fund --prefer-offline --progress=false --loglevel=error";

export const NPM_INSTALL_MAX_ATTEMPTS = 3;

export function npmInstallEnvExports(): string {
  return [
    "export npm_config_fetch_retries=5",
    "export npm_config_fetch_retry_mintimeout=20000",
    "export npm_config_fetch_retry_maxtimeout=120000",
    "export npm_config_fetch_timeout=600000",
  ].join("; ");
}

export function npmInstallShell(timeoutSec: number): string {
  return `${npmInstallEnvExports()}; timeout ${timeoutSec} npm install ${NPM_INSTALL_FLAGS}; echo "LM_NPM_EXIT:$?"`;
}

export function parseNpmInstallExit(stdout: string, stderr: string): number {
  return Number(/LM_NPM_EXIT:(\d+)/.exec(`${stdout}${stderr}`)?.[1] ?? "0");
}

export function isTransientNpmInstallFailure(output: string, exitCode: number): boolean {
  if (exitCode === 0 || exitCode === 124) return false;
  return /EIDLETIMEOUT|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EPROTO|UND_ERR_|socket hang up|network socket disconnected|fetch failed|Idle timeout reached|process terminated|signal SIGTERM|signal SIGKILL/i.test(
    output,
  );
}
