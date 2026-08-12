import type { SupabaseClient } from "@supabase/supabase-js";
import { publishProjectFromChat } from "../../deploy/publish-from-chat.ts";
import { persistChatTurnMessages } from "../persist-chat-turn.ts";
import { createStreamSink } from "./sse-stream.ts";

interface DeployActionOptions {
  req: Request;
  supabase: SupabaseClient;
  projectId: string;
  userId: string;
  persistedUserMessage: string;
  mode: "chat" | "build";
}

/** Runs the model-free publish path and returns its chat-compatible SSE response. */
export function createDeployActionResponse({
  req,
  supabase,
  projectId,
  userId,
  persistedUserMessage,
  mode,
}: DeployActionOptions): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const { safeEnqueue, safeClose } = createStreamSink(controller, encoder, req.signal);
      const send = (payload: Record<string, unknown>) =>
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const emitStatus = (status: string) =>
        send({ status: "deploy_status", message: status, wiring_status: status });

      let assistantContent: string;
      let deployOk = false;
      let deployUrl: string | undefined;
      try {
        emitStatus("Publishing your app…");
        const result = await publishProjectFromChat({ supabase, projectId, userId, emit: emitStatus });
        deployOk = result.ok;
        deployUrl = result.url;
        assistantContent = result.ok
          ? `Your app is live! 🚀\n\n**${result.url}**\n\nPublished ${result.fileCount} file${result.fileCount === 1 ? "" : "s"} via ${result.provider === "netlify" ? "Netlify" : "LifemarkAI hosting"}. Publishing is free — no credits were used. Say "publish" any time to ship your latest changes.`
          : `Publish failed: ${result.error ?? "Unknown error"}. Your app wasn't changed — you can try again, or publish from the Deploy panel.`;
      } catch (error) {
        assistantContent = `Publish failed: ${error instanceof Error ? error.message : String(error)}. Your app wasn't changed — you can try again, or publish from the Deploy panel.`;
      }

      let assistantMessageId: string | undefined;
      try {
        const persisted = await persistChatTurnMessages(
          supabase,
          [
            { project_id: projectId, role: "user", content: persistedUserMessage, mode },
            {
              project_id: projectId,
              role: "assistant",
              content: assistantContent,
              tokens_used: 0,
              mode,
              metadata: {
                credits_used: 0,
                deploy_requested: true,
                ...(deployUrl ? { deploy_url: deployUrl } : {}),
              },
            },
          ],
          { projectId, label: "deploy-turn" },
        );
        assistantMessageId = persisted.assistantMessageId;
      } catch {
        // Publishing already completed; message persistence remains best-effort.
      }

      send({ chunk: assistantContent });
      send({
        done: true,
        tokensUsed: 0,
        creditsUsed: 0,
        fileCount: 0,
        assistantMessageId,
        deployed: deployOk,
        deploy_url: deployUrl,
        displayMessage: assistantContent,
      });
      safeClose();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
