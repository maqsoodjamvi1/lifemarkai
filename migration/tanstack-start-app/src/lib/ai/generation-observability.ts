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
  // supabase-js's PostgrestBuilder (what .rpc() returns) is only a thenable —
  // it implements .then() but NOT .catch()/.finally(). Chaining .catch()
  // directly on it throws "supabase.rpc(...).catch is not a function" at
  // runtime, which surfaced as a live "AI request failed" toast on every
  // regenerate/build once the mode-downgrade bug above stopped masking it
  // (a chat-mode no-op never reached this code path). try/catch around a
  // plain await is the correct way to swallow errors from a thenable.
  try {
    await supabase.rpc("record_generation_verification", {
      target_project_id: projectId,
      target_template_key: template.key,
      target_template_version: template.version,
      target_repair_rounds: verification.rounds,
      verification_passed: verification.passed,
      target_failure_stage: verification.passed ? null : failureStage,
    });
  } catch {
    // best-effort observability write; never fail the generation over it
  }
}
