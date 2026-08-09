import type { SupabaseClient } from "@supabase/supabase-js";
import { validateApiKey } from "../../api/api-key.ts";
import { rateLimitAsync, RATE_LIMITS } from "../../rate-limit.ts";
import { createClientFromRequest } from "../../supabase/request-client.ts";
import { createAdminClient } from "../../supabase/server.ts";
import { getServerUser } from "../../supabase/server-user.ts";

export type ChatRequestContextResult =
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; response: Response };

/** Authenticates and rate-limits a chat request before orchestration begins. */
export async function resolveChatRequestContext(req: Request): Promise<ChatRequestContextResult> {
  const apiKeyHeader = req.headers.get("x-lifemark-api-key");
  let userId: string;

  if (apiKeyHeader) {
    const result = await validateApiKey(apiKeyHeader);
    if (!result) {
      return { ok: false, response: Response.json({ error: "Invalid or expired API key" }, { status: 401 }) };
    }
    if (!result.scopes.includes("ai:chat")) {
      return { ok: false, response: Response.json({ error: "API key missing ai:chat scope" }, { status: 403 }) };
    }
    userId = result.userId;
  } else {
    const sessionClient = createClientFromRequest(req);
    const { user } = await getServerUser(sessionClient);
    if (!user) {
      return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    userId = user.id;
  }

  const rateLimit = await rateLimitAsync(userId, RATE_LIMITS.ai);
  if (!rateLimit.success) {
    return {
      ok: false,
      response: Response.json(
        { error: "Rate limit exceeded. Please wait before sending another message." },
        { status: 429, headers: { "X-RateLimit-Reset": String(rateLimit.resetAt) } },
      ),
    };
  }

  const supabase = apiKeyHeader ? await createAdminClient() : createClientFromRequest(req);
  return { ok: true, userId, supabase };
}
