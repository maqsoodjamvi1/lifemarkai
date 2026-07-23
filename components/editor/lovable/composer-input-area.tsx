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
  freeFixesRemaining?: number | null;
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
  freeFixesRemaining = null,
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
    onExploreDesignDirections: rest.onExploreDesignDirections,
    onTemplatesClose: rest.onTemplatesClose,
    showSnippets: rest.showSnippets,
    currentUserId: rest.currentUserId,
    onSnippetInsert: rest.onSnippetInsert,
    onSnippetsClose: rest.onSnippetsClose,
    analyzeOpen: rest.analyzeOpen,
    analyzeInstruction: rest.analyzeInstruction,
    analyzeFile: rest.analyzeFile,
    analyzeRunning: rest.analyzeRunning,
    analyzeEnabled: rest.analyzeEnabled,
    analyzeUnavailableReason: rest.analyzeUnavailableReason,
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
          freeFixesRemaining={freeFixesRemaining}
          onViewIssues={onViewSecurityIssues}
          onFixAll={onFixAllSecurityIssues}
        />
      )}

      {isLocked && <LovableLiveLockBanner />}

      {/* Lovable dump: #chatinput CSS-grid host + always-mounted sibling placeholder */}
      <div
        id="chatinput"
        className={`relative grid w-full flex-1 min-h-[40px] max-h-[max(35svh,5rem)] ${lovableComposerInputRingClass(input.length)}`}
      >
        <ChatTiptapInput
          ref={textareaRef as unknown as React.Ref<ChatInputHandle>}
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onPasteText={onPasteText}
          placeholder=""
          className="col-start-1 row-start-1 w-full min-w-0 min-h-[40px] max-h-[max(35svh,5rem)] overflow-y-auto select-text"
          disabled={noCredits || isLocked}
        />
        <span
          aria-hidden
          className={`pointer-events-none col-start-1 row-start-1 px-2 pt-2 pb-1 text-[16px] leading-snug md:text-base text-[var(--fg-tertiary)] select-none transition-opacity animate-in fade-in-0 duration-500 ${
            input.trim() ? "opacity-0" : "opacity-100"
          }`}
        >
          {placeholder || "Ask LifemarkAI..."}
        </span>
      </div>

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
        onDesignDirections={rest.onDesignDirections}
        onAttach={rest.onAttach}
        fileInputRef={rest.fileInputRef}
        onImageAttach={rest.onImageAttach}
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
