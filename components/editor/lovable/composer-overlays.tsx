"use client";

import { AnimatePresence } from "framer-motion";
import type { ProjectFile } from "@/types/database";
import { SnippetPicker } from "@/components/editor/snippet-picker";
import { LovableComposerMentionAutocomplete, type LovableMentionItem } from "./composer-mention-autocomplete";
import { LovableComposerSkillPicker } from "./composer-skill-picker";
import {
  LovableComposerTemplatePicker,
  type LovableSkillOption,
} from "./composer-template-picker";
import {
  LovableComposerAnalyzeModal,
  type LovableAnalyzeFileAttachment,
} from "./composer-analyze-modal";
import {
  LovableComposerSaveSkillModal,
  type LovableSaveSkillDraft,
} from "./composer-save-skill-modal";
import { LovableComposerContextFilePicker } from "./composer-context-file-picker";

export interface LovableComposerOverlaysProps {
  mentionOpen: boolean;
  isCrossProjectQuery: boolean;
  mentionItems: LovableMentionItem[];
  mentionCursor: number;
  onMentionSelect: (item: LovableMentionItem) => void;
  showSkillPicker: boolean;
  skills: LovableSkillOption[];
  skillSearch: string;
  onSkillSearchChange: (value: string) => void;
  onSkillSelect: (prompt: string, skillId: string) => void;
  onSkillPickerClose: () => void;
  showTemplates: boolean;
  input: string;
  slashSelectedKey: string | null;
  onTemplateSkillSelect: (prompt: string, skillId: string) => void;
  onTemplateSelect: (prompt: string) => void;
  onExploreDesignDirections?: () => void;
  onTemplatesClose: () => void;
  showSnippets: boolean;
  currentUserId: string;
  onSnippetInsert: (content: string) => void;
  onSnippetsClose: () => void;
  analyzeOpen: boolean;
  analyzeInstruction: string;
  analyzeFile: LovableAnalyzeFileAttachment | null;
  analyzeRunning: boolean;
  analyzeEnabled?: boolean;
  analyzeUnavailableReason?: string | null;
  onAnalyzeInstructionChange: (value: string) => void;
  onAnalyzeFileSelect: (file: LovableAnalyzeFileAttachment | null) => void;
  onAnalyzeClose: () => void;
  onAnalyzeRun: () => void;
  onAnalyzeFileTooLarge: () => void;
  saveSkillDraft: LovableSaveSkillDraft | null;
  savingSkill: boolean;
  onSaveSkillDraftChange: (draft: LovableSaveSkillDraft | null) => void;
  onSaveSkillClose: () => void;
  onSaveSkill: () => void;
  showFilePicker: boolean;
  files: ProjectFile[];
  contextFiles: ProjectFile[];
  filePickerSearch: string;
  maxContextFiles: number;
  onFilePickerSearchChange: (value: string) => void;
  onFilePickerClose: () => void;
  onToggleContextFile: (file: ProjectFile) => void;
  onClearContextFiles: () => void;
}

/** Popovers and modals layered above the composer textarea. */
export function LovableComposerOverlays({
  mentionOpen,
  isCrossProjectQuery,
  mentionItems,
  mentionCursor,
  onMentionSelect,
  showSkillPicker,
  skills,
  skillSearch,
  onSkillSearchChange,
  onSkillSelect,
  onSkillPickerClose,
  showTemplates,
  input,
  slashSelectedKey,
  onTemplateSkillSelect,
  onTemplateSelect,
  onExploreDesignDirections,
  onTemplatesClose,
  showSnippets,
  currentUserId,
  onSnippetInsert,
  onSnippetsClose,
  analyzeOpen,
  analyzeInstruction,
  analyzeFile,
  analyzeRunning,
  analyzeEnabled = true,
  analyzeUnavailableReason = null,
  onAnalyzeInstructionChange,
  onAnalyzeFileSelect,
  onAnalyzeClose,
  onAnalyzeRun,
  onAnalyzeFileTooLarge,
  saveSkillDraft,
  savingSkill,
  onSaveSkillDraftChange,
  onSaveSkillClose,
  onSaveSkill,
  showFilePicker,
  files,
  contextFiles,
  filePickerSearch,
  maxContextFiles,
  onFilePickerSearchChange,
  onFilePickerClose,
  onToggleContextFile,
  onClearContextFiles,
}: LovableComposerOverlaysProps) {
  return (
    <>
      <LovableComposerMentionAutocomplete
        open={mentionOpen}
        isCrossProjectQuery={isCrossProjectQuery}
        items={mentionItems}
        selectedIndex={mentionCursor}
        onSelect={onMentionSelect}
      />

      <LovableComposerSkillPicker
        open={showSkillPicker}
        skills={skills}
        search={skillSearch}
        onSearchChange={onSkillSearchChange}
        onSelect={(prompt, skillId) => {
          onSkillSelect(prompt, skillId);
          onSkillPickerClose();
        }}
        onClose={onSkillPickerClose}
      />

      <LovableComposerTemplatePicker
        open={showTemplates}
        input={input}
        skills={skills}
        selectedKey={slashSelectedKey}
        onSelectSkill={(prompt, skillId) => {
          onTemplateSkillSelect(prompt, skillId);
          onTemplatesClose();
        }}
        onSelectTemplate={(prompt) => {
          onTemplateSelect(prompt);
          onTemplatesClose();
        }}
        onExploreDesignDirections={() => {
          onExploreDesignDirections?.();
          onTemplatesClose();
        }}
      />

      <AnimatePresence>
        {showSnippets && (
          <SnippetPicker
            currentUserId={currentUserId}
            onInsert={(content) => {
              onSnippetInsert(content);
              onSnippetsClose();
            }}
            onClose={onSnippetsClose}
          />
        )}
      </AnimatePresence>

      <LovableComposerAnalyzeModal
        open={analyzeOpen}
        instruction={analyzeInstruction}
        file={analyzeFile}
        running={analyzeRunning}
        analyzeEnabled={analyzeEnabled}
        analyzeUnavailableReason={analyzeUnavailableReason}
        onInstructionChange={onAnalyzeInstructionChange}
        onFileSelect={onAnalyzeFileSelect}
        onFileClear={() => onAnalyzeFileSelect(null)}
        onClose={onAnalyzeClose}
        onRun={onAnalyzeRun}
        onFileTooLarge={onAnalyzeFileTooLarge}
      />

      <LovableComposerSaveSkillModal
        draft={saveSkillDraft}
        saving={savingSkill}
        onDraftChange={onSaveSkillDraftChange}
        onClose={onSaveSkillClose}
        onSave={onSaveSkill}
      />

      <LovableComposerContextFilePicker
        open={showFilePicker}
        files={files}
        contextFiles={contextFiles}
        search={filePickerSearch}
        maxFiles={maxContextFiles}
        onSearchChange={onFilePickerSearchChange}
        onClose={onFilePickerClose}
        onToggleFile={onToggleContextFile}
        onClearAll={onClearContextFiles}
      />
    </>
  );
}
