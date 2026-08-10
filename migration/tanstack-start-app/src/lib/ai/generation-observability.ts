import type { ControlledTemplate } from "../templates/controlled-registry.ts";
import type { SelfVerifyResult } from "./http/result-types.ts";

export async function recordGenerationVerification(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> },
  projectId: string,
  template: ControlledTemplate,
  verification: SelfVerifyResult | null,
  failureStage = "verification",
): Promise<void> {
  if (!verification) return;
  await supabase.rpc("record_generation_verification", {
    target_project_id: projectId,
    target_template_key: template.key,
    target_template_version: template.version,
    target_repair_rounds: verification.rounds,
    verification_passed: verification.passed,
    target_failure_stage: verification.passed ? null : failureStage,
  }).catch(() => undefined);
}
