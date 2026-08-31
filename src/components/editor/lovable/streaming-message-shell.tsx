
import { motion,AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { LovableStreamingBuildCard,type StreamingBuildStep } from "./streaming-build-card";
import { LovableStreamingFilesCard } from "./streaming-files-card";
import { LovableStreamingThoughtPanel } from "./streaming-thought-panel";
import {
LovableStreamingPreviewVerifyCard,
type PreviewVerifyResult,
} from "./streaming-preview-verify-card";
import { formatCredits } from "@/lib/ai/credit-cost";

export type { PreviewVerifyResult };

export interface PendingSkillBadge {
  id: string;
  name: string;
  reason?: string;
}

interface LovableStreamingMessageShellProps {
  thoughtSeconds: number;
  /** Live "~" credit estimate for the in-flight message — see streaming-footer.tsx. */
  estimatedCredits: number;
  showThought: boolean;
  reasoningText?: string | null;
  pendingSkills: PendingSkillBadge[];
  agentSteps: StreamingBuildStep[];
  renderStepIcon?: (kind: string) => React.ReactNode;
  subagentSlot?: React.ReactNode;
  previewVerify: PreviewVerifyResult | null;
  streamingProse: string | null;
  buildActivitySlot?: React.ReactNode;
  streamingFiles: string[];
  streamBody: React.ReactNode;
  showTypingDots: boolean;
  postBuildStatus: string | null;
  showGeneratingList: boolean;
  generatingPaths: string[];
}

/** Lovable-parity live assistant message while AI is streaming. */
export function LovableStreamingMessageShell({
  thoughtSeconds,
  estimatedCredits,
  showThought,
  reasoningText,
  pendingSkills,
  agentSteps,
  renderStepIcon,
  subagentSlot,
  previewVerify,
  streamingProse,
  buildActivitySlot,
  streamingFiles,
  streamBody,
  showTypingDots,
  postBuildStatus,
  showGeneratingList,
  generatingPaths,
}: LovableStreamingMessageShellProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
      <div className="w-full space-y-2">
        {/* Live "Working for Xs · ~N credits" status, visible for the whole
            stream (not just the early "thought" phase below) — Lovable
            parity for a running cost display that updates as the work
            progresses, not just a static figure once the message finishes. */}
        {thoughtSeconds > 0 && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--fg-tertiary)]/70 tabular-nums">
            <span>Working for {thoughtSeconds}s</span>
            <span aria-hidden="true">·</span>
            <span title="Estimated — the final amount is confirmed once this message completes">
              ~{formatCredits(estimatedCredits)} credit{estimatedCredits === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {showThought && (
          <LovableStreamingThoughtPanel
            thoughtSeconds={thoughtSeconds}
            reasoningText={reasoningText}
          />
        )}

        {pendingSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {pendingSkills.map((s) => (
              <span
                key={s.id}
                className="text-[10px] px-2 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                title={s.reason ? `Auto-attached skill — ${s.reason}` : "Auto-attached skill"}
              >
                ⚡ Using skill: {s.name}
              </span>
            ))}
          </div>
        )}

        <LovableStreamingBuildCard steps={agentSteps} renderStepIcon={renderStepIcon} />
        {subagentSlot}

        {previewVerify && <LovableStreamingPreviewVerifyCard result={previewVerify} />}

        {streamingProse && (
          <p className="text-sm text-[var(--fg-primary)]/90 leading-relaxed px-1">{streamingProse}</p>
        )}

        {buildActivitySlot}
        <LovableStreamingFilesCard paths={streamingFiles} />

        <div className="text-sm leading-relaxed py-0.5">
          {streamBody}
          {showTypingDots && (
            <div className="flex items-center gap-1.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--fg-tertiary)]/50 typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--fg-tertiary)]/50 typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--fg-tertiary)]/50 typing-dot" />
            </div>
          )}
        </div>

        {postBuildStatus && (
          <div className="flex items-center gap-1.5 py-1 text-[11px] text-violet-700 dark:text-violet-300">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>{postBuildStatus}</span>
          </div>
        )}

        <AnimatePresence>
          {showGeneratingList && generatingPaths.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 font-mono text-[10px] space-y-0.5">
                <div className="text-violet-400 flex items-center gap-1 mb-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Generating files…
                </div>
                {generatingPaths.map((path) => (
                  <div key={path} className="flex items-center gap-1 text-violet-700/70 dark:text-violet-300/70">
                    <span className="text-violet-500">+</span>
                    <span className="truncate">{path}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
