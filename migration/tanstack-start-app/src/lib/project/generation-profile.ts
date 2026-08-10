export type CreationFramework = "static" | "react" | "tanstack-start" | "next" | "vue" | "svelte";

const BUSINESS_SYSTEM = /\b(erp|enterprise resource planning|crm|customer relationship management|hrms|hris|pos|inventory management|warehouse management|accounting system|school management|hospital management|hotel management|admin dashboard|operations platform)\b/i;
const BACKEND_REQUIRED = /\b(auth(?:entication)?|user accounts?|roles?|permissions?|database|supabase|stripe|payments?|multi[- ]tenant|realtime|audit log|purchase orders?|invoices?|payroll)\b/i;

/** Keep simple sites static; route stateful business systems to the full-stack profile. */
export function recommendedFrameworkForPrompt(prompt: string): CreationFramework {
  return BUSINESS_SYSTEM.test(prompt) || BACKEND_REQUIRED.test(prompt) ? "tanstack-start" : "static";
}

export function resolveCreationFramework(
  prompt: string,
  selected: CreationFramework,
  manuallySelected: boolean,
): CreationFramework {
  return manuallySelected ? selected : recommendedFrameworkForPrompt(prompt);
}
