"use client";

import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";
import type { Message } from "@/types/database";
import type { EditorMode } from "@/components/editor/editor-layout";
import type { GeneratedFile } from "@/components/editor/file-attachment-card";
import type { FileState } from "@/components/editor/diff-viewer";
import { DiffViewer, computeFileDiff } from "@/components/editor/diff-viewer";
import { AnalyzeMessageCard, parseAnalyzeMetadata } from "@/components/editor/analyze-message-card";
import { BuildActivityCard } from "@/components/editor/build-activity-card";
import type { BuildActivityStep } from "@/lib/ai/build-activity";
import { LovableAgentTrace } from "./agent-trace";
import { LovableChangeCard } from "./change-card";
import { LovableMessageActions } from "./message-actions";
import { LovableMessageBubble } from "./message-bubble";
import { LovableMessageContent, LovableHighlightedText } from "./message-content";
import { LovablePlanReadyCard, LovableStepPlanCard, parseLovableStepPlan } from "./plan-cards";
import { LovableSuggestionChips } from "./suggestion-chips";
import { LovableChangedFilesCard } from "./changed-files-card";
import { LovablePreviewSnapshotCard } from "./preview-snapshot-card";
import { LovableVerificationCard } from "./verification-card";
import { LovableMessageMetaBadges } from "./message-meta-badges";
import { LovableMessageReactions } from "./message-reactions";
import { LovableMessageEditInline } from "./message-edit-inline";
import { LovableRoleTestBanner } from "./role-test-banner";
import { LovableCollapsibleText } from "./collapsible-text";
import { LovableBranchChip } from "./branch-chip";
import { computeLovableChangeCardMeta, type LovableFileDiffEntry } from "./types";

