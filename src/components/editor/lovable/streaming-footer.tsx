
import type { EditorMode } from "@/components/editor/editor-layout";
import type { SubagentStep } from "@/lib/ai/subagents";
import type { BuildActivityStep } from "@/lib/ai/build-activity";
import type { BuildIntent } from "@/lib/ai/build-intent";
import { computeCreditCost } from "@/lib/ai/credit-cost";
import { BuildActivityCard } from "@/components/editor/build-activity-card";
import { SubagentActivityCard } from "@/components/editor/subagent-activity-card";
import { LovableAgentStepGlyph } from "./agent-step-glyph";
import { LovableMessageContent } from "./message-content";
import { LovableStreamingMessageShell } from "./streaming-message-shell";
import { extractStreamingProse } from "./streaming-utils";
import type { AgentTaskStep } from "./agent-step-utils";
import type { PreviewVerifyResult } from "./streaming-preview-verify-card";

interface LovableChatStreamingFooterProps {
  streaming: boolean;
  thoughtSeconds: number;
  streamingContent: string;
  streamingFiles: string[];
  pendingSkills: Array<{ id: string; name: string; reason?: string }>;
  agentSteps: AgentTaskStep[];
  subagentSteps: SubagentStep[];
  previewVerify: PreviewVerifyResult | null;
  buildActivitySteps: BuildActivityStep[];
  mode: EditorMode;
  buildStatus: BuildIntent | null;
  postBuildStatus: string | null;
  messagesEndRef: React.Ref<HTMLDivElement>;
  reasoningText?: string | null;
}

/** Live streaming assistant row + scroll anchor at the bottom of the chat timeline. */
export function LovableChatStreamingFooter({
  streaming,
  thoughtSeconds,
  streamingContent,
  streamingFiles,
  pendingSkills,
  agentSteps,
  subagentSteps,
  previewVerify,
  buildActivitySteps,
  mode,
  buildStatus,
  postBuildStatus,
  messagesEndRef,
  reasoningText,
}: LovableChatStreamingFooterProps) {
  const isBuildLikeMode = mode === "build" || mode === "patch" || mode === "agent" || !!buildStatus;

  // Live credit estimate while the message is still streaming — Lovable
  // shows "Working for Xs" + "Credits used" ticking together while
  // processing, then finalizes on completion. Before this, LifemarkAI only
  // had the duration ticking live (thoughtSeconds, updated every second);
  // the actual credits figure only ever appeared as a static badge AFTER
  // the message finished (message-meta-badges.tsx, from the server-computed
  // final cost). computeCreditCost is the same formula the server uses to
  // charge the message — reused here client-side against what's visible so
  // far (files streamed in, and streamingContent.length/4 as a standard
  // chars-per-token approximation for tokensUsed) for a live "~" estimate.
  // It will not exactly match the final server-computed figure — that's
  // expected and why the UI below labels it as an estimate — but it moves
  // together with the work instead of sitting blank until the message ends.
  const estimatedCredits = streaming
    ? computeCreditCost({
        mode,
        filesGenerated: streamingFiles.length,
        tokensUsed: Math.round(streamingContent.length / 4),
      })
    : 0;

  return (
    <>
      {streaming && (
        <LovableStreamingMessageShell
          thoughtSeconds={thoughtSeconds}
          estimatedCredits={estimatedCredits}
          showThought={!extractStreamingProse(streamingContent) && streamingFiles.length === 0}
          reasoningText={reasoningText}
          pendingSkills={pendingSkills}
          agentSteps={agentSteps}
          renderStepIcon={(kind) => <LovableAgentStepGlyph kind={kind} />}
          subagentSlot={subagentSteps.length > 0 ? <SubagentActivityCard steps={subagentSteps} /> : null}
          previewVerify={previewVerify}
          streamingProse={extractStreamingProse(streamingContent) || null}
          buildActivitySlot={
            buildActivitySteps.length > 0 ? <BuildActivityCard steps={buildActivitySteps} /> : null
          }
          streamingFiles={streamingFiles}
          streamBody={
            isBuildLikeMode
              ? null
              : streamingContent
                ? <LovableMessageContent content={streamingContent} mode={mode} />
                : null
          }
          showTypingDots={!isBuildLikeMode && !streamingContent}
          postBuildStatus={postBuildStatus}
          showGeneratingList={
            streamingFiles.length > 0 && agentSteps.length === 0 && mode !== "build" && mode !== "patch" && !buildStatus
          }
          generatingPaths={streamingFiles}
        />
      )}
      <div ref={messagesEndRef} />
    </>
  );
}
