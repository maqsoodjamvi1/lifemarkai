"use client";

import type { MutableRefObject } from "react";
import type { EditorMode, LeftPanel } from "@/components/editor/editor-layout";
import type { OpenRouterModelId } from "@/lib/ai/openrouter-models";
import { VoiceMode } from "@/components/editor/voice-mode";
import {
  LovableComposerContextMenu,
  LovableVisualEditsButton,
  type ComposerContextMenuActions,
} from "./composer-toolbar";
import { LovableComposerMobileToggle } from "./composer-mobile-toggle";
import { LovableComposerModeRow } from "./composer-mode-row";
import { LovableComposerModelMenu } from "./composer-model-menu";
import { LovableComposerFileGenPicker } from "./composer-file-gen-picker";
import type { LovableFileGenFormat } from "./composer-file-gen-picker";
import { LovableComposerSendControls } from "./composer-send-controls";

export interface LovableComposerBottomRowProps {
  onOpenPanel?: (panel: LeftPanel) => void;
  onScreenshot: () => void;
  onAddReference: () => void;
  onAddSkill: () => void;
  onAnalyzeData: () => void;
  onAttach: () => void;
  isVisualEditActive?: boolean;
  onVisualEditToggle?: () => void;
  onFocusPreview?: () => void;
  onToggleTemplates: () => void;
  mobileMode: boolean;
  onToggleMobileMode: () => void;
  mobileDisabled: boolean;
  mode: EditorMode;
  clarifyFirst: boolean;
  showClarifyToggle: boolean;
  onModeChange?: (mode: EditorMode) => void;
  onToggleClarify: () => void;
  multiAgent: boolean;
  onMultiAgentChange: (value: boolean) => void;
  modelManuallySelectedRef: MutableRefObject<boolean>;
  selectedModel: OpenRouterModelId;
  onSelectModel: (model: OpenRouterModelId, manual: boolean) => void;
  autoModel: OpenRouterModelId;
  activeModelLabel: string;
  onTranscript: (text: string) => void;
  showFileGenPicker: boolean;
  fileGenBusy: string | null;
  fileGenDisabled: boolean;
  input: string;
  onToggleFileGenPicker: () => void;
  onGenerateFile: (fmt: LovableFileGenFormat) => void;
  streaming: boolean;
  canSend: boolean;
  canQueue: boolean;
  queueDisabledReason?: string;
  onSend: () => void;
  onStop: () => void;
}

/** Lovable-style bottom action row inside the composer input card. */
export function LovableComposerBottomRow({
  onOpenPanel,
  onScreenshot,
  onAddReference,
  onAddSkill,
  onAnalyzeData,
  onAttach,
  isVisualEditActive,
  onVisualEditToggle,
  onFocusPreview,
  onToggleTemplates,
  mobileMode,
  onToggleMobileMode,
  mobileDisabled,
  mode,
  clarifyFirst,
  showClarifyToggle,
  onModeChange,
  onToggleClarify,
  multiAgent,
  onMultiAgentChange,
  modelManuallySelectedRef,
  selectedModel,
  onSelectModel,
  autoModel,
  activeModelLabel,
  onTranscript,
  showFileGenPicker,
  fileGenBusy,
  fileGenDisabled,
  input,
  onToggleFileGenPicker,
  onGenerateFile,
  streaming,
  canSend,
  canQueue,
  queueDisabledReason,
  onSend,
  onStop,
}: LovableComposerBottomRowProps) {
  const contextActions: ComposerContextMenuActions = {
    onOpenPanel,
    onScreenshot,
    onAddReference,
    onAddSkill,
    onAnalyzeData,
    onAttach,
  };

  return (
    <div className="flex items-center gap-1.5 px-3 pb-3 pt-1 safe-area-bottom safe-area-x">
      <LovableComposerContextMenu actions={contextActions} />

      <LovableVisualEditsButton
        active={!!isVisualEditActive}
        onClick={() => {
          if (onVisualEditToggle) {
            onVisualEditToggle();
            onFocusPreview?.();
            return;
          }
          onToggleTemplates();
        }}
      />

      <div className="flex-1" />

      <LovableComposerMobileToggle
        active={mobileMode}
        disabled={mobileDisabled}
        onToggle={onToggleMobileMode}
      />

      <LovableComposerModeRow
        mode={mode}
        clarifyFirst={clarifyFirst}
        showClarifyToggle={showClarifyToggle}
        onModeChange={(m) => onModeChange?.(m)}
        onToggleClarify={onToggleClarify}
      />

      <div className="flex items-center gap-1.5 min-w-0">
        <LovableComposerModelMenu
          mode={mode}
          onModeChange={onModeChange}
          multiAgent={multiAgent}
          onMultiAgentChange={onMultiAgentChange}
          modelManuallySelectedRef={modelManuallySelectedRef}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          autoModel={autoModel}
          activeModelLabel={activeModelLabel}
        />
      </div>

      <VoiceMode onTranscript={onTranscript} />

      <LovableComposerFileGenPicker
        open={showFileGenPicker}
        busy={!!fileGenBusy}
        disabled={fileGenDisabled}
        input={input}
        onToggle={onToggleFileGenPicker}
        onGenerate={onGenerateFile}
      />

      <LovableComposerSendControls
        streaming={streaming}
        canSend={canSend}
        canQueue={canQueue}
        queueDisabledReason={queueDisabledReason}
        onSend={onSend}
        onStop={onStop}
      />
    </div>
  );
}
