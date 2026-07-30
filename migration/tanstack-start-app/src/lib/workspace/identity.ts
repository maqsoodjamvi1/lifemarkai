import { createHash, randomBytes } from "crypto";

export interface WorkspaceSsoConfig {
  id: string;
  displayName: string;
  protocol: "oidc" | "saml";
  providerName: string;
  tenantId: string;
  issuerUrl?: string;
  signOnUrl?: string;
  clientId?: string;
  clientSecret?: string;
  entityId?: string;
  certificate?: string;
  metadataUrl?: string;
  status: "active" | "pending";
  lastTestResult?: "success" | "failed";
  lastTestedAt?: string;
}

export interface WorkspaceScimGroupMapping {
  id: string;
  groupName: string;
  role: "viewer" | "editor" | "admin";
}

export interface WorkspaceScimConfig {
  enabled: boolean;
  welcomeEmail: boolean;
  groupMappings: WorkspaceScimGroupMapping[];
  lastRotatedAt?: string;
}

export interface WorkspaceEnforceSettings {
  enforceSso: boolean;
  ssoSessionDuration: string;
  jitEnabled: boolean;
  jitDefaultRole: string;
}

export function hashScimApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateScimApiKey(): string {
  return `lmai_${randomBytes(24).toString("hex")}`;
}

/** Strip secrets before sending SSO config to the client. */
export function redactSsoForClient(sso: WorkspaceSsoConfig | null): WorkspaceSsoConfig | null {
  if (!sso) return null;
  const { clientSecret: _cs, certificate: _cert, ...rest } = sso;
  return {
    ...rest,
    ...(sso.clientSecret ? { clientSecret: "••••••••" } : {}),
    ...(sso.certificate ? { certificate: "••••••••" } : {}),
  };
}

/** Resolve SCIM role from group mappings (highest privilege wins). */
export function resolveScimRole(
  groups: string[],
  mappings: WorkspaceScimGroupMapping[],
): "viewer" | "editor" | "admin" {
  const rank = { viewer: 0, editor: 1, admin: 2 } as const;
  let best: "viewer" | "editor" | "admin" = "editor";
  for (const g of groups) {
    const m = mappings.find(
      (x) => x.groupName.toLowerCase() === g.toLowerCase(),
    );
    if (m && rank[m.role] > rank[best]) best = m.role;
  }
  return best;
}
