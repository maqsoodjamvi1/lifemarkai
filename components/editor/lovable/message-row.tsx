"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
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
import { formatLovableStampTime } from "./message-timestamp";
import { LovableFixErrorMessage, parseLovableFixMessage } from "./fix-error-message";
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

/** Build/agent summary with optional expand to full assistant prose. */
function BuildSummaryWithExpand({
  summary,
  content,
  mode,
  searchQuery,
}: {
  summary: string;
  content: string;
  mode: string;
  searchQuery?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = content.trim().length > summary.trim().length + 40;
  const q = searchQuery?.trim() ?? "";
  return (
    <div>
      {expanded ? (
        q ? (
          <LovableHighlightedText text={content} query={q} />
        ) : (
          <LovableMessageContent content={content} mode={mode} />
        )
      ) : q ? (
        <p className="text-sm text-foreground/90 leading-relaxed">
          <LovableHighlightedText text={summary} query={q} />
        </p>
      ) : (
        <p className="text-sm text-foreground/90 leading-relaxed">{summary}</p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] text-violet-400/90 hover:text-violet-300 transition-colors"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              Show more <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      )}
    </div>
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
      data-message-role={msg.role}
      id={msg.id}
      // Lovable dump row: mx-auto w-full max-w-3xl flex flex-col rounded-3 py-2
      className={`${msg.role === "user" ? "group/user-message" : "group/assistant-message"} mx-auto w-full max-w-3xl flex flex-col rounded-[var(--radius-3,12px)] py-2 ${
        searchActive
          ? "ring-2 ring-violet-500/50 rounded-xl"
          : keyboardFocused
            ? "ring-2 ring-[var(--fg-tertiary)]/35 rounded-xl"
            : ""
      }`}
    >
      <div
        className={`group relative ${msg.role === "user" ? "w-full items-end pr-4 gap-2" : "w-full items-start gap-1 px-4"} flex flex-col`}
      >
        {/* Lovable dump: centered "Today at 1:38 PM" stamp above user messages */}
        {msg.role === "user" && (
          <div className="text-[var(--fg-tertiary)] mb-1 self-center text-sm font-normal md:text-xs select-none">
            {formatLovableStampTime(msg.created_at)}
          </div>
        )}
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
            onRefine={(editedMarkdown) =>
              void onSendMessage(
                `Continue refining this plan. Ask clarifying questions if needed.\n\nCurrent plan:\n\n${editedMarkdown}`,
              )
            }
            onApproveAndBuild={(editedMarkdown) => {
              // Approve alone starts the build (editor-layout handleApprovePlan).
              // Do not also sendMessage here — that double-fired implement.
              onApprovePlan?.(editedMarkdown);
              onModeChange?.("build");
            }}
          />
        ) : (
          <>
            {msg.role === "user" && (branchMeta?.branched_at || branchMeta?.branch_from_snapshot_id) && (
              <LovableBranchChip
                branchedAt={branchMeta.branched_at}
                snapshotId={branchMeta.branch_from_snapshot_id}
                onOpenSnapshot={onOpenBranchSnapshot}
              />
            )}
            <LovableMessageBubble role={msg.role}>
              {(() => {
                // Lovable dump: fix requests render as a compact "Fix error"
                // special message with the raw error collapsed behind a chevron.
                const fixMeta = parseLovableFixMessage(msg.content);
                if (fixMeta) {
                  return <LovableFixErrorMessage title={fixMeta.title} detail={fixMeta.detail} />;
                }
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
                  return (
                    <BuildSummaryWithExpand
                      summary={summary}
                      content={msg.content ?? ""}
                      mode={msg.mode ?? "chat"}
                      searchQuery={searchQuery}
                    />
                  );
                }
                if (searchQuery.trim()) {
                  const highlighted = <LovableHighlightedText text={msg.content} query={searchQuery} />;
                  return (
                    <LovableCollapsibleText text={msg.content ?? ""}>{highlighted}</LovableCollapsibleText>
                  );
                }
                if (msg.role === "user" || msg.role === "assistant") {
                  return (
                    <LovableCollapsibleText text={msg.content ?? ""}>
                      <LovableMessageContent content={msg.content} mode={msg.mode ?? "chat"} />
                    </LovableCollapsibleText>
                  );
                }
                return <LovableMessageContent content={msg.content} mode={msg.mode ?? "chat"} />;
              })()}
            </LovableMessageBubble>
          </>
        )}

        {msg.role === "assistant" && Array.isArray(agentTrace) && (
          <LovableAgentTrace
            trace={agentTrace}
            seconds={(msg.metadata as { work_seconds?: number } | null)?.work_seconds}
            totalSteps={(msg.metadata as { steps?: number } | null)?.steps}
          />
        )}

        {msg.role === "assistant" && buildActivity && buildActivity.length > 0 && (
          <div className="w-full mt-1">
            {buildActivity.every((s) => s.status === "done") ? (
              <LovableAgentTrace
                trace={buildActivity.map((s) => ({ t: "action", c: s.label }))}
                seconds={(msg.metadata as { work_seconds?: number } | null)?.work_seconds}
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
          const taskSource =
            buildActivity && buildActivity.length > 0
              ? buildActivity.map((s, i) => ({
                  id: `ba-${i}`,
                  label: s.label,
                  done: s.status === "done",
                }))
              : Array.isArray(agentTrace) && agentTrace.length > 0
                ? agentTrace
                    .filter((t): t is { t: string; c: string } => typeof (t as { c?: string }).c === "string")
                    .slice(0, 12)
                    .map((t, i) => ({ id: `at-${i}`, label: t.c, done: true }))
                : undefined;
          return (
            <LovableChangeCard
              title={title}
              statStr={statStr}
              isBookmarked={bookmarked}
              showDetails={showDiffDetails}
              onToggleDetails={onToggleDiffDetails}
              onPreview={() => {
                onPreviewChanges?.();
                // Prefer after-snapshot version preview when available (Lovable Preview tab).
                if (onPreviewVersion) onPreviewVersion();
                else onFocusPreview?.();
              }}
              onToggleBookmark={onToggleBookmark}
              tasks={taskSource}
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
          <LovableChangedFilesCard
            paths={changedPaths}
            onFocusPreview={onPreviewVersion ?? onFocusPreview}
          />
        )}

        {msg.role === "assistant" && screenshot && (
          <LovablePreviewSnapshotCard messageId={msg.id} src={screenshot} />
        )}

        {(msg.role === "user" || msg.role === "assistant") && (
          <LovableMessageActions
            role={msg.role}
            createdAt={msg.created_at}
            statsText={msg.content}
            copyText={msg.content}
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
            onRevert={msg.role === "assistant" && onRevertVersion && !isCurrentVersion ? onRevertVersion : undefined}
            revertDisabled={!!isCurrentVersion}
            onUndoLatest={
              msg.role === "assistant" && isCurrentVersion && onRevertVersion
                ? onRevertVersion
                : undefined
            }
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
