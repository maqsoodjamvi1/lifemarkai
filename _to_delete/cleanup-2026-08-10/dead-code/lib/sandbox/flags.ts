/**
 * Lightweight sandbox flags — no Modal/E2B SDK imports.
 * Safe for TanStack Start route-tree boot (avoids Vite SSR OOM).
 */

export type SandboxProviderId = "modal" | "e2b" | "docker" | "firecracker";

function isE2bAllowed(): boolean {
  const pref = (process.env.SANDBOX_PROVIDER ?? "").toLowerCase();
  if (pref === "e2b") return true;
  const flag = process.env.ENABLE_E2B_SANDBOX;
  return flag === "1" || flag === "true";
}

export function getSandboxProviderId(): SandboxProviderId {
  const pref = (process.env.SANDBOX_PROVIDER ?? "auto").toLowerCase();
  if (pref === "e2b" && isE2bAllowed()) return "e2b";
  return "modal";
}

/** True when Modal (or explicit E2B) credentials look present. */
export function isSandboxEnabled(): boolean {
  const id = getSandboxProviderId();
  if (id === "e2b") {
    return Boolean(process.env.E2B_API_KEY) && isE2bAllowed();
  }
  return Boolean(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET);
}
