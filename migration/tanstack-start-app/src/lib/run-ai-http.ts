/**
 * Shared AI HTTP runner for Start (auth gate + ALS + runtime dynamic import).
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { applySetCookies, runWithRequestContext } from "@/lib/request-als";

export type AiHttpName = "chat" | "agent" | "fix";

const HANDLER_EXPORT: Record<AiHttpName, string> = {
  chat: "handleAiChat",
  agent: "handleAiAgent",
  fix: "handleAiFix",
};

/**
 * Fast Start-cookie auth, then dynamic import of lib/ai/http/* (never app/api).
 */
export async function runAiHttp(
  name: AiHttpName,
  request: Request,
): Promise<Response> {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { result, pendingSetCookies } = await runWithRequestContext(
    request,
    async () => {
      const href = pathToFileURL(
        path.resolve(process.cwd(), `../../lib/ai/http/${name}.ts`),
      ).href;
      const mod = (await import(/* @vite-ignore */ href)) as Record<
        string,
        (req: Request) => Promise<Response>
      >;
      const handler = mod[HANDLER_EXPORT[name]];
      if (typeof handler !== "function") {
        return Response.json(
          { error: `AI handler missing: ${HANDLER_EXPORT[name]}` },
          { status: 500 },
        );
      }
      return handler(request);
    },
  );

  return applySetCookies(result, pendingSetCookies);
}
