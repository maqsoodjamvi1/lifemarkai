/**
 * Type-check a project in whatever sandbox is currently running for it.
 *
 * The provider method does the work; this resolves which container to point it
 * at and makes the whole thing unable to fail loudly. Every caller is a repair
 * path, and a repair must never break because the compiler was unavailable —
 * an absent sandbox, a provider without the capability, or a project with no
 * TypeScript all mean "no signal", not "error".
 *
 * `null` is deliberately distinct from an empty diagnostic list. Empty means
 * the compiler ran and found nothing; null means nothing ran. Reading the
 * second as the first would let a repair loop conclude it had fixed everything
 * because it never checked.
 */
import { getSandboxProvider, isSandboxEnabled } from "@/lib/sandbox";
import type { TypecheckResult } from "@/lib/sandbox";

/** How long to let a debounced sandbox push land before checking what it wrote. */
export const SANDBOX_PUSH_SETTLE_MS = 1_800;

type MinimalClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        maybeSingle: () => Promise<{ data: { metadata?: Record<string, unknown> } | null }>;
      };
    };
  };
};

export async function typecheckRunningSandbox(
  supabase: unknown,
  projectId: string,
  opts: { timeoutSec?: number } = {},
): Promise<TypecheckResult | null> {
  try {
    if (!isSandboxEnabled()) return null;
    if (process.env.DISABLE_SANDBOX_TYPECHECK === "true") return null;

    const sb = supabase as MinimalClient;
    const { data } = await sb
      .from("projects")
      .select("metadata")
      .eq("id", projectId)
      .maybeSingle();

    const meta = (data?.metadata ?? {}) as { sandbox_id?: string | null };
    const sandboxId = typeof meta.sandbox_id === "string" ? meta.sandbox_id : "";
    if (!sandboxId) return null;

    const provider = getSandboxProvider();
    if (typeof provider.typecheckProject !== "function") return null;

    const result = await provider.typecheckProject(sandboxId, opts);
    // A check that ran out of time saw only part of the project, so its
    // diagnostic set is not a set — treating it as one would let a repair look
    // like it "resolved" every failure the timeout happened to cut off.
    if (result.timedOut) return null;
    return result.available ? result : null;
  } catch {
    return null; // no signal is a valid answer; a thrown error is not
  }
}
