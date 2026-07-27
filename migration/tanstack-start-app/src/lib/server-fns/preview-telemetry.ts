/**
 * Native preview console/network telemetry buffer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { assertChatAccess } from "@/lib/project/chat-access";
import {
  appendPreviewConsole,
  appendPreviewNetwork,
  getPreviewTelemetry,
  loadPreviewTelemetryFromDb,
  persistPreviewTelemetry,
} from "@/lib/preview/preview-telemetry";

export const getPreviewTelemetryFn = createServerFn({ method: "GET" })
  .validator(zodValidator(z.object({ projectId: z.string().uuid() })))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "read");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    await loadPreviewTelemetryFromDb(supabase, data.projectId).catch(() => {});
    return { status: "ok" as const, telemetry: getPreviewTelemetry(data.projectId) };
  });

export const postPreviewTelemetry = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        console: z
          .array(z.object({ type: z.string().optional(), text: z.string() }))
          .optional(),
        network: z
          .array(
            z.object({
              method: z.string().optional(),
              url: z.string(),
              status: z.number().optional(),
              ok: z.boolean().optional(),
              durationMs: z.number().optional(),
              contentType: z.string().optional(),
              error: z.string().optional(),
            }),
          )
          .optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    await loadPreviewTelemetryFromDb(supabase, data.projectId).catch(() => {});

    if (Array.isArray(data.console) && data.console.length > 0) {
      appendPreviewConsole(data.projectId, data.console.slice(-40));
    }
    if (Array.isArray(data.network) && data.network.length > 0) {
      appendPreviewNetwork(data.projectId, data.network.slice(-40));
    }

    void persistPreviewTelemetry(supabase, data.projectId).catch(() => {});

    return { status: "ok" as const, ok: true };
  });
