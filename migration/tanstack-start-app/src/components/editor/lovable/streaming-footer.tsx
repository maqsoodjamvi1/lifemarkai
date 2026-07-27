
import type { EditorMode } from "@/components/editor/editor-layout";
import type { SubagentStep } from "@/lib/ai/subagents";
import type { BuildActivityStep } from "@/lib/ai/build-activity";
import type { BuildIntent } from "@/lib/ai/build-intent";
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

  return (
    <>
      {streaming && (
        <LovableStreamingMessageShell
          thoughtSeconds={thoughtSeconds}
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
