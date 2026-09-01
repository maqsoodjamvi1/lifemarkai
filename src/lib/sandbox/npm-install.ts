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

/**
 * Returned by parseNpmInstallExit when the LM_NPM_EXIT marker never appears
 * in the captured output at all — the shell's own trailing
 * `echo "LM_NPM_EXIT:$?"` never ran, which means npm's actual exit status is
 * unknown, not zero. The echo is a plain `;`-sequenced statement after the
 * install command, so it always runs once that command returns control —
 * the only way it is missing is that the whole exec was torn down before
 * getting there: a container OOM-kill, the daemon restarting mid-install, a
 * killed process group. Deliberately not 0 (success, which this can never
 * legitimately be) and not 124 (the gate's own wall-clock timeout code), so
 * a caller can't mistake "we never heard back" for either of those.
 */
export const NPM_INSTALL_EXIT_UNKNOWN = -1;

export function parseNpmInstallExit(stdout: string, stderr: string): number {
  // Previously defaulted to "0" (success) when the marker was missing, which
  // told installNpmDependencies() the install had succeeded when it is
  // exactly the case where npm's actual outcome was never observed — most
  // reachable via a container OOM-kill during install, which silently made
  // the pipeline proceed with an app that has no node_modules.
  const m = /LM_NPM_EXIT:(\d+)/.exec(`${stdout}${stderr}`);
  return m ? Number(m[1]) : NPM_INSTALL_EXIT_UNKNOWN;
}

export function isTransientNpmInstallFailure(output: string, exitCode: number): boolean {
  if (exitCode === 0 || exitCode === 124) return false;
  return /EIDLETIMEOUT|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EPROTO|UND_ERR_|socket hang up|network socket disconnected|fetch failed|Idle timeout reached|process terminated|signal SIGTERM|signal SIGKILL/i.test(
    output,
  );
}
