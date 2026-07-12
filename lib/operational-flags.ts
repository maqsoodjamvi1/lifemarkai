/** Emergency server-side kill switch for provider-backed AI endpoints. */
export function isAiMaintenanceMode(): boolean {
  return process.env.AI_MAINTENANCE_MODE?.trim().toLowerCase() === "true";
}

/** Emergency server-side kill switch for creating managed Cloud projects. */
export function isCloudProvisioningDisabled(): boolean {
  return process.env.CLOUD_PROVISIONING_DISABLED?.trim().toLowerCase() === "true";
}

export function isProviderBackedApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/ai/")) return true;
  if (pathname.startsWith("/api/editor-intelligence/")) return true;
  if (pathname === "/api/account/generate-workspace-knowledge") return true;
  if (pathname === "/api/projects/snapshots/compare") return true;
  return /^\/api\/projects\/[^/]+\/(?:ai-proxy|image-proxy|browser-test|preview-verify|generate-knowledge|summarise)$/.test(
    pathname,
  );
}
