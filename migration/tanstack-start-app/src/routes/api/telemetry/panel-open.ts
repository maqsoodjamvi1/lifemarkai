/**
 * Panel-usage telemetry (recommendation step 3): one row per panel open, so
 * pruning decisions can be made from real usage data instead of guesses.
 * Fire-and-forget from the editor; failures are invisible to users.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const Route = createFileRoute("/api/telemetry/panel-open")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ ok: true }); // silently ignore anonymous

        const limit = rateLimit(`panel-open:${user.id}`, RATE_LIMITS.api);
        if (!limit.success) return Response.json({ ok: true });

        const parsed = await parseBody(
          request,
          z.object({
            panel: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/i),
            projectId: z.string().uuid().nullish(),
          }),
        );
        if (parsed instanceof Response) return parsed;

        const admin = createAdminClient();
        await admin.from("panel_opens").insert({
          user_id: user.id,
          project_id: parsed.projectId ?? null,
          panel: parsed.panel.toLowerCase(),
        } as never);

        return Response.json({ ok: true });
      },
    },
  },
});
