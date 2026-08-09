/**
 * Native preview console/network telemetry buffer.
 * Plain helpers — not createServerFn (see project-files.ts).
 */
import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import { assertChatAccess } from "../project/chat-access.ts";
import {
appendPreviewConsole,
appendPreviewNetwork,
getPreviewTelemetry,
loadPreviewTelemetryFromDb,
persistPreviewTelemetry,
} from "@/lib/preview/preview-telemetry";

export async function getPreviewTelemetryFn(input: { projectId: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "read");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  await loadPreviewTelemetryFromDb(supabase, input.projectId).catch(() => {});
  return { status: "ok" as const, telemetry: getPreviewTelemetry(input.projectId) };
}

export async function postPreviewTelemetry(input: {
  projectId: string;
  console?: Array<{ type?: string; text: string }>;
  network?: Array<{
    method?: string;
    url: string;
    status?: number;
    ok?: boolean;
    durationMs?: number;
    contentType?: string;
    error?: string;
  }>;
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "write");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  await loadPreviewTelemetryFromDb(supabase, input.projectId).catch(() => {});

  if (Array.isArray(input.console) && input.console.length > 0) {
    appendPreviewConsole(input.projectId, input.console.slice(-40));
  }
  if (Array.isArray(input.network) && input.network.length > 0) {
    appendPreviewNetwork(input.projectId, input.network.slice(-40));
  }

  void persistPreviewTelemetry(supabase, input.projectId).catch(() => {});

  return { status: "ok" as const, ok: true };
}
