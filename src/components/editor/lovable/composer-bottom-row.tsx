
import type { MutableRefObject,Ref } from "react";
import type { EditorMode,LeftPanel } from "@/components/editor/editor-layout";
import type { OpenRouterModelId } from "@/lib/ai/openrouter-models";
import { VoiceMode, type VoiceModeHandle } from "@/components/editor/voice-mode";
import {
LovableComposerContextMenu,
LovableVisualEditsButton,
type ComposerContextMenuActions,
} from "./composer-toolbar";
import { LovableComposerModeRow } from "./composer-mode-row";
import { LovableComposerMobileToggle } from "./composer-mobile-toggle";
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
  onDesignDirections?: () => void;
  onAttach: () => void;
  /** Hidden file input — Lovable dump places it in the bottom row before Chat actions. */
  fileInputRef?: Ref<HTMLInputElement>;
  onImageAttach?: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  /** Lets a keyboard shortcut (Alt/Option+V) drive the same mic button the
   *  user would click — see voice-mode.tsx's VoiceModeHandle. */
  voiceModeRef?: Ref<VoiceModeHandle>;
  showFileGenPicker: boolean;
  fileGenBusy: string | null;
  fileGenDisabled: boolean;
  fileGenBinaryEnabled?: boolean;
  fileGenBinaryReason?: string | null;
  input: string;
  /** Opens the model / multi-agent menu — see composer-toolbar for why this exists. */
  showModelMenu?: boolean;
  onToggleModelMenu?: () => void;
  onToggleFileGenPicker: () => void;
  onGenerateFile: (fmt: LovableFileGenFormat) => void;
  streaming: boolean;
  canSend: boolean;
  canQueue: boolean;
  queueDisabledReason?: string;
  onSend: () => void;
  onStop: () => void;
}

/**
 * Lovable dump bottom row:
 * Attach (hidden file) → Chat actions → Build → Voice → Send
 */
export function LovableComposerBottomRow({
  onOpenPanel,
  onScreenshot,
  onAddReference,
  onAddSkill,
  onAnalyzeData,
  onDesignDirections,
  onAttach,
  fileInputRef,
  onImageAttach,
  isVisualEditActive,
  onVisualEditToggle,
  onFocusPreview,
  onToggleTemplates,
  mobileMode = false,
  onToggleMobileMode,
  mobileDisabled = false,
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
  voiceModeRef,
  showFileGenPicker,
  fileGenBusy,
  fileGenDisabled,
  fileGenBinaryEnabled = true,
  fileGenBinaryReason = null,
  input,
  showModelMenu = false,
  onToggleModelMenu,
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
    mode,
    onModeChange,
    onScreenshot,
    onAddReference,
    onAddSkill,
    onAnalyzeData,
    onDesignDirections,
    onAttach,
    onVisualEditToggle: () => {
      if (onVisualEditToggle) {
        onVisualEditToggle();
        onFocusPreview?.();
        return;
      }
      onToggleTemplates();
    },
    isVisualEditActive,
    onToggleMobileMode,
    mobileMode,
    mobileDisabled,
    onToggleFileGenPicker,
    showFileGenPicker,
    onToggleModelMenu,
    showModelMenu,
  };

  return (
    // Lovable dump: @container flex flex-wrap items-center gap-1 (card provides p-3)
    <div className="flex flex-wrap items-center gap-1 safe-area-bottom safe-area-x">
      {fileInputRef && onImageAttach && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,*/*"
          className="hidden"
          aria-label="Attach files"
          onChange={onImageAttach}
        />
      )}

      <LovableComposerContextMenu actions={contextActions} />

      {/* Web / React Native target — persistent chip (also in the "+" menu) */}
      <LovableComposerMobileToggle
        active={mobileMode}
        disabled={mobileDisabled}
        onToggle={onToggleMobileMode}
      />

      {/* Lovable dump footer: plus | spacer | mic | send. Visual edits, clarify,
          model menu and file-gen live in the "+" menu / open on demand. */}
      {isVisualEditActive && (
        <LovableVisualEditsButton
          active
          onClick={() => {
            if (onVisualEditToggle) {
              onVisualEditToggle();
              onFocusPreview?.();
              return;
            }
            onToggleTemplates();
          }}
        />
      )}

      <div className="flex-1" />

      {(mode === "build" || mode === "agent") && showClarifyToggle && (
        <LovableComposerModeRow
          mode={mode}
          clarifyFirst={clarifyFirst}
          showClarifyToggle={showClarifyToggle}
          onModeChange={(m) => onModeChange?.(m)}
          onToggleClarify={onToggleClarify}
        />
      )}

      {/* Model menu + file-gen appear only while engaged (opened from the + menu).
          `showModelMenu` is the entry point that makes this reachable at all —
          without it the render condition and the only controls that satisfy it
          lived inside each other, so neither the model picker nor multi-agent
          could ever be opened. */}
      <div className="hidden sm:contents">
        {(showModelMenu || multiAgent || modelManuallySelectedRef.current) && (
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
        )}
        {showFileGenPicker && (
          <LovableComposerFileGenPicker
            open={showFileGenPicker}
            busy={!!fileGenBusy}
            disabled={fileGenDisabled}
            input={input}
            binaryEnabled={fileGenBinaryEnabled}
            binaryDisabledReason={fileGenBinaryReason}
            onToggle={onToggleFileGenPicker}
            onGenerate={onGenerateFile}
          />
        )}
      </div>

      <VoiceMode ref={voiceModeRef} onTranscript={onTranscript} />

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
