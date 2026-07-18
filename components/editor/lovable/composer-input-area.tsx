"use client";

import type { RefObject } from "react";
import type { LeftPanel } from "@/components/editor/editor-layout";
import { ChatTiptapInput, type ChatInputHandle } from "@/components/editor/chat-tiptap-input";
import { LovableSecurityIssuesBar } from "./security-issues-bar";
import { LovableLiveLockBanner } from "./live-lock-banner";
import {
  LovableComposerCharacterCounter,
  lovableComposerInputRingClass,
} from "./composer-character-counter";
import { LovableComposerOverlays, type LovableComposerOverlaysProps } from "./composer-overlays";
import { LovableComposerBottomRow, type LovableComposerBottomRowProps } from "./composer-bottom-row";
import { LovableComposerEstimatedCredits } from "./composer-estimated-credits";

export interface LovableComposerInputAreaProps
  extends LovableComposerOverlaysProps,
    Omit<LovableComposerBottomRowProps, "onOpenPanel"> {
  textareaRef: RefObject<ChatInputHandle | null>;
  input: string;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPasteText: (
    text: string,
    event: ClipboardEvent,
    selection: { from: number; to: number },
  ) => boolean;
  placeholder: string;
  noCredits: boolean;
  isLocked: boolean;
  securityIssueCount: number;
  onOpenPanel?: (panel: LeftPanel) => void;
  onViewSecurityIssues: () => void;
  onFixAllSecurityIssues: () => void;
  hasAttachments?: boolean;
  contextFileCount?: number;
}

/** Textarea, overlays, security bar, and bottom controls inside the input card. */
export function LovableComposerInputArea({
  textareaRef,
  input,
  onInputChange,
  onKeyDown,
  onPasteText,
  placeholder,
  noCredits,
  isLocked,
  securityIssueCount,
  onOpenPanel,
  onViewSecurityIssues,
  onFixAllSecurityIssues,
  hasAttachments,
  contextFileCount,
  ...rest
}: LovableComposerInputAreaProps) {
  const overlayProps: LovableComposerOverlaysProps = {
    mentionOpen: rest.mentionOpen,
    isCrossProjectQuery: rest.isCrossProjectQuery,
    mentionItems: rest.mentionItems,
    mentionCursor: rest.mentionCursor,
    onMentionSelect: rest.onMentionSelect,
    showSkillPicker: rest.showSkillPicker,
    skills: rest.skills,
    skillSearch: rest.skillSearch,
    onSkillSearchChange: rest.onSkillSearchChange,
    onSkillSelect: rest.onSkillSelect,
    onSkillPickerClose: rest.onSkillPickerClose,
    showTemplates: rest.showTemplates,
    input,
    slashSelectedKey: rest.slashSelectedKey,
    onTemplateSkillSelect: rest.onTemplateSkillSelect,
    onTemplateSelect: rest.onTemplateSelect,
    onTemplatesClose: rest.onTemplatesClose,
    showSnippets: rest.showSnippets,
    currentUserId: rest.currentUserId,
    onSnippetInsert: rest.onSnippetInsert,
    onSnippetsClose: rest.onSnippetsClose,
    analyzeOpen: rest.analyzeOpen,
    analyzeInstruction: rest.analyzeInstruction,
    analyzeFile: rest.analyzeFile,
    analyzeRunning: rest.analyzeRunning,
    onAnalyzeInstructionChange: rest.onAnalyzeInstructionChange,
    onAnalyzeFileSelect: rest.onAnalyzeFileSelect,
    onAnalyzeClose: rest.onAnalyzeClose,
    onAnalyzeRun: rest.onAnalyzeRun,
    onAnalyzeFileTooLarge: rest.onAnalyzeFileTooLarge,
    saveSkillDraft: rest.saveSkillDraft,
    savingSkill: rest.savingSkill,
    onSaveSkillDraftChange: rest.onSaveSkillDraftChange,
    onSaveSkillClose: rest.onSaveSkillClose,
    onSaveSkill: rest.onSaveSkill,
    showFilePicker: rest.showFilePicker,
    files: rest.files,
    contextFiles: rest.contextFiles,
    filePickerSearch: rest.filePickerSearch,
    maxContextFiles: rest.maxContextFiles,
    onFilePickerSearchChange: rest.onFilePickerSearchChange,
    onFilePickerClose: rest.onFilePickerClose,
    onToggleContextFile: rest.onToggleContextFile,
    onClearContextFiles: rest.onClearContextFiles,
  };

  return (
    <>
      <LovableComposerOverlays {...overlayProps} />

      {!isLocked && (
        <LovableSecurityIssuesBar
          issueCount={securityIssueCount}
          noCredits={noCredits}
          onViewIssues={onViewSecurityIssues}
          onFixAll={onFixAllSecurityIssues}
        />
      )}

      {isLocked && <LovableLiveLockBanner />}

      <ChatTiptapInput
        ref={textareaRef as unknown as React.Ref<ChatInputHandle>}
        value={input}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onPasteText={onPasteText}
        placeholder={placeholder}
        className={`min-h-[60px] max-h-40 ${lovableComposerInputRingClass(input.length)}`}
        disabled={noCredits || isLocked}
      />

      <LovableComposerCharacterCounter length={input.length} />

      {!isLocked && !noCredits && (
        <LovableComposerEstimatedCredits
          mode={rest.mode}
          inputLength={input.length}
          hasAttachments={hasAttachments}
          fileCount={contextFileCount}
        />
      )}

      <LovableComposerBottomRow
        onOpenPanel={onOpenPanel}
        onScreenshot={rest.onScreenshot}
        onAddReference={rest.onAddReference}
        onAddSkill={rest.onAddSkill}
        onAnalyzeData={rest.onAnalyzeData}
        onAttach={rest.onAttach}
        isVisualEditActive={rest.isVisualEditActive}
        onVisualEditToggle={rest.onVisualEditToggle}
        onFocusPreview={rest.onFocusPreview}
        onToggleTemplates={rest.onToggleTemplates}
        mobileMode={rest.mobileMode}
        onToggleMobileMode={rest.onToggleMobileMode}
        mobileDisabled={rest.mobileDisabled}
        mode={rest.mode}
        clarifyFirst={rest.clarifyFirst}
        showClarifyToggle={rest.showClarifyToggle}
        onModeChange={rest.onModeChange}
        onToggleClarify={rest.onToggleClarify}
        multiAgent={rest.multiAgent}
        onMultiAgentChange={rest.onMultiAgentChange}
        modelManuallySelectedRef={rest.modelManuallySelectedRef}
        selectedModel={rest.selectedModel}
        onSelectModel={rest.onSelectModel}
        autoModel={rest.autoModel}
        activeModelLabel={rest.activeModelLabel}
        onTranscript={rest.onTranscript}
        showFileGenPicker={rest.showFileGenPicker}
        fileGenBusy={rest.fileGenBusy}
        fileGenDisabled={rest.fileGenDisabled}
        input={input}
        onToggleFileGenPicker={rest.onToggleFileGenPicker}
        onGenerateFile={rest.onGenerateFile}
        streaming={rest.streaming}
        canSend={rest.canSend}
        canQueue={rest.canQueue}
        queueDisabledReason={rest.queueDisabledReason}
        onSend={rest.onSend}
        onStop={rest.onStop}
      />
    </>
  );
}
