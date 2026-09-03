/**
 * Short-circuit getUser() when Supabase Auth is down.
 *
 * Every authenticated route waits on getUser(). A 10s timeout on ENOTFOUND
 * made the editor, preview reconnect, and keep-alive all hang together — the
 * demo-day failure mode. Once two network/timeout failures land, skip the
 * round trip for 30s and use the cookie session (same fail-open as today).
 */

export const AUTH_CIRCUIT = {
  /** Cookie already present — don't wait the full verify budget. */
  fastTimeoutMs: 1_500,
  /** No session: still give getUser a real chance (login / first hit). */
  verifyTimeoutMs: 10_000,
  openAfter: 2,
  openForMs: 30_000,
} as const;

let failures = 0;
let openUntil = 0;
let openLogged = false;

export function resetAuthCircuitForTests() {
  failures = 0;
  openUntil = 0;
  openLogged = false;
}

export function getUserTimeoutMs(hasSession: boolean): number {
  return hasSession ? AUTH_CIRCUIT.fastTimeoutMs : AUTH_CIRCUIT.verifyTimeoutMs;
}

export function isAuthCircuitOpen(now = Date.now()): boolean {
  return now < openUntil;
}

export function shouldLogCircuitOpen(): boolean {
  if (openLogged) return false;
  openLogged = true;
  return true;
}

export function noteGetUserSuccess() {
  failures = 0;
  openUntil = 0;
  openLogged = false;
}

export function noteGetUserFailure(now = Date.now()): boolean {
  failures += 1;
  if (failures < AUTH_CIRCUIT.openAfter) return false;
  openUntil = now + AUTH_CIRCUIT.openForMs;
  return true;
}

export function isNetworkishAuthError(message: string): boolean {
  return /timeout|fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network|abort|getaddrinfo/i.test(
    message,
  );
}
