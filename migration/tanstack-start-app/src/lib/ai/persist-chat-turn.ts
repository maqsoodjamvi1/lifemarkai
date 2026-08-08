/**
 * Durable chat-turn persistence for the messages table.
 *
 * Inserts must never silently drop history:
 * - mode is remapped via toPersistedMessageMode (patch → build)
 * - content is never null/empty (NOT NULL constraint)
 * - on RLS / client failure, retries with the service-role admin client
 */
import { createAdminClient } from "../supabase/server.ts";
import { logger } from "../logger.ts";
import { upsertMessageEmbedding } from "../editor/message-embeddings.ts";
import {
sanitizeMessageContent,
toPersistedMessageMode,
type PersistedMessageMode,
type RuntimeEditorMode,
} from "@/lib/ai/persist-message-mode";
import type { Json } from "@/types/database";

export type ChatTurnInsertRow = {
  project_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode?: RuntimeEditorMode | PersistedMessageMode | null;
  tokens_used?: number | null;
  model?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function persistChatTurnMessages(
  supabase: { from: (table: string) => any },
  rows: ChatTurnInsertRow[],
  context: { projectId: string; label: string },
): Promise<{ assistantMessageId?: string; error?: unknown }> {
  const payload = rows.map((row) => ({
    project_id: row.project_id,
    role: row.role,
    content: sanitizeMessageContent(row.role, row.content),
    mode: toPersistedMessageMode(row.mode),
    ...(row.tokens_used != null ? { tokens_used: row.tokens_used } : {}),
    ...(row.model != null ? { model: row.model } : {}),
    ...(row.metadata != null ? { metadata: row.metadata as Json } : {}),
  }));

  let data: Array<{ id: string; role: string }> | null = null;
  let error: unknown = null;

  try {
    const result = await supabase
      .from("messages")
      .insert(payload)
      .select("id, role");
    data = result.data;
    error = result.error;
  } catch (e) {
    error = e;
  }

  if (error || !data?.length) {
    logger.error("messages insert failed — retrying with admin client", {
      projectId: context.projectId,
      label: context.label,
      error,
    });
    try {
      const admin = await createAdminClient();
      const retry = await admin
        .from("messages")
        .insert(payload)
        .select("id, role");
      if (retry.error || !retry.data?.length) {
        logger.error("messages insert failed (admin retry)", {
          projectId: context.projectId,
          label: context.label,
          error: retry.error,
        });
        return { error: retry.error ?? error ?? new Error("messages insert failed") };
      }
      data = retry.data;
      error = null;
    } catch (adminErr) {
      logger.error("messages insert admin retry threw", {
        projectId: context.projectId,
        label: context.label,
        error: adminErr,
      });
      return { error: adminErr };
    }
  }

  const assistantMessageId = data?.find((row) => row.role === "assistant")?.id;

  // Semantic-search cache — fire-and-forget; never block the chat turn.
  void (async () => {
    try {
      const admin = await createAdminClient();
      await Promise.all(
        (data ?? []).map((row, i) =>
          upsertMessageEmbedding(
            admin,
            context.projectId,
            row.id,
            payload[i]?.content ?? "",
          ),
        ),
      );
    } catch {
      /* non-critical */
    }
  })();

  return { assistantMessageId };
}
