import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getOrRefreshGatewayToken } from "@/lib/oauth/gateway-tokens";
import { getUserSupabaseProjectKeys, userSupabaseProjectUrl } from "@/lib/cloud/user-supabase";
import { upsertEnvVar } from "@/lib/server-fns/env";
import { z } from "zod";
import { parseBody } from "@/lib/api/parse-body";

/**
 * Native /api/supabase-connect/link — links one of the signed-in user's own
 * Supabase projects (picked from GET /api/supabase-connect/projects) to a
 * Lifemark project, by writing its URL + anon key + service key into that
 * project's own env vars — the same NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY names every
 * other part of the app already reads (schema-panel, the generated app's
 * own Supabase client, etc.), so a linked project behaves exactly like a
 * manually-pasted one — no separate code path to keep in sync.
 *
 * This does not run any migrations against the linked project. A user
 * linking an existing project brings its own schema; auto-applying this
 * app's own migration set against someone else's live database without
 * being asked is exactly the kind of surprising, hard-to-undo action this
 * route intentionally does not take.
 */
export const Route = createFileRoute("/api/supabase-connect/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = await parseBody(request, z.object({
          projectId: z.string().min(1),
          ref: z.string().min(1),
        }));
        if (parsed instanceof Response) return parsed;
        const { projectId, ref } = parsed as { projectId: string; ref: string };

        const token = await getOrRefreshGatewayToken(supabase, user.id, "supabase");
        if (!token) {
          return Response.json({ error: "Not connected. Connect your Supabase account first." }, { status: 403 });
        }

        const keys = await getUserSupabaseProjectKeys(token, ref);
        if (!keys.ok || !keys.anonKey || !keys.serviceKey) {
          return Response.json({ error: keys.error ?? "Couldn't fetch API keys for that project" }, { status: 502 });
        }

        const writes = await Promise.all([
          upsertEnvVar({ projectId, key: "NEXT_PUBLIC_SUPABASE_URL", value: userSupabaseProjectUrl(ref) }),
          upsertEnvVar({ projectId, key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: keys.anonKey }),
          upsertEnvVar({ projectId, key: "SUPABASE_SERVICE_ROLE_KEY", value: keys.serviceKey }),
        ]);

        const failed = writes.filter((w) => w.status !== "ok");
        if (failed.length > 0) {
          const unauthorized = writes.some((w) => w.status === "unauthorized" || w.status === "not_found");
          return Response.json(
            { error: unauthorized ? "You don't have access to write env vars on this project" : "Failed to save one or more keys" },
            { status: unauthorized ? 403 : 500 },
          );
        }

        return Response.json({ ok: true, url: userSupabaseProjectUrl(ref) });
      },
    },
  },
});
