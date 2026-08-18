export type SandboxProviderId = "docker" | "modal" | "e2b" | "vercel";

export interface SandboxProviderPolicyInput {
  /** Dedicated release-proof process; never permits a remote-provider fallback. */
  coreLoop: boolean;
  /** Operator preference outside the release-proof process. */
  requested?: string;
  dockerEnabled: boolean;
  modalEnabled: boolean;
  e2bEnabled: boolean;
  e2bAllowed: boolean;
  /** Phase 7: VERCEL_SANDBOX_ENABLED + credentials. Explicit request only — never an auto fallback. */
  vercelAllowed?: boolean;
}

/**
 * Selects compute without probing or mutating provider state.
 *
 * Docker is the only core-loop backend. Outside that lane an explicit operator
 * choice wins, then auto mode prefers the private Docker plane. Returning a
 * disabled provider is intentional: callers receive a precise configuration
 * error instead of silently proving a different infrastructure path.
 */
export function selectSandboxProvider(
  input: SandboxProviderPolicyInput,
): SandboxProviderId {
  const requested = input.requested?.trim().toLowerCase() || "auto";

  if (input.coreLoop) return "docker";
  if (requested === "docker") return "docker";
  if (requested === "modal") return "modal";
  if (requested === "e2b" && input.e2bAllowed) return "e2b";
  // Phase 7: benchmark lane. Only an explicit SANDBOX_PROVIDER=vercel selects
  // it, and only while the flag+credentials allow it; auto mode never falls
  // back here, and the core-loop return above keeps the release lane Docker.
  if (requested === "vercel" && input.vercelAllowed) return "vercel";

  if (input.dockerEnabled) return "docker";
  if (input.modalEnabled) return "modal";
  if (input.e2bAllowed && input.e2bEnabled) return "e2b";

  return "docker";
}
