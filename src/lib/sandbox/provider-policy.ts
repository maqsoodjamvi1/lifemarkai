export type SandboxProviderId = "docker" | "modal" | "e2b";

export interface SandboxProviderPolicyInput {
  /** Dedicated release-proof process; never permits a remote-provider fallback. */
  coreLoop: boolean;
  /** Operator preference outside the release-proof process. */
  requested?: string;
  dockerEnabled: boolean;
  modalEnabled: boolean;
  e2bEnabled: boolean;
  e2bAllowed: boolean;
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

  if (input.dockerEnabled) return "docker";
  if (input.modalEnabled) return "modal";
  if (input.e2bAllowed && input.e2bEnabled) return "e2b";

  return "docker";
}