function buildAssistantSummary(
  content: string,
  diffCount: number,
  changedCount: number,
): string {
  const c = content.trim();
  const looksRaw = !c || c.startsWith("```") || c.startsWith("{") || c.startsWith("[");
  if (looksRaw) {
    if (diffCount > 0) {
      return `Updated ${diffCount} file${diffCount === 1 ? "" : "s"}. Open the Code tab or preview to see the result.`;
    }
    if (changedCount > 0) {
      return `Updated ${changedCount} file${changedCount === 1 ? "" : "s"}. Preview refreshed.`;
    }
    return "Changes applied. Open the Code tab or preview to see the result.";
  }
  const prose = c.split("```")[0].trim();
  return (
    prose
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .join(" ")
      .replace(/[*_`]/g, "")
      .slice(0, 240) || (diffCount > 0 ? `Updated ${diffCount} file${diffCount === 1 ? "" : "s"}.` : "Done.")
  );
}

export interface LovableMessageRowProps {
  msg: Message;
  searchQuery: string;
  searchActive?: boolean;
  /** Keyboard-focused message (Alt+↑/↓). */
  keyboardFocused?: boolean;
  streaming: boolean;
  showBookmarks: boolean;
  isLastAssistant: boolean;
  copiedId: string | null;
  copiedLinkId?: string | null;
  pinnedMsgId: string | null;
  rating: 1 | -1 | null;
  editingMessageId: string | null;
  editInput: string;
  bookmarked: boolean;
  showDiffDetails: boolean;
  reactions: Set<string> | undefined;
  diffs: LovableFileDiffEntry[] | undefined;
  changedPaths: string[] | undefined;
  screenshot: string | undefined;
  buildActivity: BuildActivityStep[] | null;
  skills: Array<{ id: string; name: string; reason?: string }> | undefined;
  credits: number | undefined;
  genSeconds: number | undefined;
  suggestions: string[] | undefined;
  roleTestChips: string[] | undefined;
  approvedSteps: Set<number> | undefined;
  fileStates: Record<string, FileState> | undefined;
  afterSnapshotId: string | null;
  isCurrentVersion: boolean;
  onCopy: () => void;
  onCopyLink?: () => void;
  onExport?: () => void;
  onUseInComposer?: () => void;
  onDelete?: () => void;
  onReadAloud?: () => void;
  speaking?: boolean;
  onEdit: () => void;
  onTogglePin: () => void;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onEditInputChange: (v: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  onRegenerate: () => void;
  onToggleBookmark: () => void;
  onToggleDiffDetails: () => void;
  onPreviewChanges?: () => void;
  onFocusPreview?: () => void;
  onToggleReaction: (emoji: string) => void;
  onRevertFile: (path: string, oldContent: string) => void;
  onReApplyFile: (path: string, newContent: string) => void;
  onAcceptFile: (path: string) => void;
  onRevertVersion?: () => void;
  onPreviewVersion?: () => void;
  onSaveAsSkill?: () => void;
  onAddToKnowledge?: () => void;
  onSendMessage: (text: string, mode?: EditorMode) => void;
  onApprovePlan?: (markdown: string) => void;
  onModeChange?: (mode: EditorMode) => void;
  onToggleStep: (idx: number) => void;
  onSelectAllSteps: () => void;
  onClearSteps: () => void;
  onBuildSteps: () => void;
  onSelectSuggestion: (chip: string) => void;
  onSelectRoleTestChip: (chip: string) => void;
  onOpenTestingPanel?: () => void;
  onSaveAnalyzeFile?: (file: GeneratedFile) => void | Promise<void>;
  onOpenBranchSnapshot?: (snapshotId: string) => void;
}

/** Lovable-parity single message row — bubble, traces, change cards, actions. */
export function LovableMessageRow({
  msg,
  searchQuery,
  searchActive,
  keyboardFocused,
  streaming,
  showBookmarks,
  isLastAssistant,
  copiedId,
  copiedLinkId,
  pinnedMsgId,
  rating,
  editingMessageId,
  editInput,
  bookmarked,
  showDiffDetails,
  reactions,
  diffs,
  changedPaths,
  screenshot,
  buildActivity,
  skills,
  credits,
  genSeconds,
  suggestions,
  roleTestChips,
  approvedSteps,
  fileStates,
  afterSnapshotId,
  isCurrentVersion,
  onCopy,
  onCopyLink,
  onExport,
  onUseInComposer,
  onDelete,
  onReadAloud,
  speaking,
  onEdit,
  onTogglePin,
  onThumbsUp,
  onThumbsDown,
  onEditInputChange,
  onSubmitEdit,
  onCancelEdit,
  onRegenerate,
  onToggleBookmark,
  onToggleDiffDetails,
  onPreviewChanges,
  onFocusPreview,
  onToggleReaction,
  onRevertFile,
  onReApplyFile,
  onAcceptFile,
  onRevertVersion,
  onPreviewVersion,
  onSaveAsSkill,
  onAddToKnowledge,
  onSendMessage,
  onApprovePlan,
  onModeChange,
  onToggleStep,
  onSelectAllSteps,
  onClearSteps,
  onBuildSteps,
  onSelectSuggestion,
  onSelectRoleTestChip,
  onOpenTestingPanel,
  onSaveAnalyzeFile,
  onOpenBranchSnapshot,
}: LovableMessageRowProps) {
  const verification = (msg.metadata as {
    verification?: { passed?: boolean; engine?: string; fixesApplied?: number; errors?: string[] };
  } | null)?.verification;

  const agentTrace = (msg.metadata as {
    agent_trace?: Array<{ t: string; tool?: string; c: string; path?: string }>;
    work_seconds?: number;
    steps?: number;
  } | null)?.agent_trace;

  const branchMeta = (msg.metadata as {
    branched_at?: string;
    branch_from_snapshot_id?: string | null;
  } | null) ?? null;

  const hasStepPlan = msg.role === "assistant" && msg.content.includes("<!-- STEP_PLAN -->");
  const hasPlanReady = msg.role === "assistant" && msg.content.includes("<!-- PLAN_READY -->");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-message-id={msg.id}
      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} ${
        searchActive
          ? "ring-2 ring-violet-500/50 rounded-xl"
          : keyboardFocused
            ? "ring-2 ring-[var(--fg-tertiary)]/35 rounded-xl"
            : ""
      }`}
    >
      <div
        className={`group relative ${msg.role === "user" ? "max-w-[80%] items-end" : "w-full items-start"} flex flex-col gap-1`}
      >
        {hasStepPlan ? (() => {
          const steps = parseLovableStepPlan(msg.content);
          const approved = approvedSteps ?? new Set(steps.map((_, i) => i));
          return (
            <LovableStepPlanCard
              steps={steps}
              approved={approved}
              onToggleStep={onToggleStep}
              onSelectAll={onSelectAllSteps}
              onClear={onClearSteps}
              onBuild={onBuildSteps}
            />
          );
        })() : null}

        {hasPlanReady ? (
          <LovablePlanReadyCard
            content={msg.content}
            onRefine={() => onSendMessage("Continue refining this plan. Ask me any clarifying questions.")}
            onApproveAndBuild={() => {
              const planMarkdown = msg.content.replace("<!-- PLAN_READY -->", "").trim();
              onApprovePlan?.(planMarkdown);
              onModeChange?.("build");
              void onSendMessage(`Implement this approved plan:\n\n${planMarkdown}`, "build");
            }}
          />
        ) : (
          {msg.role === "user" && (branchMeta?.branched_at || branchMeta?.branch_from_snapshot_id) && (
            <LovableBranchChip
              branchedAt={branchMeta.branched_at}
              snapshotId={branchMeta.branch_from_snapshot_id}
              onOpenSnapshot={onOpenBranchSnapshot}
            />
          )}
          <LovableMessageBubble role={msg.role}>
            {(() => {
              const analyzeMeta = msg.role === "assistant" ? parseAnalyzeMetadata(msg.metadata) : null;
              if (analyzeMeta) {
                return (
                  <AnalyzeMessageCard
                    meta={analyzeMeta}
                    createdAt={new Date(msg.created_at).toLocaleTimeString()}
                    onSaveToProject={onSaveAnalyzeFile}
                  />
                );
              }
              if (msg.role === "assistant" && (msg.mode === "build" || msg.mode === "agent" || msg.mode === "patch")) {
                const diffCount = diffs?.length ?? 0;
                const changedCount = changedPaths?.length ?? 0;
                const summary = buildAssistantSummary(msg.content ?? "", diffCount, changedCount);
                return <p className="text-sm text-foreground/90 leading-relaxed">{summary}</p>;
              }
              if (searchQuery.trim()) {
                const highlighted = <LovableHighlightedText text={msg.content} query={searchQuery} />;
                return msg.role === "user" ? (
                  <LovableCollapsibleText text={msg.content}>{highlighted}</LovableCollapsibleText>
                ) : (
                  highlighted
                );
              }
              if (msg.role === "user") {
                return (
                  <LovableCollapsibleText text={msg.content ?? ""}>
                    <LovableMessageContent content={msg.content} mode={msg.mode ?? "chat"} />
                  </LovableCollapsibleText>
                );
              }
              return <LovableMessageContent content={msg.content} mode={msg.mode ?? "chat"} />;
            })()}
          </LovableMessageBubble>
        )}

        {msg.role === "assistant" && Array.isArray(agentTrace) && (
          <LovableAgentTrace
            trace={agentTrace}
            seconds={(msg.metadata as { work_seconds?: number }).work_seconds}
            totalSteps={(msg.metadata as { steps?: number }).steps}
          />
        )}

        {msg.role === "assistant" && buildActivity && buildActivity.length > 0 && (
          <div className="w-full mt-1">
            {buildActivity.every((s) => s.status === "done") ? (
              <LovableAgentTrace
                trace={buildActivity.map((s) => ({ t: "action", c: s.label }))}
                seconds={(msg.metadata as { work_seconds?: number }).work_seconds}
                totalSteps={buildActivity.length}
              />
            ) : (
              <BuildActivityCard steps={buildActivity} title="Working…" />
            )}
          </div>
        )}

        {msg.role === "assistant" && verification && (
          <LovableVerificationCard
            passed={verification.passed}
            engine={verification.engine}
            errors={verification.errors}
          />
        )}

        {msg.role === "assistant" && diffs && diffs.length > 0 && (() => {
          const { title, statStr } = computeLovableChangeCardMeta(diffs);
          return (
            <LovableChangeCard
              title={title}
              statStr={statStr}
              isBookmarked={bookmarked}
              showDetails={showDiffDetails}
              onToggleDetails={onToggleDiffDetails}
              onPreview={() => {
                onPreviewChanges?.();
                onFocusPreview?.();
              }}
              onToggleBookmark={onToggleBookmark}
              detailsContent={
                <DiffViewer
                  diffs={diffs.map((d) => computeFileDiff(d.path, d.oldContent, d.newContent))}
                  compact
                  fileStates={fileStates}
                  onAccept={onAcceptFile}
                  onRevert={onRevertFile}
                  onReApply={onReApplyFile}
                />
              }
            />
          );
        })()}

        {msg.role === "assistant" && (!diffs || diffs.length === 0) && changedPaths && changedPaths.length > 0 && (
          <LovableChangedFilesCard paths={changedPaths} onFocusPreview={onFocusPreview} />
        )}

        {msg.role === "assistant" && screenshot && (
          <LovablePreviewSnapshotCard messageId={msg.id} src={screenshot} />
        )}

        {(msg.role === "user" || msg.role === "assistant") && (
          <LovableMessageActions
            role={msg.role}
            createdAt={msg.created_at}
            statsText={msg.content}
            copied={copiedId === msg.id}
            linkCopied={copiedLinkId === msg.id}
            bookmarked={bookmarked}
            pinned={pinnedMsgId === msg.id}
            rating={rating}
            canEdit={msg.role === "user" && !streaming && editingMessageId !== msg.id}
            onEdit={onEdit}
            onCopy={onCopy}
            onCopyLink={onCopyLink}
            onToggleBookmark={onToggleBookmark}
            onExport={onExport}
            onUseInComposer={onUseInComposer}
            onDelete={onDelete}
            onReadAloud={msg.role === "assistant" ? onReadAloud : undefined}
            speaking={speaking}
            onTogglePin={msg.role === "assistant" ? onTogglePin : undefined}
            onThumbsUp={msg.role === "assistant" ? onThumbsUp : undefined}
            onThumbsDown={msg.role === "assistant" ? onThumbsDown : undefined}
            onAddToKnowledge={msg.role === "assistant" ? onAddToKnowledge : undefined}
          >
            {msg.role === "assistant" && (
              <LovableMessageMetaBadges
                model={msg.model}
                skills={skills}
                credits={credits}
                genSeconds={genSeconds}
                tokensUsed={msg.tokens_used}
                afterSnapshotId={afterSnapshotId}
                isCurrentVersion={isCurrentVersion}
                onRevertVersion={onRevertVersion}
                onPreviewVersion={onPreviewVersion}
                onSaveAsSkill={onSaveAsSkill}
                reactions={reactions}
                onToggleReaction={onToggleReaction}
              />
            )}
          </LovableMessageActions>
        )}

        {msg.role === "assistant" && reactions && reactions.size > 0 && (
          <LovableMessageReactions reactions={reactions} onToggle={onToggleReaction} />
        )}

        {editingMessageId === msg.id && (
          <LovableMessageEditInline
            value={editInput}
            onChange={onEditInputChange}
            onSubmit={onSubmitEdit}
            onCancel={onCancelEdit}
          />
        )}

        {msg.role === "assistant" && isLastAssistant && !streaming && !showBookmarks && !searchQuery && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 mt-1 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground border border-border/40 hover:border-border rounded-full bg-muted/20 hover:bg-muted/40 transition-colors"
            title="Regenerate response"
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        )}

        {msg.role === "assistant" && suggestions && suggestions.length > 0 && !streaming && (
          <AnimatePresence>
            {roleTestChips && roleTestChips.length > 0 && (
              <LovableRoleTestBanner
                chips={roleTestChips}
                onSelectChip={onSelectRoleTestChip}
                onOpenTestingPanel={() => onOpenTestingPanel?.()}
              />
            )}
            <LovableSuggestionChips
              className="mt-2"
              chips={suggestions}
              onSelect={onSelectSuggestion}
            />
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
