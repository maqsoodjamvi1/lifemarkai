export type CreationFramework = "static" | "react" | "tanstack-start" | "next" | "vue" | "svelte";

const BUSINESS_SYSTEM = /\b(erp|enterprise resource planning|crm|customer relationship management|hrms|hris|pos|inventory management|warehouse management|accounting system|school management|hospital management|hotel management|admin dashboard|operations platform)\b/i;
const BACKEND_REQUIRED = /\b(auth(?:entication)?|user accounts?|roles?|permissions?|database|supabase|stripe|payments?|multi[- ]tenant|realtime|audit log|purchase orders?|invoices?|payroll)\b/i;

/**
 * MuseCode-parity routing: business systems (ERP/CRM/POS/admin) are built as
 * static hash-routed SPAs first — instant no-build preview, LifemarkData
 * persistence, zero engine cost. Only prompts that genuinely need a real
 * backend (auth, database, payments, realtime, multi-tenant) go straight to
 * the full-stack TanStack Start profile; everything else can upgrade later
 * via "upgrade to full-stack" (see isUpgradeToFullStackIntent below) once
 * Supabase provisioning is configured. Decided: keep static-first as the
 * default rather than routing all ERP/CRM prompts to TanStack Start up
 * front — the real fix for the "React error" crashes was the LifemarkData
 * SDK injection bug (fixed separately in lifemark-data.ts /
 * patch-sandbox-preview-files.ts / push-to-sandbox.ts), not the framework
 * choice itself.
 */
export function recommendedFrameworkForPrompt(prompt: string): CreationFramework {
  return BACKEND_REQUIRED.test(prompt) ? "tanstack-start" : "static";
}

/** True when a chat/build request needs a REAL backend a static app can't provide. */
export function promptNeedsRealBackend(prompt: string): boolean {
  return BACKEND_REQUIRED.test(prompt);
}

/** "upgrade to full-stack" — the user accepting the static→TanStack upgrade. */
const UPGRADE_INTENT =
  /\b(?:upgrade|convert|switch|migrate)\b[^.!?]{0,40}\b(?:full[- ]?stack|tanstack|real backend)\b|\bfull[- ]?stack version\b/i;

export function isUpgradeToFullStackIntent(message: string): boolean {
  return UPGRADE_INTENT.test(message);
}

/**
 * Appended to the static build prompt when the request needs a real backend.
 * A static app must never FAKE auth/payments/database — that is a security
 * lie users will ship. The model explains the upgrade instead.
 */
/** Real-backend upgrades are only offered when provisioning is configured. */
export function isCloudProvisioningConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_MANAGEMENT_TOKEN && process.env.SUPABASE_ORG_ID,
  );
}

/** Shown instead of converting when provisioning is not configured yet. */
export const UPGRADE_NOT_READY_GUARD = `

## Full-stack upgrade requested but not available yet
The platform's real-backend provisioning is not enabled in this environment.
Do NOT convert or fake anything. Tell the user briefly: full-stack upgrades
(real accounts, private database, payments) are coming soon; their app and
data are safe, and this project can be upgraded later without losing the
current design. Then complete any parts of their request that work statically.`;

export const STATIC_BACKEND_GUARD = `

## IMPORTANT — this request needs a real backend
This is a STATIC project. It cannot provide real authentication, secure
payments, a private database, roles/permissions, or realtime sync — and you
must NEVER fake them client-side (a JavaScript "login" is a security lie).
Do the parts of the request that ARE possible statically (UI, layout,
LifemarkData records), and for the backend parts tell the user, briefly and
clearly: this feature needs the full-stack version — reply "upgrade to
full-stack" and the project will be converted to TanStack Start with a real
backend, keeping the current design.`;

export function resolveCreationFramework(
  prompt: string,
  selected: CreationFramework,
  manuallySelected: boolean,
): CreationFramework {
  return manuallySelected ? selected : recommendedFrameworkForPrompt(prompt);
}
