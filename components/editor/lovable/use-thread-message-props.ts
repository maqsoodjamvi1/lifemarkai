"use client";

import { useCallback } from "react";
import type { Message } from "@/types/database";
import type { EditorMode } from "@/components/editor/editor-layout";
import type { GeneratedFile } from "@/components/editor/file-attachment-card";
import type { FileState } from "@/components/editor/diff-viewer";
import type { BuildActivityStep } from "@/lib/ai/build-activity";
import { parseLovableStepPlan } from "./plan-cards";
import type { LovableMessageRowProps } from "./message-row";
import type { LovableFileDiffEntry } from "./types";

export interface UseThreadMessagePropsArgs {
  searchQuery: string;
  streaming: boolean;
  showBookmarks: boolean;
  lastAssistantMsgId: string | null;
  copiedId: string | null;
  pinnedMsgId: string | null;
  ratings: Record<string, 1 | -1>;
  editingMessageId: string | null;
  editInput: string;
  bookmarkedIds: Set<string>;
  expandedDiffs: Set<string>;
  reactions: Record<string, Set<string>>;
  messageDiffs: Record<string, LovableFileDiffEntry[]>;
  messageChangedPaths: Record<string, string[]>;
  messageScreenshots: Record<string, string>;
  messageBuildActivity: Record<string, BuildActivityStep[]>;
  messageSkills: Record<string, Array<{ id: string; name: string; reason?: string }>>;
  messageCredits: Record<string, number>;
  genTimes: Record<string, number>;
  suggestions: Record<string, string[]>;
  roleTestChips: Record<string, string[]>;
  approvedSteps: Record<string, Set<number>>;
  fileStates: Record<string, Record<string, FileState>>;
  afterSnapshotByMessageId: Map<string, string>;
  latestSnapshotMessageId: string | null;
  visibleMessages: Message[];
  onCopy: (content: string, id: string) => void;
  onStartEdit: (msg: Message) => void;
  onTogglePin: (msgId: string) => void;
  onRate: (msgId: string, value: 1 | -1) => void;
  onEditInputChange: (v: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  onRegenerate: () => void;
  onToggleBookmark: (msgId: string) => void;
  onToggleDiffDetails: (msgId: string) => void;
  onPreviewChanges: (msgId: string) => void;
  onFocusPreview?: () => void;
  onToggleReaction: (msgId: string, emoji: string) => void;
  onRevertFile: (msgId: string, diff: LovableFileDiffEntry) => void;
  onReApplyFile: (msgId: string, diff: LovableFileDiffEntry) => void;
  onAcceptFile: (msgId: string, path: string) => void;
  onRevertToVersion: (snapshotId: string) => void;
  onSaveAsSkill: (msg: Message) => void;
  onAddToKnowledge?: (msg: Message) => void;
  onSendMessage: (text: string, mode?: EditorMode) => void;
  onApprovePlan?: (markdown: string) => void;
  onModeChange?: (mode: EditorMode) => void;
  onToggleStep: (msgId: string, idx: number) => void;
  onSelectAllSteps: (msgId: string, stepCount: number) => void;
  onClearSteps: (msgId: string) => void;
  onBuildSteps: (msgId: string, steps: string[]) => void;
  onSelectSuggestion: (msgId: string, chip: string) => void;
  onSelectRoleTestChip: (msgId: string, chip: string) => void;
  onOpenTestingPanel?: () => void;
  onSaveAnalyzeFile?: (file: GeneratedFile) => void | Promise<void>;
}

/** Builds the per-message prop bag for LovableThreadItem without bloating chat-panel JSX. */
export function useThreadMessageProps(args: UseThreadMessagePropsArgs) {
  return useCallback(
    (msg: Message, _msgIdx: number, _thread: Message[]): Omit<LovableMessageRowProps, "msg"> => {
      const preSnapshotId = (msg.metadata as { snapshot_id?: string } | null)?.snapshot_id;
      const afterSnapshotId = args.afterSnapshotByMessageId.get(msg.id) ?? null;
      const isCurrentVersion = msg.id === args.latestSnapshotMessageId || !afterSnapshotId;
      const stepPlanSteps = msg.content.includes("<!-- STEP_PLAN -->")
        ? parseLovableStepPlan(msg.content)
        : [];

      return {
        searchQuery: args.searchQuery,
        streaming: args.streaming,
        showBookmarks: args.showBookmarks,
        isLastAssistant: msg.id === args.lastAssistantMsgId,
        copiedId: args.copiedId,
        pinnedMsgId: args.pinnedMsgId,
        rating: args.ratings[msg.id] ?? null,
        editingMessageId: args.editingMessageId,
        editInput: args.editInput,
        bookmarked: args.bookmarkedIds.has(msg.id),
        showDiffDetails: args.expandedDiffs.has(msg.id),
        reactions: args.reactions[msg.id],
        diffs: args.messageDiffs[msg.id],
        changedPaths: args.messageChangedPaths[msg.id],
        screenshot: args.messageScreenshots[msg.id],
        buildActivity:
          args.messageBuildActivity[msg.id] ??
          ((msg.metadata as { build_activity?: BuildActivityStep[] } | null)?.build_activity ?? null),
        skills: args.messageSkills[msg.id],
        credits: args.messageCredits[msg.id],
        genSeconds: args.genTimes[msg.id],
        suggestions: args.suggestions[msg.id],
        roleTestChips: args.roleTestChips[msg.id],
        approvedSteps: stepPlanSteps.length
          ? (args.approvedSteps[msg.id] ?? new Set(stepPlanSteps.map((_, i) => i)))
          : undefined,
        fileStates: args.fileStates[msg.id],
        afterSnapshotId: preSnapshotId ? afterSnapshotId : null,
        isCurrentVersion,
        onCopy: () => args.onCopy(msg.content, msg.id),
        onEdit: () => args.onStartEdit(msg),
        onTogglePin: () => args.onTogglePin(msg.id),
        onThumbsUp: () => void args.onRate(msg.id, 1),
        onThumbsDown: () => void args.onRate(msg.id, -1),
        onEditInputChange: args.onEditInputChange,
        onSubmitEdit: args.onSubmitEdit,
        onCancelEdit: args.onCancelEdit,
        onRegenerate: args.onRegenerate,
        onToggleBookmark: () => args.onToggleBookmark(msg.id),
        onToggleDiffDetails: () => args.onToggleDiffDetails(msg.id),
        onPreviewChanges: () => args.onPreviewChanges(msg.id),
        onFocusPreview: args.onFocusPreview,
        onToggleReaction: (emoji) => args.onToggleReaction(msg.id, emoji),
        onRevertFile: (path, oldContent) => {
          const diff = args.messageDiffs[msg.id]?.find((d) => d.path === path);
          if (diff) void args.onRevertFile(msg.id, { ...diff, oldContent });
        },
        onReApplyFile: (path, newContent) => {
          const diff = args.messageDiffs[msg.id]?.find((d) => d.path === path);
          if (diff) void args.onReApplyFile(msg.id, { ...diff, newContent });
        },
        onAcceptFile: (path) => args.onAcceptFile(msg.id, path),
        onRevertVersion:
          !isCurrentVersion && afterSnapshotId
            ? () => void args.onRevertToVersion(afterSnapshotId)
            : undefined,
        onPreviewVersion:
          !isCurrentVersion && afterSnapshotId
            ? () =>
                window.dispatchEvent(
                  new CustomEvent("lifemark-preview-version", {
                    detail: { snapshotId: afterSnapshotId, label: (msg.content ?? "").slice(0, 60) },
                  }),
                )
            : undefined,
        onSaveAsSkill: () => args.onSaveAsSkill(msg),
        onAddToKnowledge: args.onAddToKnowledge ? () => args.onAddToKnowledge!(msg) : undefined,
        onSendMessage: args.onSendMessage,
        onApprovePlan: args.onApprovePlan,
        onModeChange: args.onModeChange,
        onToggleStep: (idx) => args.onToggleStep(msg.id, idx),
        onSelectAllSteps: () => args.onSelectAllSteps(msg.id, stepPlanSteps.length),
        onClearSteps: () => args.onClearSteps(msg.id),
        onBuildSteps: () => args.onBuildSteps(msg.id, stepPlanSteps),
        onSelectSuggestion: (chip) => args.onSelectSuggestion(msg.id, chip),
        onSelectRoleTestChip: (chip) => args.onSelectRoleTestChip(msg.id, chip),
        onOpenTestingPanel: args.onOpenTestingPanel,
        onSaveAnalyzeFile: args.onSaveAnalyzeFile,
      };
    },
    [
      args.searchQuery,
      args.streaming,
      args.showBookmarks,
      args.lastAssistantMsgId,
      args.copiedId,
      args.pinnedMsgId,
      args.ratings,
      args.editingMessageId,
      args.editInput,
      args.bookmarkedIds,
      args.expandedDiffs,
      args.reactions,
      args.messageDiffs,
      args.messageChangedPaths,
      args.messageScreenshots,
      args.messageBuildActivity,
      args.messageSkills,
      args.messageCredits,
      args.genTimes,
      args.suggestions,
      args.roleTestChips,
      args.approvedSteps,
      args.fileStates,
      args.afterSnapshotByMessageId,
      args.latestSnapshotMessageId,
      args.onCopy,
      args.onStartEdit,
      args.onTogglePin,
      args.onRate,
      args.onEditInputChange,
      args.onSubmitEdit,
      args.onCancelEdit,
      args.onRegenerate,
      args.onToggleBookmark,
      args.onToggleDiffDetails,
      args.onPreviewChanges,
      args.onFocusPreview,
      args.onToggleReaction,
      args.onRevertFile,
      args.onReApplyFile,
      args.onAcceptFile,
      args.onRevertToVersion,
      args.onSaveAsSkill,
      args.onAddToKnowledge,
      args.onSendMessage,
      args.onApprovePlan,
      args.onModeChange,
      args.onToggleStep,
      args.onSelectAllSteps,
      args.onClearSteps,
      args.onBuildSteps,
      args.onSelectSuggestion,
      args.onSelectRoleTestChip,
      args.onOpenTestingPanel,
      args.onSaveAnalyzeFile,
    ],
  );
}
