/**
 * Structured observability events — Phase 1 of the Vercel adoption plan.
 *
 * `recordEvent(name, fields)` is the ONE way server code emits an analytics-
 * grade event. It stamps the correlation ids from Phase 0 onto every event, so
 * a failed build can be reassembled from four process boundaries with one grep
 * on its buildRunId, and it enforces the Phase 1 acceptance criterion that no
 * prompts, generated code, secrets, or access tokens ever appear in a log:
 * field names are checked against a denylist and long strings are truncated —
 * a caller cannot accidentally log a prompt by passing the wrong object.
 *
 * Emission is gated on the `vercelObservability` flag; flipping
 * VERCEL_OBSERVABILITY_ENABLED=false stops all event output with no other
 * behaviour change (the rollback promise in docs/vercel-phase0-baseline.md).
 * The function is fire-and-forget and MUST never throw: observability that can
 * break generation is worse than no observability.
 */
import { logger } from "../logger.ts";
import { isFeatureEnabled } from "../config/features.ts";
import { correlationFields } from "./correlation.ts";

export type ObservabilityEvent =
  // AI
  | "ai_generation_completed"
  | "ai_generation_failed"
  // Build pipeline
  | "build_verification_completed"
  | "build_repair_round"
  // Sandbox
  | "sandbox_boot_completed"
  | "sandbox_boot_failed"
  | "sandbox_reconnected"
  // Deploy
  | "deployment_completed"
  | "deployment_failed"
  // Billing
  | "stripe_webhook_received"
  | "stripe_webhook_rejected"
  | "paddle_webhook_received"
  | "paddle_webhook_rejected"
  | "credits_finalized"
  // External deps
  | "external_call_completed";

/**
 * Field names that must never reach a log line, whatever their value.
 * Substring match, case-insensitive: catches promptText, user_prompt,
 * fileContent, accessToken, SUPABASE_SERVICE_KEY and friends.
 */
const BLOCKED_FIELD_FRAGMENTS = [
  "prompt",
  "message",
  "content",
  "code",
  "secret",
  "token",
  "password",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "jwt",
  "bearer",
  "email",
] as const;

/** Numeric counters that legitimately contain a blocked fragment. */
const ALLOWED_EXACT = new Set([
  "inputtokens",
  "outputtokens",
  "tokensused",
  "timetofirsttokenms",
  "messagecount",
  "codefilecount",
]);

const MAX_STRING = 256;

function isBlockedField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  if (ALLOWED_EXACT.has(normalized)) return false;
  return BLOCKED_FIELD_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/** Drop blocked fields, flatten non-primitives, truncate long strings. */
export function sanitizeEventFields(
  fields: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isBlockedField(key)) continue;
    if (value === undefined) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    } else if (value instanceof Error) {
      out[key] = value.message.slice(0, MAX_STRING);
    }
    // Objects/arrays are dropped rather than serialized: a nested object is
    // exactly how a prompt or file payload would sneak past a field-name check.
  }
  return out;
}

/**
 * Emit one structured event. Never throws; no-op when the flag is off.
 * Every event carries the Phase 0 correlation ids automatically.
 */
export function recordEvent(event: ObservabilityEvent, fields: Record<string, unknown> = {}): void {
  try {
    if (!isFeatureEnabled("vercelObservability", correlationIdentity())) return;
    logger.info(event, { ...correlationFields(), ...sanitizeEventFields(fields) });
  } catch {
    /* observability must never break the caller */
  }
}

function correlationIdentity(): { userId?: string; projectId?: string } {
  const ctx = correlationFields();
  return { userId: ctx.userId, projectId: ctx.projectId };
}

/**
 * Time an external dependency call (Supabase Management API, Stripe, registrar…)
 * and emit `external_call_completed` with its outcome. Returns the callback's
 * result unchanged; rethrows its error after recording it.
 */
export async function timeExternalCall<T>(
  dependency: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    recordEvent("external_call_completed", {
      dependency,
      operation,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return result;
  } catch (err) {
    recordEvent("external_call_completed", {
      dependency,
      operation,
      durationMs: Date.now() - startedAt,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
