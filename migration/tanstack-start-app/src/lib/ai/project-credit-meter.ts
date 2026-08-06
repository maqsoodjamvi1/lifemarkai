import { createAdminClient } from "../supabase/server.ts";

export class ProjectAiCreditLimitError extends Error {
  constructor() {
    super("AI credit limit reached for this project. Increase the limit in the AI Integration panel.");
    this.name = "ProjectAiCreditLimitError";
  }
}

/**
 * Atomically consumes a generated app's project-level AI allowance through the
 * service-role client. Calling this before provider work prevents concurrent or
 * anonymous requests from bypassing the configured project limit.
 */
export async function consumeProjectAiCredits(
  projectId: string,
  amount: number,
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Project AI credit cost must be a positive integer");
  }

  const admin = await createAdminClient();
  const { data, error } = await (admin as any).rpc("consume_project_ai_credits", {
    p_project_id: projectId,
    p_amount: amount,
  });
  if (error) throw new Error(error.message ?? "Unable to meter project AI usage");
  if (data == null) throw new ProjectAiCreditLimitError();

  const nextUsage = Number(data);
  if (!Number.isFinite(nextUsage)) throw new Error("Invalid project AI usage response");
  return nextUsage;
}
